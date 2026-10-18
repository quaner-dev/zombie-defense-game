# 后续版本实现规格

> 状态：已根据 `11-followup-unit-and-balance-discussion.md` 收敛为开发规格。本文定义代码开发时必须遵守的接口、状态、事件、配置和验收边界；没有写入本文的参数不得在实现中自行改变。
>
> 适用范围：结算统计、9 人小队、狙击兵、工兵机枪、盾兵强化、喷火兵重做、僵尸堆叠、楼下持续刷怪、巨胃丧尸。

## 1. 开发边界与交付顺序

战斗规则继续由 `src/core` 负责，`assets/scripts/adapter` 只负责输入、绘制和 HUD。配置由 `config/*.json` 提供，修改后运行 `npm run sync:core` 生成 Cocos 核心包。不得在表现层复制伤害、目标选择、过热或生成计数逻辑。

按以下顺序开发，每一步都应能单独通过测试：

1. 扩展类型、单位状态、统计快照和事件契约。
2. 将小队上限和初始编成改为 9 人，先保持旧武器行为可运行。
3. 实现实际伤害/击杀统计和结算表聚合显示。
4. 关闭僵尸单位互斥分离，补尸群重叠测试。
5. 实现狙击兵穿透攻击。
6. 实现盾兵尺寸、手枪和来源位置减伤。
7. 实现喷火兵收火、重新放火、过热和短距离范围伤害。
8. 实现工兵架设、拆卸、机枪过热和自动瞄准。
9. 将楼下调度改为持续刷怪并加入 720 停止条件。
10. 实现巨胃吞入、抛掷、自爆和死亡释放。
11. 更新 Cocos 视觉、HUD、回归测试和验收报告。

## 2. 类型和状态契约

### 2.1 单位类型

在 `src/core/types.ts` 中扩展：

```ts
export type HumanUnitType =
  | 'rifleman' | 'flamethrower' | 'shield' | 'sniper' | 'engineer';

export type ZombieUnitType =
  | 'normal_zombie' | 'fat_zombie' | 'zombie_mother' | 'gut_zombie';
```

`gut_zombie` 是实际战场单位；被吞入的普通丧尸不是新类型，保留原 `unitType`，通过库存记录标记为暂存。

### 2.2 单位状态

现有 `UnitState` 增加以下状态：

```ts
type UnitState =
  | 'Deploying' | 'Deployed' | 'Dismantling'
  | 'RetractingFlame' | 'ReleasingFlame'
  | 'Overheated' | 'Cooling' | 'Suicidal' | 'StoredInGut'
  | ExistingUnitStates;
```

状态语义：

| 状态 | 可移动 | 可攻击 | 可被攻击 | 说明 |
|---|---:|---:|---:|---|
| `Deploying` | 否 | 否 | 是 | 工兵架设倒计时 |
| `Deployed` | 否 | 是 | 是 | 工兵机枪已架设 |
| `Dismantling` | 否 | 否 | 是 | 工兵收起机枪，清除目标 |
| `RetractingFlame` | 否 | 否 | 是 | 喷火兵收火 0.30 秒 |
| `ReleasingFlame` | 否 | 否 | 是 | 喷火兵重新放火 0.25 秒 |
| `Overheated` | 否 | 否 | 是 | 武器过热锁定 |
| `Cooling` | 由兵种决定 | 否 | 是 | 过热后的降温阶段 |
| `Suicidal` | 是 | 特殊 | 是 | 被巨胃抛出的丧尸，追击后自爆 |
| `StoredInGut` | 否 | 否 | 否 | 不在活动战场中，不计存活敌人 |

不允许用字符串状态代替专用字段表达热量、收火进度或胃库存。`Unit` 增加：

```ts
weaponHeat: number;
weaponCooldown_s: number;
stateElapsed_s: number;
facing: Point;
storedGutUnitIds: string[];
storedInGutById: string | null;
suicideTriggerId: string | null;
```

字段重置规则必须覆盖 `spawn`、`transform`、`kill`、对象池复用和 `restart`。

## 3. 配置规格

### 3.1 单位配置

`config/units.json` 增加以下配置。数值是首版实现值：

```json
{
  "sniper": {
    "hitPoints": 85,
    "speed_px_per_s": 42,
    "diameter_px": 28,
    "damagePerHit": 150,
    "attack_interval_s": 1.6,
    "attack_range_px": 520,
    "projectile_speed_px_per_s": 1200,
    "penetration_count": 3,
    "penetration_damage_multiplier": 0.8
  },
  "engineer": {
    "hitPoints": 100,
    "speed_px_per_s": 42,
    "diameter_px": 28,
    "deploy_duration_s": 2.0,
    "dismantle_duration_s": 1.5,
    "gun_range_px": 300,
    "gun_damage": 4,
    "gun_rate_per_s": 10,
    "gun_heat_per_shot": 3.3,
    "gun_heat_max": 100,
    "gun_warning_heat": 85,
    "gun_overheat_lock_s": 2.5,
    "gun_cooling_rate_s": 45,
    "gun_cooling_threshold": 25,
    "target_refresh_s": 0.15
  },
  "shield": {
    "hitPoints": 220,
    "speed_px_per_s": 40,
    "diameter_px": 37,
    "damagePerHit": 12,
    "attack_interval_s": 0.65,
    "attack_range_px": 120,
    "shield_front_angle_deg": 120,
    "shield_damage_multiplier": 0.4
  },
  "flamethrower": {
    "attack_range_px": 110,
    "area_radius_px": 42,
    "damagePerHit": 14,
    "attack_interval_s": 0.45,
    "damage_tick_interval_s": 0.15,
    "continuous_duration_s": 0.45,
    "heat_max": 100,
    "heat_per_tick": 8,
    "overheat_lock_s": 2.0,
    "cooling_rate_s": 45,
    "cooling_threshold": 25,
    "retract_duration_s": 0.30,
    "release_duration_s": 0.25
  },
  "gut_zombie": {
    "hitPoints": 300,
    "speed_px_per_s": 22,
    "diameter_px": 56,
    "swallow_radius_px": 180,
    "gut_capacity": 5,
    "throw_cooldown_s": 1.2,
    "suicide_delay_s": 0.8,
    "explosion_radius_px": 72,
    "explosion_damage_human": 60,
    "explosion_damage_zombie": 30
  }
}
```

`flamethrower.attack_range_px=110` 必须保持小于步枪兵射程 `260 / 2 = 130`。喷火热量按伤害 tick 增加；实现时每 0.15 秒最多结算一次 tick，不能用渲染帧频率直接增加热量。

### 3.2 9 人编成

`MAX_HUMANS=9`，默认权重为：

```ts
{ rifleman: 4, flamethrower: 2, shield: 1, sniper: 1, engineer: 1 }
```

编队布局必须扩容而不改变单兵选择规则。`formationPositions` 仍使用稳定顺序，不能让新增单位因数组顺序变化获得随机位置。

## 4. 攻击、伤害和统计接口

### 4.1 伤害入口

`CombatSystem.applyDamage` 扩展为：

```ts
applyDamage(request: {
  targetId: string;
  amount: number;
  sourceId: string;
  sourcePosition?: Point;
  damageKind: 'bullet' | 'sniper' | 'flame' | 'melee' | 'machine_gun' | 'explosion';
  time_s: number;
}): BattleEvent[];
```

兼容旧测试的参数重载可以保留，但内部必须归一化到请求对象。流程固定为：

1. 校验目标仍活动且非 `StoredInGut`。
2. 根据盾兵和攻击类型计算减伤。
3. `appliedAmount = min(request.amount, target.hp)`。
4. 扣除 HP，并发出 `damage`，事件同时包含 `amount`（请求值）和 `appliedAmount`（实际扣血）。
5. 若 HP 归零，发出 `unit_died`，包含 `killerId`、`killerUnitType`、`damageKind`。
6. 更新统计器；过量部分不得计入伤害。

盾牌判定只在目标为盾兵、`damageKind` 不是范围伤害、`sourcePosition` 有限且来源到目标方向位于盾面前方 120° 时，将实际伤害乘以 `0.4`。范围伤害 `flame`、`explosion` 不减伤；机枪、步枪、狙击和近战属于直接命中。

### 4.2 统计器

新增 `CombatStats`，由 `BattleTestHarness` 创建并在 `CombatSystem` 与 `ResultSystem` 间共享：

```ts
interface CombatStat {
  unitType: HumanUnitType;
  spawned: number;
  aliveAtEnd: number;
  kills: number;
  damage: number;
}

interface CombatStatsSnapshot {
  byUnitType: Record<HumanUnitType, CombatStat>;
}
```

统计器按运行时 `sourceId` 先记录，再以 `sourceUnitType` 聚合，防止同兵种单位或感染转换导致归属混乱。首版 HUD 只读取 `byUnitType`；不增加命中数、过热次数字段。

### 4.3 事件扩展

`BattleEvent` 增加或扩展：

```ts
TimedEvent<'damage', {
  sourceId: string;
  targetId: string;
  amount: number;
  appliedAmount: number;
  hp: number;
  damageKind: DamageKind;
}>

TimedEvent<'unit_died', {
  unitId: string;
  faction: Unit['faction'];
  killerId: string | null;
  killerUnitType: UnitType | null;
  damageKind: DamageKind | null;
}>

TimedEvent<'weapon_state_changed', {
  unitId: string;
  from: UnitState;
  to: UnitState;
  heat: number;
}>

TimedEvent<'gut_swallowed', { gutId: string; zombieId: string }>
TimedEvent<'gut_thrown', { gutId: string; zombieId: string; targetPosition: Point }>
TimedEvent<'gut_released', { gutId: string; zombieIds: string[] }>
TimedEvent<'zombie_exploded', { zombieId: string; sourceGutId: string; position: Point }>
TimedEvent<'generation_complete', { generated: number; target: number }>
```

事件必须在核心产生并被 `readEvents` 复制；适配层只根据事件表现火焰缩放、热量、机枪架设、吞吐和爆炸。

## 5. 狙击兵实现

新增 `SniperModule`，攻击配置使用 `projectileKind='sniper'`。目标选择顺序：

1. 过滤射程内、无遮挡的存活 `gut_zombie`。
2. 若没有巨胃，过滤射程内无遮挡的其他特殊丧尸（为未来类型保留扩展）。
3. 若仍没有特殊丧尸，选择距离最近的普通可攻击丧尸。

发射时保存起点和方向，不只保存一个目标 ID。`ProjectileSystem` 对固定地形做一次连续线段检测；墙、门和其他 `blocksMovement` 地形都阻挡。单位实体不阻挡狙击弹，巨胃也不阻挡。

沿弹道投影距离排序，最多命中 3 个丧尸。首目标伤害为 150，第二目标为 120，第三目标为 96；每个目标每发只命中一次。穿透不能绕过地形，也不能命中墙后的单位。狙击弹命中事件应包含被命中的目标列表，方便表现层画一条弹道而不是三发子弹。

## 6. 工兵机枪实现

工兵不是独立机枪单位，机枪状态存放在工兵单位上。输入层对工兵的移动命令按状态处理：

- `Idle/Moving`：正常移动；点击架设位置进入 `Deploying`。
- `Deploying`：2 秒倒计时，不能移动和攻击；被击杀则取消架设。
- `Deployed`：固定位置，每秒 10 发，自动瞄准，热量正常累积。
- `Overheated`：热量达到 100 后停止攻击 2.5 秒。
- `Cooling`：锁定结束后持续降温，热量降至 25 以下回到 `Deployed`。
- `Dismantling`：1.5 秒内不能攻击、不能移动、不能重新瞄准；开始时清除目标，完成后回到 `Idle`。

机枪每 0.15 秒重选一次目标；目标必须存活、在 300 px 内且无遮挡，排序按距离最近、ID 稳定排序。每发机枪弹产生一个普通单目标弹道，伤害 4，热量增加 3.3。拆卸命令只由玩家对已架设工兵触发，不允许在拆卸中再次架设。

## 7. 喷火兵实现

喷火兵使用短程连续投射物，但每个伤害 tick 必须由核心控制。推荐实现为一个火焰射流对象，不为每个目标创建独立弹道：

1. `Firing` 时火焰长度由 0 到 110 px，前端范围半径 42 px。
2. 每 0.15 秒对射流路径上的丧尸各造成 14 点范围伤害；同一 tick 每个目标最多一次。
3. 热量每 tick 增加 8；热量达到 100 进入 `Overheated`，立即停止伤害。
4. `Overheated` 锁定 2 秒，随后 `Cooling` 按每秒 45 降温，低于 25 才可重新放火。
5. 移动命令从 `Firing` 进入 `RetractingFlame`，0.30 秒内火焰尺寸线性缩小到 0，期间不能伤害或移动。
6. 收火完成后进入 `Moving`，速度 40 px/s；到达目标后若热量低于 25，进入 `ReleasingFlame`。
7. `ReleasingFlame` 持续 0.25 秒，火焰由短到标准尺寸，结束后才恢复 `Firing` 和伤害 tick。

如果移动命令到达时喷火兵处于 `Overheated/Cooling`，仍必须完成收火和移动，但到达后继续冷却，不得跳过锁定。喷火热量、收火和放火进度必须在核心更新，不由动画时间估算。

## 8. 盾兵实现

盾兵配置直径 37 px，`UnitStore.radius_px` 自动取 18.5。适配层盾面绘制半径为单位半径的 1.35–1.50 倍，覆盖前方 120°。盾兵保留短程手枪，使用 120 px 射程、12 点伤害、0.65 秒间隔。

盾面朝向更新优先级：当前攻击目标方向 > 当前移动方向 > 上一帧 `facing`。`facing` 必须在单位快照中提供，方便 UnitView 绘制。伤害请求使用攻击来源位置；攻击来源死亡不影响已创建投射物的 `sourcePosition` 快照。

## 9. 尸群和巨胃实现

### 9.1 僵尸堆叠

删除 `CombatSystem.separateZombies` 的单位间位移调用。保留墙体、门、地图边界碰撞和墙边堆叠翻越。目标选择仍按距离和稳定 ID 排序；两个僵尸坐标重合时不得调用分离算法，使用稳定的移动顺序和 `contactAxis` 仅处理路径计算需要的方向。

回归要求：10 个僵尸在同一出生区域可以保持重叠或近似重叠；不得被强制推成间距大于直径的队列；仍不得穿过墙体。

### 9.2 巨胃

新增 `GutZombieModule` 和 `GutSystem`，不要把胃库存逻辑塞进 `SpawnSystem`。楼下持续生成总目标为 720，巨胃目标占 5%，即 36 只；生成调度器在分配每个新单位时维护 `gutSpawnTarget=ceil(totalTarget*0.05)` 和 `gutSpawned`，达到 36 后只生成普通丧尸。特殊丧尸仍只在楼下生成。

生成后立即执行一次吞入扫描：从 180 px 内过滤 `normal_zombie`、未攀爬、未被暂存者，按距离和 ID 排序，最多转为 `StoredInGut`。暂存单位从 `living()`、目标选择、存活僵尸数和碰撞中排除。

巨胃受到有效伤害且库存非空、抛掷冷却为零时，弹出一个 ID，向攻击来源方向设置目标点，发出 `gut_thrown`。丧尸经过 0.8 秒进入自爆，按 72 px 半径造成 60（人类）/30（僵尸）范围伤害，随后发出 `zombie_exploded` 并死亡。自爆伤害归属 `sourceGutId` 的特殊伤害，不计任何人类兵种击杀。

巨胃死亡时一次性发出 `gut_released`，将所有库存丧尸恢复为活动 `normal_zombie`，完整 HP，在巨胃周围使用稳定扇形位置释放。释放不产生死亡或击杀。巨胃不能吞入特殊丧尸、攀爬单位或已被其他系统锁定的单位。

## 10. 楼下持续刷怪实现

新增 `ContinuousSpawnSystem`，或在 `SpawnSystem` 内增加独立的 continuous 模式；不得继续用 `WaveManager.allWavesSpawned()` 表示楼下结束。持续调度配置建议：

```ts
interface ContinuousSpawnDefinition {
  totalTarget: 720;
  interval_s: 0.35;
  batchSize: 10;
  spawnPoints: string[]; // north, south, east, west
  distribution: Record<string, number>; // .30, .30, .20, .20
  specialRatios: { gut_zombie: 0.05 };
}
```

每个逻辑步：

1. 如果 `generated >= totalTarget`，设置 `generationComplete` 并停止。
2. 到达下一个生成时间时，计算本批数量 `min(batchSize, totalTarget-generated)`。
3. 先按 5% 配额分配巨胃数量，剩余位置填充普通丧尸；总数仍不能超过 720。
4. 按出生点权重选取位置；拥堵只允许换出生点，不增加总量或补偿生成。
5. 发出 `zombie_batch_spawn`，批次不再包含波次编号；增加 `generated` 和 `generationComplete` 字段。

楼下胜利条件：`generationComplete === true` 且活动战场没有存活僵尸。被吞入的丧尸不算存活，但也不算死亡；巨胃存活时仍是一个存活僵尸。大屋可以继续使用原固定波次，建议将大屋总量调整为 500 并去除大屋特殊丧尸。

## 11. 结算和 HUD

`BattleSnapshot` 增加：

```ts
stats: CombatStatsSnapshot;
generationComplete: boolean;
```

`ResultSystem` 在终局前读取活动单位和调度完成状态，终局后冻结 `stats`。`HudController` 结果页增加兵种聚合表：步枪兵、喷火兵、盾兵、狙击兵、工兵机枪。每行显示 `击杀数` 和 `伤害`；可同时显示上场数/存活数，但不显示命中次数和过热次数。没有击杀的兵种仍显示 0 行。

工兵机枪伤害和击杀归属 `engineer`，显示名称使用“工兵机枪”。巨胃吞入/释放不产生人类击杀；过量伤害不计入统计；同一范围伤害对多个目标逐个累计。

## 12. 测试清单

### 核心单元测试

- 9 人编成类型和 `MAX_HUMANS=9`，对象池复用清空新增字段。
- 伤害过量截断，`appliedAmount` 与 `unit_died.killerId` 正确。
- 五种人类兵种分别产生聚合伤害/击杀，工兵机枪归属工兵。
- 狙击兵特殊目标优先；没有特殊目标时最近普通丧尸优先。
- 狙击弹穿透最多 3 个单位，巨胃不挡弹，墙/门挡弹，穿透伤害按 150/120/96。
- 盾兵正面、侧面、背面来源位置减伤；范围伤害不减伤；盾兵手枪射程、伤害和间隔。
- 喷火射程 110、半径 42、tick 14；热量达到 100 进入过热，冷却低于 25 才恢复。
- 喷火移动先收火 0.30 秒，再移动，抵达后放火 0.25 秒；移动期间无伤害。
- 工兵架设 2 秒、拆卸 1.5 秒；拆卸期间不攻击、不重选目标、不移动；过热曲线和 0.15 秒重选。
- 僵尸重叠不触发分离，仍不穿墙；墙边堆叠翻越保持工作。
- 巨胃生成后最多吞 5 只普通丧尸，暂存单位不计存活；受击抛掷、自爆、死亡释放。
- 楼下持续生成达到 720 后立即停止，不因吞入、转化或死亡补生成；巨胃目标约 36 只。

### 适配层和验收测试

- 结算表显示 5 行兵种聚合，中文不溢出，0 击杀仍显示。
- 狙击弹一条弹道穿过实体但在墙/门处停止；盾牌尺寸与碰撞半径一致。
- 喷火收火、重新放火、过热、机枪架设/拆卸视觉与事件同步。
- 楼下持续刷怪在四边出现，累计达到 720 后不再出现新单位。
- 重开清空统计、弹道、热量、胃库存和生成计数；故事进入下一场景时不继承上一关统计。
- 完成 `npm test`、`npm run typecheck`、`npm run typecheck:cocos`、`npm run check:cocos-bundle`，再进行 Creator 预览和移动端人工检查。

## 13. 已知迁移风险

- `UnitState` 是联合类型，喷火和工兵状态若直接复用 `Firing` 可能破坏 MovementSystem；应先统一状态转移表，再改系统判断。
- `ProjectileSystem` 当前只支持单目标/火焰范围，需要为狙击多目标返回命中列表并保持墙体连续碰撞。
- `WaveManager`、`SpawnSystem` 和 `ResultSystem` 当前假设所有关卡是波次；楼下持续模式必须有独立 `generationComplete`，不能只把波次数组改成一条大波。
- 当前 `separateZombies` 同时负责空间稳定和防穿墙，删除前要保留墙体 sweep 和重合坐标的确定性处理。
- 现有 HUD 结果卡高度有限，5 行统计表需要重新布局并在窄屏检查中文断行。
- Cocos 生成包不能手改；核心修改后必须同步并运行适配层测试。

