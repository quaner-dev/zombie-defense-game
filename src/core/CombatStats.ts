import type { CombatStat, CombatStatsSnapshot, HumanUnitType, Unit, UnitType } from './types.js';

const HUMAN_TYPES: readonly HumanUnitType[] = ['rifleman', 'flamethrower', 'shield', 'sniper', 'engineer'];

function empty(unitType: HumanUnitType): CombatStat {
  return { unitType, spawned: 0, aliveAtEnd: 0, kills: 0, damage: 0 };
}

export class CombatStats {
  private readonly byId = new Map<string, { unitType: HumanUnitType; damage: number; kills: number }>();
  private readonly spawned = new Map<HumanUnitType, number>();

  public reset(): void {
    this.byId.clear();
    this.spawned.clear();
  }

  public register(unit: Unit): void {
    if (unit.faction !== 'human') return;
    const unitType = unit.unitType as HumanUnitType;
    this.byId.set(unit.id, { unitType, damage: 0, kills: 0 });
    this.spawned.set(unitType, (this.spawned.get(unitType) ?? 0) + 1);
  }

  public recordDamage(sourceId: string, sourceUnitType: UnitType, amount: number): void {
    if (sourceUnitType === 'normal_zombie' || sourceUnitType === 'fat_zombie' || sourceUnitType === 'zombie_mother' || sourceUnitType === 'gut_zombie') return;
    const existing = this.byId.get(sourceId);
    if (!existing) this.byId.set(sourceId, { unitType: sourceUnitType as HumanUnitType, damage: 0, kills: 0 });
    const stat = this.byId.get(sourceId)!;
    stat.damage += amount;
  }

  public recordKill(sourceId: string, sourceUnitType: UnitType): void {
    if (sourceUnitType === 'normal_zombie' || sourceUnitType === 'fat_zombie' || sourceUnitType === 'zombie_mother' || sourceUnitType === 'gut_zombie') return;
    const existing = this.byId.get(sourceId);
    if (!existing) this.byId.set(sourceId, { unitType: sourceUnitType as HumanUnitType, damage: 0, kills: 0 });
    this.byId.get(sourceId)!.kills += 1;
  }

  public snapshot(units: readonly Unit[]): CombatStatsSnapshot {
    const result = Object.fromEntries(HUMAN_TYPES.map(unitType => [unitType, empty(unitType)])) as Record<HumanUnitType, CombatStat>;
    for (const type of HUMAN_TYPES) result[type].spawned = this.spawned.get(type) ?? 0;
    for (const unit of units) {
      if (unit.faction === 'human' && unit.active && unit.hp > 0 && unit.state !== 'Dead') {
        result[unit.unitType as HumanUnitType].aliveAtEnd += 1;
      }
    }
    for (const stat of this.byId.values()) {
      result[stat.unitType].damage += stat.damage;
      result[stat.unitType].kills += stat.kills;
    }
    return { byUnitType: result };
  }
}
