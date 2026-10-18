# 别墅解救平民：实现规格

> 状态：实现规格草案，依据 [别墅解救平民场景设计](12-villa-civilian-rescue-scene-design.md) 编写。
>
> 本文只定义开发时需要实现的类型、接口、流程、表现和验收标准，不代表功能已经开发、接入或通过验收。本轮不修改 `src/`、`assets/`、`config/` 或测试文件。

## 1. 实现目标和边界

本场景的运行时标识建议为 `villa_rescue`，关卡标识建议为 `LV03_villa_rescue`。场景开始时，6 名平民已经在别墅中央，7 名士兵已经在平民周围；僵尸从四面外墙之外持续逐渐生成，先攻击外墙，墙体出现局部缺口后再进入别墅。当前唯一的关卡目标是保护 6 名平民完成解救。

实现必须遵守以下规则：

- 不使用三波或其他波次战斗。别墅只使用一条连续生成调度，生成器不产生波次编号、波次开始/结束事件或波次等待。
- 别墅只有北、东、南、西四面首尾连接的外墙。四角不能有缺口，墙内不能放置入口门、内部墙、房间隔断或额外障碍。
- 士兵在战斗开始时直接生成在平民周围，不经过左下角入口，不播放进入路线，也不等待部署阶段。
- 6 名平民固定在中央，不移动、不攻击、不接受玩家移动指令；所有仍为平民的单位统一使用绿色外观。
- 平民第一次受到僵尸有效攻击后进入约 `0.8s` 的原地变身状态，完成后变为同一位置的 `normal_zombie`。
- 任意平民完成变身后立即失败。命中但尚未完成变身的窗口仍需要显示反馈，但失败事件在变身完成时发布。
- 胜利只在生成达到上限、场上没有存活僵尸、且没有平民完成变身时触发。不增加评分、星级、击杀排行、用时排行、墙体评分、士兵存活评分或额外奖励。

本实现规格允许旧场景继续使用当前波次架构。旧接口可以保留用于兼容，但别墅场景不得通过伪造 `waveIndex=0`、把连续生成包装成多波，或在场景 ID 判断中硬编码特殊行为来满足规则。

## 2. 与当前架构的适配边界

核心规则继续放在 `src/core`，Cocos 适配层只负责输入、绘制、HUD 和场景选择。建议按下表改造：

| 现有模块 | 别墅场景的实现要求 |
|---|---|
| `types.ts` | 增加场景类型、平民状态、墙体快照、连续生成事件和解救结果字段；旧波次字段只为旧场景保留。 |
| `BattleTestHarness` / `BattleSession` | 根据场景配置选择连续生成调度器；开局直接生成平民和士兵；跳过部署路线；每帧更新墙体、平民和生成状态。 |
| `WaveManager` | 继续服务已有波次关卡。别墅不调用 `update()` 产生波次事件，也不以 `allWavesSpawned()` 作为别墅结束条件。 |
| 新增 `ContinuousSpawnScheduler` | 读取场景的 `continuousSpawn` 配置，按时间、四侧权重和总上限生成僵尸，并发布 `generation_complete`。 |
| `SpawnSystem` | 把当前固定间隔的试验性 `configureContinuous()` 改为正式调度边界；间隔曲线、方向权重和随机种子由场景配置传入，不能根据地图 ID 硬编码。 |
| `MapModel` / 新增 `WallModel` | 表达四面墙的耐久、裂纹、局部缺口和运行时碰撞段；墙体不是当前只支持 `door` 的静态地形。 |
| `UnitStore` | 继续存储士兵和僵尸。平民建议使用独立 `CivilianStore`，变身完成时在相同位置向 `UnitStore` 生成普通僵尸。 |
| `ResultSystem` | 改为接收场景结果上下文；别墅失败由平民变身触发，不能用“没有活着的人类”替代。 |
| `MapView` | 绘制连续四墙、裂纹、局部破口和墙体状态；不绘制入口、门或室内墙。 |
| `UnitView` / `CivilianView` | 绘制统一绿色平民、变身读条和转化后的普通僵尸；平民不套用士兵血条和攻击表现。 |
| `HudController` | 别墅分支不显示波次横幅或波次计数，只显示平民数量、四面墙状态、僵尸接近方向和解救结果。 |

建议将 `BattleTestHarness.runWaves()` 拆为场景无关的 `runSpawners()`。旧场景仍可由兼容适配器调用 `WaveManager`，别墅使用 `ContinuousSpawnScheduler`；这样可以在同一会话框架中复用移动、战斗、投射物和事件读取逻辑。

## 3. 场景配置契约

### 3.1 场景定义

`SceneDefinition` 或等价场景配置需要增加场景类型。字段名可按现有配置风格调整，但语义必须保持一致：

```ts
type ScenarioKind = 'legacy_wave' | 'villa_rescue';

interface VillaRescueDefinition {
  id: 'villa_rescue';
  levelId: 'LV03_villa_rescue';
  kind: 'villa_rescue';
  mapId: 'LV03_villa_rescue';
  civilianCount: 6;
  civilians: CivilianSpawnDefinition[];
  initialSoldiers: SoldierSpawnDefinition[];
  walls: VillaWallDefinition[];
  continuousSpawn: ContinuousSpawnDefinition;
}
```

别墅配置不包含 `waves`。如果现有 `SceneDefinition` 为了兼容旧关卡仍要求该字段，则别墅配置应使用新的联合类型使 `waves` 对 `kind: 'villa_rescue'` 不再必填；不得填入一组“只有一波”的伪数据。

### 3.2 地图和单位参数

设计稿中的固定空间参数必须作为首版实现基准：

- 逻辑地图：`1080×2400`。
- 别墅室内可活动区域：`x=124..956, y=424..2000`。
- 北墙：`x=100..980, y=400..424`。
- 西墙：`x=100..124, y=400..2024`。
- 东墙：`x=956..980, y=400..2024`。
- 南墙：`x=100..980, y=2000..2024`。
- 每面墙首版最大耐久：`1800`。
- 局部缺口宽度：`120px`。
- 墙体归零后的破墙表现时间：约 `0.5s`。

地图配置可以继续使用 `terrain` 表达初始绘制范围，但运行时必须维护独立的墙体状态。`kind: 'door'` 和 `damageDoor()` 不能直接承担别墅墙体逻辑，因为别墅没有门，且一面墙需要支持局部缺口。

### 3.3 平民和士兵初始配置

6 名平民的中心点约为 `(540,1170)`，使用设计稿中的六边形排布：

```json
[
  { "id": "civilian-1", "x": 540, "y": 1080 },
  { "id": "civilian-2", "x": 615, "y": 1125 },
  { "id": "civilian-3", "x": 615, "y": 1215 },
  { "id": "civilian-4", "x": 540, "y": 1260 },
  { "id": "civilian-5", "x": 465, "y": 1215 },
  { "id": "civilian-6", "x": 465, "y": 1125 }
]
```

士兵编成为 4 名步枪兵、2 名喷火兵、1 名盾兵，初始位置直接采用设计稿站位：

| 类型 | 数量 | 推荐位置 |
|---|---:|---|
| 盾兵 | 1 | `(540,1400)` |
| 喷火兵 | 2 | `(405,1170)`、`(675,1170)` |
| 步枪兵 | 2 | `(450,970)`、`(630,970)` |
| 步枪兵 | 2 | `(420,1420)`、`(660,1420)` |

这些坐标是默认保护阵型，允许玩家在战斗中移动士兵。平民位置不因士兵移动而改变。平民不应进入 `UnitStore.living()` 的普通人类统计，否则会重新触发旧的“所有人类死亡即失败”语义。

## 4. 平民实体和状态机

### 4.1 独立数据模型

推荐新增 `CivilianStore` 和以下实体，而不是把平民伪装成普通步枪兵：

```ts
type CivilianState = 'Civilian' | 'Transforming' | 'Transformed';

interface CivilianEntity {
  id: string;
  position: Point;
  radius_px: number;
  state: CivilianState;
  active: boolean;
  transformElapsed_s: number;
  transformDuration_s: number;
  transformedZombieId: string | null;
  firstAttackerId: string | null;
}
```

初始状态为 `Civilian`，半径建议为 `14px`。平民没有普通单位 HP、攻击间隔、武器状态、移动目标或玩家选中状态。碰撞层应保证士兵和僵尸不能通过推挤把平民移出中央保护区。

### 4.2 状态迁移

状态迁移必须由模拟时钟驱动，而不是由渲染帧数驱动：

```text
Civilian --首次有效僵尸攻击--> Transforming
Transforming --0.8s 完成------> Transformed + normal_zombie + lose
```

- 只有 `Civilian` 能进入 `Transforming`；重复攻击不能重复创建读条或重复发布命中事件。
- `Transforming` 期间平民原地固定，不能被移动、推挤、士兵命令或第二个僵尸改变目标。
- 计时达到 `0.8s` 时，先在相同位置生成一只 `normal_zombie`，再把平民标记为 `Transformed`、保存 `transformedZombieId`，发布 `civilian_transformed`，最后让结果系统立即进入失败。
- 变身后的普通僵尸使用普通僵尸完整生命值和行为；该单位用于保持视觉和事件记录，不改变失败原因，也不增加额外评分。
- 重启战斗时必须清空所有平民状态、变身计时和转化僵尸 ID。

### 4.3 有效攻击判定

僵尸必须已经进入别墅、通过墙体和碰撞检查，且攻击距离满足普通近战命中条件，才算平民有效攻击。墙体完整时不能对墙内平民造成伤害；僵尸不能通过射线穿透完整墙体或从墙角绕入。

平民受到有效攻击时发布 `civilian_hit` 和 `civilian_transform_started`。`civilian_hit` 只表示已开始变身，不直接结束战斗；在变身完成前，如果场景暂停或通过重启离开，计时应按场景生命周期清零。

## 5. 四面墙和局部缺口

### 5.1 墙体数据模型

建议新增 `WallModel`，或将等价职责加入 `MapModel`：

```ts
type WallSide = 'north' | 'east' | 'south' | 'west';
type WallStatus = 'intact' | 'damaged' | 'breaching' | 'breached';

interface VillaWallDefinition {
  id: string;
  side: WallSide;
  bounds: Rect;
  maxHp: 1800;
  breachWidth_px: 120;
}

interface WallSnapshot {
  id: string;
  side: WallSide;
  hp: number;
  maxHp: number;
  status: WallStatus;
  breachCenter: number | null;
  breachWidth_px: number;
}
```

每面墙有独立耐久和独立状态。`damaged` 表示已受损但仍完整阻挡，`breaching` 表示耐久已归零且正在播放约 `0.5s` 破墙动画，`breached` 表示局部缺口已经可通行。墙体状态变化必须使导航和射线缓存失效。

### 5.2 受击和缺口规则

首版采用“僵尸先攻击墙体，墙体被击穿后从局部缺口进入”的玩法假设。该假设必须在实现中明确保留，否则外部生成的僵尸没有合法路径进入封闭别墅。

- 僵尸接触完整墙体后把墙体作为目标，不能隔墙选中平民或士兵。
- 每次有效墙体攻击扣除对应墙的耐久，并发布 `wall_damaged`。
- 一面墙首版只保留一个活动缺口。新的受击点距离已有缺口小于 `160px` 时合并到该缺口；其他受击点可排队等待，不能删除整面墙。
- 耐久归零后进入 `breaching`，约 `0.5s` 后在受击位置创建宽度 `120px` 的缺口并发布 `wall_breached`。
- 缺口形成后只删除该范围的碰撞段和射线阻挡；剩余墙段继续阻挡移动、攻击射线和地图边界。
- 墙体不能自动修复，不能从完整墙段穿过，不能翻墙，不能从四角钻出。

运行时碰撞可以采用“墙体拆分为多个可碰撞矩形段”，也可以采用等价的阻挡区集合。实现验收只关注几何结果：完整墙体是连续边界，缺口处可通行，剩余墙段仍有效。

### 5.3 墙体事件

```ts
type WallDamagedEvent = TimedEvent<'wall_damaged', {
  wallId: string;
  side: WallSide;
  hp: number;
  maxHp: number;
  sourceId: string;
  amount: number;
}>;

type WallBreachedEvent = TimedEvent<'wall_breached', {
  wallId: string;
  side: WallSide;
  center: number;
  width_px: number;
  sourceId: string | null;
}>;
```

`wall_damaged` 用于 HUD 和裂纹表现，`wall_breached` 用于切换碰撞段、僵尸路径目标和破墙特效。墙体事件不使用 `door_damaged` 或 `door_destroyed` 命名，避免把别墅误解成有入口门的地图。

## 6. 连续生成调度器

### 6.1 调度接口

新增独立调度器接口，避免把别墅规则塞进 `WaveScheduler`：

```ts
interface ContinuousSpawnScheduler {
  reset(seed: number): void;
  update(time_s: number, context: SpawnContext): BattleEvent[];
  isGenerationComplete(): boolean;
  generatedCount(): number;
}
```

`SpawnContext` 至少提供四面墙的耐久状态、当前时间和地图出生区域。调度器只负责决定何时、从哪一侧、生成多少只和生成何种类型；单位创建、碰撞校正和目标选择仍由现有核心系统负责。

### 6.2 首版配置

```ts
interface ContinuousSpawnDefinition {
  totalTarget: 240;
  initialInterval_s: 1.20;
  minimumInterval_s: 0.45;
  rampDuration_s?: number; // 未配置时使用 120s
  batchMin: 1;
  batchMax: 3;
  sides: WallSide[];
  initialWeights: Record<WallSide, number>; // 四侧各 0.25
  damagedWallBonusMax: 0.15;
  enemyWeights: { normal_zombie: number; fat_zombie: number };
}
```

生成间隔从 `1.20s` 平滑下降到 `0.45s`，不得在某个时间点切换成新的波次。建议使用线性或平滑插值：

```text
progress = clamp(time_s / rampDuration_s, 0, 1)
interval = initialInterval_s -
           (initialInterval_s - minimumInterval_s) * progress
```

`rampDuration_s` 是可调的正式配置项，首版默认 `120s`；调节它属于数值校准，不改变连续生成规则。单次生成数量为 `1–3`，以单只为主，不能因为某一侧受损而一次性生成一整波。

四侧初始权重各为 `25%`。当某面墙的耐久比其他墙明显低至少 `25%` 时，最多把 `15%` 的总权重转移到该侧，并按比例减少其他侧；权重必须归一化。随机选择应使用战斗种子，以便自动测试能够复现同一场景。

达到 `totalTarget=240` 后，调度器设置 `generationComplete=true`，发布一次 `generation_complete`，不因僵尸死亡、变身或墙外拥挤补充额外数量。场景结果系统只能读取这个完成状态，不能从 `waveIndex` 或旧的 `allWavesSpawned()` 推断。

### 6.3 出生区域和事件

僵尸出生点必须在四面墙外、地图边界内：

| 侧面 | 建议出生区域 |
|---|---|
| 北 | `x=150..930, y=250..360` |
| 东 | `x=990..1020, y=500..1900` |
| 南 | `x=150..930, y=2060..2140` |
| 西 | `x=60..90, y=500..1900` |

建议使用不带波次编号的事件：

```ts
type ContinuousZombieSpawnEvent = TimedEvent<'continuous_zombie_spawn', {
  spawnSequence: number;
  spawns: Array<{
    unitType: ZombieUnitType;
    side: WallSide;
    position: Point;
  }>;
}>;
```

`spawnSequence` 只是调试和回放顺序，不代表波次。别墅场景不得发布 `wave_spawn` 或带 `waveIndex` 的僵尸生成事件；旧场景的同名事件可以继续保留。

## 7. 僵尸目标和移动

僵尸目标选择应分为外墙阶段和室内阶段，不能直接沿用只面向固定路线的目标逻辑：

1. **墙外阶段**：新僵尸根据出生侧寻找该侧最近的完整墙段或现有缺口。完整墙体仍在时，目标为墙体受击点；不能隔墙攻击墙内单位。
2. **破墙阶段**：墙体进入 `breaching` 时，僵尸等待缺口可通行，或在不穿越墙段的前提下继续攻击。缺口形成后，附近僵尸把缺口中心作为进入目标。
3. **室内阶段**：进入别墅后，优先选择最近且仍为 `Civilian` 或 `Transforming` 的平民；若没有可达平民，再选择士兵。目标选择必须通过墙体和碰撞检查。
4. **边界约束**：僵尸不能绕到地图边界外侧再从墙角钻入，也不能从完整墙段的端点穿越。四角应被视为连续墙体连接处。

墙体攻击可以通过新的 `damageKind: 'wall'` 表达，也可以使用单独的墙体攻击入口；不能把墙体当成可被普通 `UnitStore` 击杀的僵尸或人类单位。墙体碰撞应同时参与移动阻挡和投射物射线阻挡，除非投射物明确命中缺口。

## 8. 开局、部署和玩家指令

### 8.1 开局顺序

`BattleSession.startScene('villa_rescue')` 的初始化顺序应为：

1. 读取场景和地图定义，创建 `WallModel`、`CivilianStore`、`UnitStore`、连续生成调度器和战斗系统。
2. 清空上一局的单位、墙体耐久、缺口、平民状态、随机种子、事件游标和统计数据。
3. 在中央固定位置生成 6 名平民，状态全部为 `Civilian`。
4. 在平民周围直接生成 7 名士兵，编成固定为 4 步枪兵、2 喷火兵、1 盾兵。
5. 将部署时间设为零，立即进入战斗计时；不能播放入口进入动画或调用左下角入口路线。
6. 从 `time_s=0` 开始更新连续生成器；生成点仍必须在别墅外部。

如果公共 `BattleConfig` 仍保留 `deploymentDuration_s`，别墅场景应由场景类型覆盖为 `0`，而不是把士兵先放在别处再瞬移到中央。`endDeployment()` 对别墅应为幂等空操作或直接进入战斗状态。

### 8.2 指令限制

玩家仍可以按当前规则选择和拖拽士兵。选择过滤必须排除平民，不能把平民当成可移动的 `human` 单位返回。对平民发出的移动命令应被拒绝且不产生 `group_command` 事件。平民不会跟随士兵、不自动散开、不被拖拽到别的位置。

## 9. 胜负状态机

### 9.1 结果上下文

将当前 `ResultSystem.update(allWavesSpawned, time_s)` 改为接收可表达不同场景的上下文，旧调用可以通过适配器保留：

```ts
interface ResultContext {
  scenarioKind: ScenarioKind;
  generationComplete: boolean;
  aliveZombies: number;
  civilianCount: number;
  civiliansRemaining: number;
  civiliansTransforming: number;
  civilianTransformed: boolean;
  time_s: number;
}
```

### 9.2 失败优先级

失败条件的优先级高于胜利条件：

1. 如果任意平民完成 `Transformed`，立即进入 `lose`，原因固定为 `civilian_transformed`。
2. 如果场景已经失败或胜利，不再处理新的攻击、生成或结果事件。
3. `Transforming` 尚未完成时不能直接以平民数量为零判定失败；必须等 `0.8s` 转化完成。

建议结果事件携带原因：

```ts
type RescueResultEvent = TimedEvent<'lose' | 'win', {
  result: BattleResult;
  reason: 'civilian_transformed' | 'generation_cleared' | 'legacy';
}>;
```

### 9.3 胜利条件

别墅胜利必须同时满足：

```ts
generationComplete === true
&& aliveZombies === 0
&& civiliansRemaining === civilianCount
&& civilianTransformed === false
```

不能只用 `aliveHumans === 0`、`allWavesSpawned()` 或“当前场上暂时没有僵尸”作为胜利条件。生成尚未完成时，即使场上暂时为空，也只能保持 `running`。

## 10. 快照和事件契约

### 10.1 `BattleSnapshot` 扩展

建议增加以下字段：

```ts
interface VillaRescueSnapshot {
  scenarioKind: 'villa_rescue';
  civilianCount: 6;
  civiliansRemaining: number;
  civiliansTransforming: number;
  civilianTransformed: boolean;
  generationComplete: boolean;
  generatedZombies: number;
  aliveZombies: number;
  walls: WallSnapshot[];
}
```

`civiliansRemaining` 定义为尚未完成变身的平民数量：正常平民和正在变身的平民都计入，完成变身后减一。`civiliansTransforming` 单独表示当前变身读条数量，避免 HUD 和测试把“正在读条”误认为已经转化。旧字段 `waveIndex` 在别墅场景中应为 `0` 且不参与任何规则；更理想的做法是让场景快照使用联合类型，调用方按 `scenarioKind` 读取。

### 10.2 必需事件

| 事件 | 触发时机 | 必需数据 |
|---|---|---|
| `continuous_zombie_spawn` | 连续生成器一次调度完成 | `spawnSequence`、侧面、类型、位置 |
| `generation_complete` | 达到 240 只生成上限 | `generated`、`target` |
| `wall_damaged` | 墙体有效受击 | 墙体 ID、侧面、当前/最大耐久、来源、伤害 |
| `wall_breached` | 局部缺口完成 | 墙体 ID、侧面、缺口中心和宽度 |
| `civilian_hit` | 第一次有效攻击命中平民 | 平民 ID、攻击来源、位置 |
| `civilian_transform_started` | 平民开始 `Transforming` | 平民 ID、时长、来源 |
| `civilian_transformed` | 0.8 秒完成变身 | 平民 ID、普通僵尸 ID、位置 |
| `lose` | 变身完成后立即失败 | `reason: civilian_transformed` |
| `win` | 生成完成且场上清空 | `reason: generation_cleared` |

同一平民最多发布一次 `civilian_hit`、一次 `civilian_transform_started` 和一次 `civilian_transformed`。重启会创建新的事件生命周期和游标，不能复用上一局的事件。

## 11. Cocos 表现层规格

### 11.1 `MapView`

- 从四个墙体状态绘制连续北、东、南、西外墙，四角必须连接。
- 墙体完整时绘制整段碰撞和统一材质；受损时按耐久显示裂纹级别；`breaching` 播放碎裂动画；`breached` 绘制缺口边缘和剩余墙段。
- 不绘制左下角入口、门、房间隔断、W1–W4 内部墙或其他室内障碍。
- 墙外使用较暗地面和低对比度雾气，确保外部僵尸仍能看到但不会与绿色平民混淆。

### 11.2 `UnitView` / 平民视图

- 平民统一使用绿色主体、浅绿色描边和统一尺寸，不按个人或职业使用不同颜色。
- `Civilian` 显示绿色目标标记；`Transforming` 显示绿色到灰绿色的渐变、闪烁和约 `0.8s` 读条；`Transformed` 由普通僵尸视图接管。
- 平民不显示普通士兵血条、不显示武器、攻击范围或可选中反馈。
- 士兵继续使用现有蓝色阵营色，保证能从中央绿色平民中快速识别。

### 11.3 `HudController`

别墅场景必须隐藏波次横幅、波次计数和“第几波”文案，展示以下内容：

- `平民：6/6`，变身完成后显示 `5/6` 等；读条期间可增加小型“变身中”提示。
- `墙体状态：北 / 东 / 南 / 西`，状态为完整、受损或已击穿。
- `僵尸接近：北 / 东 / 南 / 西`，根据当前外墙受击或生成压力提示方向。
- 失败：`平民被感染，解救失败`。
- 胜利：`6 名平民成功获救`。

场景选择缩略图和副标题应明确写成“别墅解救 · 保护中央 6 名平民”，不能显示波次数量。旧场景仍可显示各自的历史波次信息。

## 12. 开发顺序

实现时按以下顺序拆分提交，每一步都应有独立测试：

1. 增加 `ScenarioKind`、平民、墙体、连续生成和快照/事件类型。
2. 增加场景配置解析和 `LV03_villa_rescue` 注册，不接入 UI。
3. 实现 `CivilianStore`、平民固定碰撞和直接生成。
4. 实现四面墙状态、耐久、裂纹和局部缺口碰撞。
5. 实现 `ContinuousSpawnScheduler`、四侧出生区域、平滑间隔、权重和完成事件。
6. 修改僵尸目标选择，使其遵守“墙外攻击墙、破口进入、室内优先平民”。
7. 实现平民受击、`0.8s` 变身、普通僵尸替换和失败结果。
8. 修改结果系统和会话快照，接入生成完成后的清场胜利。
9. 更新 `MapView`、平民视图、`HudController` 和场景缩略图。
10. 完成自动测试、Cocos 手测和重启/旧场景回归。

## 13. 测试和验收矩阵

### 13.1 自动测试

| 编号 | 场景 | 预期 |
|---|---|---|
| A01 | 读取别墅配置 | `kind=villa_rescue`，无 `waves` 运行依赖，平民数为 6，士兵数为 7 |
| A02 | 开局初始化 | 6 名平民位于中央，7 名士兵已环绕生成，部署时间为 0 |
| A03 | 平民固定 | 发出移动命令后平民坐标不变，事件中没有平民 `group_command` |
| A04 | 绿色目标 | 6 名正常平民的表现状态均为绿色 |
| A05 | 四墙连接 | 四面墙端点相接，四角无可通行空隙；没有门和室内墙 |
| A06 | 墙体阻挡 | 完整墙体阻挡僵尸移动和攻击射线，僵尸不能隔墙命中平民 |
| A07 | 局部破墙 | 一面墙耐久归零后只生成指定宽度缺口，其他墙段仍阻挡 |
| A08 | 墙体复位 | 重启后四墙恢复 `1800 HP`、无裂口、无 `breaching` 状态 |
| A09 | 连续生成 | 生成间隔连续变化，事件无 `wave_spawn`、无 `waveIndex`，生成上限为 240 |
| A10 | 方向权重 | 初始四侧近似均衡，受损侧额外权重不超过 15% |
| A11 | 生成完成 | 第 240 只生成后只发布一次 `generation_complete`，后续不再生成 |
| A12 | 目标选择 | 墙外先攻击墙，破口形成后进入，室内优先寻找平民 |
| A13 | 平民受击 | 首次有效命中发布命中和变身开始事件，平民原地固定 0.8 秒 |
| A14 | 变身失败 | 0.8 秒完成后生成普通僵尸、发布 `civilian_transformed`，立即 `lose` |
| A15 | 变身去重 | 重复攻击不会创建第二个读条、第二个普通僵尸或重复失败事件 |
| A16 | 未完成不胜利 | 生成尚未完成或场上仍有僵尸时保持 `running` |
| A17 | 清场胜利 | 生成完成、存活僵尸为 0、无平民完成变身时才 `win` |
| A18 | 失败优先级 | 变身完成与最后一只僵尸死亡同帧时结果为 `lose` |
| A19 | 重启 | 单位、墙体、平民、随机种子、快照、事件游标全部回到初始状态 |
| A20 | 旧关卡回归 | 旧场景仍可使用原有波次调度，别墅专用字段不改变旧场景结果 |

### 13.2 Cocos 手测

- 场景开始时能直接看到中央 6 名绿色平民和环绕的 7 名士兵，没有入口进入动画。
- 镜头中只出现一个由四面连续墙组成的封闭别墅，四角没有黑线或可见空洞。
- 僵尸从四侧外部逐渐接近；完整墙体前不会直接出现在平民旁边。
- 墙体裂纹、局部破口、僵尸进屋和剩余墙段阻挡关系清晰可辨。
- 平民被攻击后保持原地，绿色状态逐渐变暗，约 0.8 秒后变成普通僵尸并显示失败。
- 生成完成并清场后只显示解救成功，不出现波次横幅、评分或排行榜。
- 点击重新开始后平民数量、墙体、生成计数和画面表现完全复位。

## 14. 暂不开发项和禁止回退项

本实现规格不包含以下内容：

- 不修改现有源码、JSON、Cocos 资源或测试文件；这些属于后续开发阶段。
- 不增加评分、星级、排行榜、奖励倍率、墙体评分、士兵存活评分或时间奖励。
- 不恢复入口门、左下角进场、室内墙、房间隔断或其他障碍。
- 不把场景拆成三波，不增加波次间等待，不以波次编号驱动连续生成。
- 不让平民移动、攻击、被玩家拖拽或被士兵推离中心。
- 不让墙体整面瞬间消失；必须使用受击位置的局部缺口并保留其他墙段阻挡。
- 不把平民计入普通士兵战斗统计，不以普通人类存活数取代平民解救状态。
- 不在表现层复制生成、目标选择、伤害、变身或胜负逻辑。

任何需要改变上述规则的数值或机制，都应先更新设计文档和本实现规格，再进入代码开发和验收。
