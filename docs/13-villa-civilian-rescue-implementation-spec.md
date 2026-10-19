# 别墅解救平民实现规格

> 当前实现修订：对应 [设计文档](12-villa-civilian-rescue-scene-design.md) 的紧凑别墅、右下角大门、四侧窗户和蓝色平民方案。用户已授权开发；本文件替代早期只生成文档阶段的“无门窗、绿色平民、动态破墙”规格。

## 1. 配置与布局

场景配置为 `config/scenes/villa-rescue.json`，`id=villa-rescue`，`levelId=LV03_villa_rescue`，`scenarioKind=villa_rescue`。

- 地图逻辑尺寸 `1080×2400`；战场边界 `x=60..1020, y=180..2160`。
- 别墅外框 `x=220..860, y=760..1600`，室内 `interior_bounds={left:244,top:784,right:836,bottom:1576}`。
- 四侧墙由静态 `kind=wall` 的矩形段和嵌入其中的门窗平铺组成；四角闭合，内部没有墙。
- 四扇 `kind=window` 的窗户各 `180 HP`；南墙靠右的 `villa-door-southeast` 大门 `360 HP`。
- 北/南窗为水平 `128×24`，东西窗为竖直 `24×128`，大门为水平 `140×24`。
- 完整墙体不能覆盖门窗的范围；破坏门窗后该处必须没有第二层墙体。
- `level.soldierPositions` 与 `level.initialSoldiers` 一一对应，确保四步枪、两喷火、一盾的站位正确。
- `level.civilians` 给出六个固定坐标；所有角色直接生成，部署时间为零。

## 2. 出生区域与连续生成

四个 `spawnPoints` 使用 `spawnArea` 有界窄条，详见设计文档。`MapModel.edgeSpawnPositions()` 在每侧条带内循环复用槽位；不能使用无限增大的行号向室内延伸。

`WaveManager` 读取场景的 `level.continuousSpawn`，`BattleTestHarness` 将它交给通用 `SpawnSystem`，不再按场景类型或地图 ID 补写生成参数：

- 总数 `240`，单次 `1`，`interval_s=0.60`、`minInterval_s=0.20`、`rampDuration_s=60`；替代旧的 `1.20s → 0.45s / 120s`，加快保护平民场景的入场节奏。
- JSON 中的 `spawnPoints` 引用地图出生点，`distribution` 配置四侧各 `0.25`；现有确定性加权调度保证均衡且可复现。
- 别墅开启 `continuousEventsOnly`，只发布 `continuous_zombie_spawn` 和一次 `generation_complete`，不发布 `wave_spawn` 或带波次号的 `zombie_batch_spawn`。
- 连续模式的完成状态只来自 `SpawnSystem.isGenerationComplete()`；不能因为配置的旧 `waves=[]` 而提前完成。
- 达到上限后不补生成，不以当前存活僵尸数决定新生成数量。

## 3. 门窗状态与碰撞

门窗属于地形，不是 `Unit`。

`MapModel` 为 `door/window` 创建独立耐久；`getEntranceStates()` 返回门窗类型、侧面、当前耐久、最大耐久和 `destroyed`。保留 `getDoorStates()` 供旧场景使用，只返回门。

`damageDoor()` 是兼容旧接口的门窗扣血入口，耐久归零后使导航缓存失效。`isBlocking()` 规则：

- 实体移动：完整墙、完整门窗阻挡；破坏门窗不阻挡。
- 规划入口路径：`nextWaypoint(..., ignoreDoors=true)` 同时忽略门和窗，仅规划潜在可达路线。
- 实际移动：必须再用不忽略门窗的 `firstBlockingTerrain()` 检查扫掠碰撞，不能按规划路线直接穿过完整门窗。
- 近战：不忽略门窗和墙体，不能隔墙攻击平民。
- 士兵射击沿用现有门洞射界规则，门窗可提供射界，实体墙始终阻挡。

`getWallStates()` 以该侧门窗耐久汇总 HUD 状态；“已破”代表该侧有入口被破坏，不代表整面墙消失。旧的独立 `VillaWallModel` 不参与当前场景运行。

## 4. 僵尸进入与目标选择

`CombatSystem` 可注入 `CivilianStore`，别墅调用 `rescueZombie()`；其他关卡继续使用现有僵尸行为。

1. 获取最近的有效平民；若近战范围内已有无墙体遮挡的士兵，则由该士兵拦截。
2. 使用忽略门窗的导航图寻找下一拐点，实体墙仍参与路径计算。
3. 检查路径上的第一处实际阻挡。若为完整门窗且到达攻击距离，停止移动并累计近战攻击间隔。
4. 每次有效攻击扣除该门窗耐久；发布门或窗各自的受损事件。耐久归零后发布对应破坏事件。
5. 门窗破坏后重新规划，并通过扫掠碰撞进入；剩余墙段持续阻挡。
6. 进屋后靠近平民，只有距离满足近战条件且射线没有实体阻挡时才调用 `CivilianStore.hit()`。

门事件：`door_damaged`、`door_destroyed`；窗事件：`window_damaged`、`window_destroyed`。僵尸不能翻越完整墙体，也不能通过墙角或地图外部进入。

## 5. 平民数据与表现

`CivilianStore` 独立于士兵 `UnitStore`，平民不混入士兵存活数、选中集合、移动指令和战斗统计。

- `idle`：正常，原地固定。
- `transforming`：首次有效攻击后开始，原地固定，模拟时钟累计 `0.8s`。
- `transformed`：在相同位置创建 `normal_zombie`，原平民不再绘制，立即进入失败判定。

仅 `idle` 能触发变身。零伤害、非法伤害、重复攻击不重复发布状态事件。事件依次为 `civilian_hit`、`civilian_transform_started`、`civilian_transformed`。

`BattleTestHarness.getCivilians()` 返回数据副本。`BattleSceneController.draw()` 每帧将此集合传给 `UnitView.render()`，确保平民从首帧可见；不能只在快照中保留数量而漏掉实体绘制。

`UnitView` 使用统一蓝色 `#4BA3FF` 主体、浅蓝描边、半径 `14px` 和无武器的人形标记；变身时暗蓝闪烁并绘制进度条。平民没有选中光圈、移动箭头、武器和攻击范围。

## 6. 会话、HUD 与胜负

`BattleSession` 对别墅将 `deploymentRemaining` 设为零；暂停时不推进模拟，因此也不推进变身计时。重启清空单位、门窗状态、平民状态、生成计数、事件游标和视图暂态。

胜负顺序：

1. 任意平民 `transformed`：失败，优先于清场胜利。
2. 生成结束、没有存活僵尸、六名平民全部 `idle`：胜利。
3. 生成尚未结束，或平民正在变身：保持运行，不能提前胜利。

HUD 显示平民数量、北东西南入口状态、存活僵尸和生成进度；不显示波次、评分、击杀排行或士兵表现统计。结算使用“6 名平民成功获救”或“平民被感染，解救失败”。

`MapView` 绘制紧凑墙段、棕色双扇大门和青蓝窗户；耐久下降显示裂纹和条形反馈，破坏后绘制碎片。场景选择提供第三个别墅入口，三个场景按钮与返回按钮的触摸区不能重叠。

## 7. 验证

核心回归：`test/core/villa-rescue.test.ts`。

- 开局六平民、七士兵、正确兵种和站位、部署时间零。
- 平民不可移动，外部修改读取副本不会改变模拟。
- 四角封闭，四窗一门正确，门窗破坏只开放自身范围。
- 四侧独立僵尸完成接近、攻击门窗、破坏、进入和命中平民的链路。
- 移动不扫过有效墙段，完整入口时不命中平民。
- 240 次生成全部仍在外围条带，无波次事件，只发布一次生成完成。
- 平民受击后 0.8 秒变身、去重、失败优先级。
- 默认完整战斗可清场获胜，重启恢复门窗和平民。

表现层回归：`test/adapter/villa-rescue.test.ts`。

- 从真实场景选择进入后，第一帧绘制六个蓝色平民、四扇窗和右下角门。
- 窗户破坏后不再绘制完整玻璃，旁边墙段不变。
- 变身闪烁和暂停冻结、失败文案、重新开始恢复。
- 别墅隐藏波次和统计评分，三个场景与返回按钮没有触摸区交叠。

运行类型检查、全部核心/适配器回归、接受度测试并同步 Cocos bundle。引擎真机显示仍需在 Cocos/微信环境中人工复核；自动表现测试使用项目的 Cocos 边界替身。
