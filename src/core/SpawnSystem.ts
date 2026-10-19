import type { MapModel } from './MapModel.js';
import type { WaveSpawnEventData } from './WaveManager.js';
import type { BattleEvent } from './types.js';
import type { UnitStore } from './UnitStore.js';
import { getZombieModule } from './units/index.js';
import { cloneData } from './cloneData.js';

interface PendingSpawn { spawn: WaveSpawnEventData['spawns'][number]; remaining: number }
interface PendingWave {
  waveIndex: number;
  nextBatchTime_s: number;
  batchSize: number;
  batchInterval_s: number;
  batchIndex: number;
  cursor: number;
  spawns: PendingSpawn[];
}

export interface SpawnLimits { maxBatchSize: number; minInterval_s: number }

export interface ContinuousSpawnDefinition {
  totalTarget: number;
  interval_s: number;
  batchSize: number;
  spawnPoints: string[];
  distribution: Record<string, number>;
  specialRatios?: { gut_zombie?: number };
  initialInterval_s?: number; minInterval_s?: number; rampDuration_s?: number;
  sides?: string[];
  continuousEventsOnly?: boolean;
}

/** Turns scheduled wave declarations into time-based admissions at the map edge. */
export class SpawnSystem {
  private limits: SpawnLimits | undefined;
  private nextAdmission_s = 0;
  private pending: PendingWave[] = [];
  private spawned = 0;
  private offsets = new Map<string, number>();
  private continuous: ContinuousSpawnDefinition | null = null;
  private nextContinuousTime_s = 0;
  private continuousGenerated = 0;
  private continuousBatchIndex = 0;
  private continuousGutSpawned = 0;
  private continuousCompletionEmitted = false;
  private continuousPointCounts = new Map<string, number>();

  public constructor(private readonly store: UnitStore, private readonly map: MapModel) {}

  public reset(): void {
    this.limits = undefined; this.nextAdmission_s = 0;
    this.pending = []; this.spawned = 0; this.offsets.clear(); this.continuous = null;
    this.nextContinuousTime_s = 0; this.continuousGenerated = 0;
    this.continuousBatchIndex = 0;
    this.continuousGutSpawned = 0; this.continuousCompletionEmitted = false;
    this.continuousPointCounts.clear();
  }
  public configureLimits(limits?: SpawnLimits): void {
    if (limits && (!Number.isSafeInteger(limits.maxBatchSize) || limits.maxBatchSize < 1 ||
        !Number.isFinite(limits.minInterval_s) || limits.minInterval_s <= 0)) throw new Error('Invalid spawn limits');
    this.limits = limits ? { ...limits } : undefined; this.nextAdmission_s = 0;
  }
  public get spawnedCount(): number { return this.spawned; }
  public hasPending(): boolean { return this.pending.length > 0; }
  public configureContinuous(definition: ContinuousSpawnDefinition): void {
    if (!Number.isSafeInteger(definition.totalTarget) || definition.totalTarget < 0) {
      throw new Error('Continuous spawn target must be a non-negative integer');
    }
    if (!Number.isSafeInteger(definition.batchSize) || definition.batchSize < 1) {
      throw new Error('Continuous spawn batch size must be a positive integer');
    }
    const intervals = [definition.interval_s, definition.initialInterval_s ?? definition.interval_s,
      definition.minInterval_s ?? definition.interval_s];
    if (intervals.some(interval => !Number.isFinite(interval) || interval <= 0)) {
      throw new Error('Continuous spawn intervals must be finite and positive');
    }
    const ramp = definition.rampDuration_s ?? 0;
    if (!Number.isFinite(ramp) || ramp < 0) {
      throw new Error('Continuous spawn ramp duration must be finite and non-negative');
    }
    if (!definition.spawnPoints.length || new Set(definition.spawnPoints).size !== definition.spawnPoints.length) {
      throw new Error('Continuous spawn points must be non-empty and unique');
    }
    for (const point of definition.spawnPoints) {
      if (!this.map.getSpawnPoint(point)) throw new Error(`Unknown continuous spawn point: ${point}`);
    }
    for (const [point, weight] of Object.entries(definition.distribution)) {
      if (!definition.spawnPoints.includes(point) || !Number.isFinite(weight) || weight < 0) {
        throw new Error(`Invalid continuous spawn distribution: ${point}`);
      }
    }
    const gutRatio = definition.specialRatios?.gut_zombie ?? 0;
    if (!Number.isFinite(gutRatio) || gutRatio < 0 || gutRatio > 1) {
      throw new Error('Continuous spawn gut zombie ratio must be between zero and one');
    }
    this.continuous = cloneData(definition);
    this.nextContinuousTime_s = 0;
    this.continuousGenerated = 0;
    this.continuousBatchIndex = 0;
    this.continuousGutSpawned = 0;
    this.continuousCompletionEmitted = false;
    this.continuousPointCounts.clear();
  }
  public isGenerationComplete(): boolean {
    return this.continuous ? this.continuousGenerated >= this.continuous.totalTarget : false;
  }
  public isContinuous(): boolean { return this.continuous !== null; }

  public enqueue(event: WaveSpawnEventData): void {
    this.pending.push({
      waveIndex: event.waveIndex,
      nextBatchTime_s: event.battleTime_s,
      batchSize: event.batchSize ?? Number.MAX_SAFE_INTEGER,
      batchInterval_s: event.batchInterval_s ?? 0,
      batchIndex: 0,
      cursor: 0,
      spawns: event.spawns.map(spawn => ({ spawn: { ...spawn }, remaining: spawn.count })),
    });
  }

  public update(time_s: number): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (!Number.isFinite(time_s) || time_s < 0 || (this.limits && time_s + 1e-9 < this.nextAdmission_s)) return events;
    if (this.continuous) {
      while (this.continuousGenerated < this.continuous.totalTarget && this.nextContinuousTime_s <= time_s + 1e-9) {
        const remaining = this.continuous.totalTarget - this.continuousGenerated;
        const count = Math.min(this.continuous.batchSize, remaining, this.limits?.maxBatchSize ?? Infinity);
        const admittedAt = this.limits ? time_s : this.nextContinuousTime_s;
        const specialTarget = Math.ceil(this.continuous.totalTarget * (this.continuous.specialRatios?.gut_zombie ?? 0));
        const batchSpawns: WaveSpawnEventData['spawns'] = [];
        for (let index = 0; index < count; index++) {
          const pointIndex = this.weightedSpawnPointIndex(this.continuousGenerated);
          const spawnPoint = this.continuous.spawnPoints[pointIndex];
          const route = this.map.routeIds()[pointIndex % Math.max(1, this.map.routeIds().length)];
          const unitType = this.continuousGutSpawned < specialTarget ? 'gut_zombie' : 'normal_zombie';
          const key = spawnPoint;
          const offset = this.offsets.get(key) ?? 0;
          const positions = this.map.spawnPositions(route, 1, spawnPoint, offset);
          this.offsets.set(key, offset + positions.length);
          for (const position of positions) {
            const radius = getZombieModule(unitType).getStats().diameter_px / 2;
            this.store.spawn(unitType, this.map.walkablePoint(position, radius), route, spawnPoint);
            this.spawned++;
          }
          this.continuousGenerated++;
          if (unitType === 'gut_zombie') this.continuousGutSpawned++;
          const existing = batchSpawns.find(item => item.unitType === unitType && item.spawnPoint === spawnPoint);
          if (existing) existing.count++;
          else batchSpawns.push({ unitType, route, spawnPoint, count: 1 });
        }
        for (const spawn of batchSpawns) {
          const side = this.map.getSpawnPoint(spawn.spawnPoint!)?.side;
          if (side) events.push({ type: 'continuous_zombie_spawn', time_s: admittedAt,
            data: { generated: this.continuousGenerated, target: this.continuous.totalTarget, side, count: spawn.count } });
        }
        if (!this.continuous.continuousEventsOnly) events.push({ type: 'zombie_batch_spawn', time_s: admittedAt, data: {
          waveIndex: 0, batchIndex: this.continuousBatchIndex,
          batchSize: count, spawns: batchSpawns,
        } });
        this.continuousBatchIndex++;
        const initial = this.continuous.initialInterval_s ?? this.continuous.interval_s;
        const minimum = this.continuous.minInterval_s ?? this.continuous.interval_s;
        const ramp = this.continuous.rampDuration_s ?? 0;
        const progress = ramp > 0 ? Math.min(1, this.nextContinuousTime_s / ramp) : 1;
        const interval = initial + (minimum - initial) * progress;
        this.nextContinuousTime_s += interval;
        if (this.limits) {
          // Preserve the ordinary schedule, but never replay an overdue backlog.
          if (this.nextContinuousTime_s <= time_s + 1e-9) this.nextContinuousTime_s = time_s + interval;
          this.nextAdmission_s = time_s + this.limits.minInterval_s;
          break;
        }
      }
      if (this.isGenerationComplete() && !this.continuousCompletionEmitted) {
        this.continuousCompletionEmitted = true;
        events.push({ type: 'generation_complete', time_s, data: {
          generated: this.continuousGenerated, target: this.continuous.totalTarget,
        } });
      }
      return events;
    }
    const due = this.pending.sort((a, b) => a.nextBatchTime_s - b.nextBatchTime_s || a.waveIndex - b.waveIndex);
    for (const wave of due) {
      while (wave.nextBatchTime_s <= time_s + 1e-9 && wave.spawns.some(item => item.remaining > 0)) {
        const batchSpawns: WaveSpawnEventData['spawns'] = [];
        let admitted = 0;
        while (admitted < Math.min(wave.batchSize, this.limits?.maxBatchSize ?? Infinity) && wave.spawns.some(item => item.remaining > 0)) {
          let selected: PendingSpawn | undefined;
          let selectedIndex = -1;
          for (let offset = 0; offset < wave.spawns.length; offset++) {
            const index = (wave.cursor + offset) % wave.spawns.length;
            if (wave.spawns[index].remaining > 0) { selected = wave.spawns[index]; selectedIndex = index; break; }
          }
          if (!selected) break;
          const spawn = selected.spawn;
          const key = spawn.spawnPoint ?? `route:${spawn.route}`;
          const offset = this.offsets.get(key) ?? 0;
          const positions = this.map.spawnPositions(spawn.route, 1, spawn.spawnPoint, offset);
          this.offsets.set(key, offset + positions.length);
          for (const position of positions) {
            const radius = getZombieModule(spawn.unitType).getStats().diameter_px / 2;
            this.store.spawn(spawn.unitType, this.map.walkablePoint(position, radius), spawn.route, spawn.spawnPoint ?? null);
            this.spawned++;
          }
          selected.remaining--; admitted++; wave.cursor = (selectedIndex + 1) % wave.spawns.length;
          const existing = batchSpawns.find(item => item.route === spawn.route && item.spawnPoint === spawn.spawnPoint && item.unitType === spawn.unitType);
          if (existing) existing.count++; else batchSpawns.push({ ...spawn, count: 1 });
        }
        if (admitted > 0) events.push({ type: 'zombie_batch_spawn', time_s: this.limits ? time_s : wave.nextBatchTime_s, data: {
          waveIndex: wave.waveIndex, batchIndex: wave.batchIndex++, batchSize: admitted, spawns: batchSpawns,
        }});
        wave.nextBatchTime_s = (this.limits ? time_s : wave.nextBatchTime_s) + wave.batchInterval_s;
        if (this.limits) {
          this.nextAdmission_s = time_s + this.limits.minInterval_s;
          break;
        }
        if (wave.batchInterval_s === 0) {
          // Zero interval is a single pulse; continue filling it until exhausted.
          wave.nextBatchTime_s = wave.spawns.some(item => item.remaining > 0) ? time_s : Infinity;
        }
      }
      if (this.limits && time_s + 1e-9 < this.nextAdmission_s) break;
    }
    this.pending = this.pending.filter(wave => wave.spawns.some(item => item.remaining > 0));
    return events;
  }

  private weightedSpawnPointIndex(sequence: number): number {
    const points = this.continuous!.spawnPoints;
    const total = points.reduce((sum, point) => sum + Math.max(0, this.continuous!.distribution[point] ?? 0), 0);
    if (total <= 0) return sequence % points.length;
    let selected = 0, greatestDeficit = -Infinity;
    points.forEach((point, index) => {
      const weight = Math.max(0, this.continuous!.distribution[point] ?? 0) / total;
      const deficit = (sequence + 1) * weight - (this.continuousPointCounts.get(point) ?? 0);
      if (deficit > greatestDeficit) { selected = index; greatestDeficit = deficit; }
    });
    const chosen = points[selected];
    this.continuousPointCounts.set(chosen, (this.continuousPointCounts.get(chosen) ?? 0) + 1);
    return selected;
  }
}
