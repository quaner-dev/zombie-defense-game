import type { MapModel } from './MapModel.js';
import type { WaveSpawnEventData } from './WaveManager.js';
import type { BattleEvent } from './types.js';
import type { UnitStore } from './UnitStore.js';
import { getZombieModule } from './units/index.js';

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

/** Turns scheduled wave declarations into time-based admissions at the map edge. */
export class SpawnSystem {
  private pending: PendingWave[] = [];
  private spawned = 0;
  private offsets = new Map<string, number>();

  public constructor(private readonly store: UnitStore, private readonly map: MapModel) {}

  public reset(): void { this.pending = []; this.spawned = 0; this.offsets.clear(); }
  public get spawnedCount(): number { return this.spawned; }
  public hasPending(): boolean { return this.pending.length > 0; }

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
    const due = this.pending.sort((a, b) => a.nextBatchTime_s - b.nextBatchTime_s || a.waveIndex - b.waveIndex);
    for (const wave of due) {
      while (wave.nextBatchTime_s <= time_s + 1e-9 && wave.spawns.some(item => item.remaining > 0)) {
        const batchSpawns: WaveSpawnEventData['spawns'] = [];
        let admitted = 0;
        while (admitted < wave.batchSize && wave.spawns.some(item => item.remaining > 0)) {
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
        if (admitted > 0) events.push({ type: 'zombie_batch_spawn', time_s: wave.nextBatchTime_s, data: {
          waveIndex: wave.waveIndex, batchIndex: wave.batchIndex++, batchSize: admitted, spawns: batchSpawns,
        }});
        wave.nextBatchTime_s += wave.batchInterval_s;
        if (wave.batchInterval_s === 0) {
          // Zero interval is a single pulse; continue filling it until exhausted.
          wave.nextBatchTime_s = wave.spawns.some(item => item.remaining > 0) ? time_s : Infinity;
        }
      }
    }
    this.pending = this.pending.filter(wave => wave.spawns.some(item => item.remaining > 0));
    return events;
  }
}
