# 开发指南

[返回首页](../README.md) · [架构](architecture.md) · [贡献指南](../CONTRIBUTING.md)

## 环境与工作区

已有执行记录使用 Node.js v26.7.0；本次核对为 v26.7.0 / npm 11.19.0。未建立其他 Node 版本、Windows 或操作系统支持矩阵。项目使用 ESM、JSON import attributes、tsx、node:test；不要把 TypeScript 的编译目标等同 Node 最低版本。锁文件用于依赖复现，优先 `npm ci`，不要随意改用 install 更新锁。

Cocos 版本锁定 3.8.8，声明依赖也是 `@cocos/creator-types@3.8.8`。esbuild 固定 0.28.1，其他开发依赖的范围和实际解析以 [package.json](../package.json) 与 [锁文件](../package-lock.json) 为准。

## 命令表

以下均在源码根目录执行；全部脚本名称以 package.json 为准。

| 命令 | 实际用途与副作用 |
|---|---|
| `npm ci` | 按锁安装开发依赖；不生成项目核心包 |
| `npm run sync:core` | 生成忽略的浏览器核心、声明和 facade；编辑器导入/构建前必做 |
| `npm test` | pretest 先同步，再由 Node 默认发现测试；当前环境只发现mjs文件，TS回归需显式指定 `test/core/*.test.ts` 等路径 |
| `npm run test:adapter` | pretest:adapter 先同步，再运行适配层测试 |
| `npm run test-adapter` | 上一命令的兼容别名 |
| `npm run test:scenes` | 先同步核心，再验证场景配置、模式入口、选关、重开和故事推进 |
| `npm run test:acceptance` | 直接使用源码核心的验收测试，不依赖生成包 |
| `npm run acceptance:report` | 默认覆盖已保存的 JSON 报告；场景断言失败也写报告并返回非零 |
| `npm run test:performance` | 先同步；时钟/生命周期回归含一次完整战斗和 19 次快速重开，不是设备基准 |
| `npm run typecheck` | ES2022/NodeNext 严格检查 src 与 TS 测试，不发出文件 |
| `npm run typecheck:cocos` | 先同步，再按 tsconfig.cocos.json 用真实 3.8.8 声明检查 assets |
| `npm run check:cocos-bundle` | 内部同步；浏览器 realm 执行核心，检查适配包仅外部引用 cc、场景引用和脚本 UUID |
| `git diff --check` | 检查当前 Git 差异的空白错误，不验证功能 |

报告自选目的地示例（避免覆盖已保存测量）：

```sh
npm run acceptance:report -- --output dist/reports/mvp-test-report.json
```

runner 的“失败也写 JSON”只指场景断言，不包括未捕获的 I/O、参数或配置错误；当前 CLI 测试未主动制造失败场景。模板 [mvp-test-report-template.json](testing/mvp-test-report-template.json) 是未开始样例，不是测量数据。报告含十个 idle 种子和一个 scripted 场景；记录命令质心、目标、intended_ids/实际 unit_ids、选择核验、弹道诊断与断言。`real_runtime_ms` 是宿主运行耗时，不是游戏时间或设备性能；固定配置下它是非确定性字段，当前 seed 不改变战斗。

## 修改配置

| 权威文件 | 内容与注意事项 |
|---|---|
| [map.json](../config/map.json) | 1080×2400、战场边界、防线、112px 选择半径、四边出生点、墙体 terrain；地图默认注册键为 default，map_id 是描述字段 |
| [levels.json](../config/levels.json) | 大屋兼容关卡 LV01_zombie_wave 的 mapId、waves和共享限速；0/7/20s 共 100/200/400 只，总计700，每0.60s最多10只 |
| [scenes/cabin.json](../config/scenes/cabin.json) | 大屋外围墙体、南北两扇 600 HP 大门、南北出生点、三波与场景文案 |
| [scenes/courtyard.json](../config/scenes/courtyard.json) | 第二关的矩形建筑、出生区域与连续生成：每 0.35s 一批 10 只，共 720 只；南北各 30%、东西各 20%，巨胃占 5%；保留的旧 waves 不参与当前连续模式 |
| [scenes/villa-rescue.json](../config/scenes/villa-rescue.json) | 连续240只，每次1只，60s内间隔0.6s降至0.2s；四边均衡，含6名平民和最多15名士兵的站位 |
| [units.json](../config/units.json) | 生命、速度、攻击、弹道与阵形；当前步枪0.35s一发、僵尸60HP/41.9px/s/0.13s |
| [core/config.ts](../src/core/config.ts)、[Roster.ts](../src/core/Roster.ts) | 大屋/楼下3s布阵、别墅0s；总上限15人，默认大屋/楼下9人、别墅7人，玩家可在每局前调整 |

有效出生阵列示例（map.json 中的一个字段，不是完整配置）：

```json
{
  "spawn_layout": { "columns": 25, "spacing_px": 22 }
}
```

路线可覆盖旧式 `spawn_layout`；关卡波次可通过 `spawnPoint` 从 north/south/east/west 四边出生。terrain 中 `blocksMovement` 墙体会阻挡移动，`stackRequired: 3` 表示墙边至少三只僵尸才能翻越。新增地图/兵种还须更新注册、类型和行为，不能只加任意 JSON 就保证扩展。当前未知关卡/地图 ID 会回落默认，不应拿成功加载当作 ID 校验。

改配置后同步核心、跑相关测试和报告，对比确定字段并说明测量改变的规则原因。不要为了通过测试放宽胜利/减员目标；原型夹具中的300px射程 / 0.5s射击 / 40HP / 60px/s僵尸 / 1s近战用于旧规则边界测试。当前步枪射程460px、速度48px/s；喷火持续模式仍每0.15s结算14伤害；僵尸41.9px/s / 0.13s 有独立回归。子弹视觉不能自行造成伤害。

### 按地图配置僵尸生成

`WaveManager` 读取关卡的生成配置，`BattleTestHarness` 负责接线，`SpawnSystem` 统一执行。存在 `level.continuousSpawn` 时使用连续模式，否则使用 `level.waves`；战斗主流程不再根据具体地图 ID 填入速度、出生点或权重。

| 字段 | 含义 |
|---|---|
| `continuousSpawn.totalTarget` | 总生成上限，非负整数；达到后停止，不因僵尸死亡补充 |
| `continuousSpawn.batchSize / interval_s` | 每批数量与间隔；批量为正整数，间隔为有限正数；首批在战斗时间 0 生成 |
| `continuousSpawn.minInterval_s / rampDuration_s` | 可选的最终间隔与渐变时长；间隔按战斗时间线性变化；未设置时保持固定间隔 |
| `continuousSpawn.initialInterval_s` | 可选的初始间隔覆盖值；一般直接使用 `interval_s` 即可 |
| `continuousSpawn.spawnPoints / distribution` | 引用当前地图的出生点 ID，并按相对权重分配；ID 不限于方向名；全部权重为 0 时轮流生成 |
| `continuousSpawn.specialRatios.gut_zombie` | 可选的巨胃僵尸占比，范围 0 到 1 |
| `continuousSpawn.continuousEventsOnly` | 仅发布连续生成事件，不发布带波次号的批次事件；保护平民场景使用此项 |
| `map.spawnPoints[].spawnArea / side` | 出生区域坐标与方向；有界区域循环复用槽位，不能让后续批次逐排延伸进室内 |
| `waves[].battleTime_s / batchSize / batchInterval_s / spawns` | 波次模式的开始时间、每批数量、批次间隔，以及各兵种、路线、出生点和总数 |
| `spawnLimits.maxBatchSize / minInterval_s` | 同场景所有生成队列共享的最大批量和最短批间隔；正整数/有限正数；积压时不集中补刷，实际生成后才计入总数 |

连续模式在配置时校验间隔、批量、目标数量、出生点、权重和特殊僵尸比例。保护平民本次由 `1.2s → 0.45s / 120s` 调整为 `0.6s → 0.2s / 60s`，总数仍为 240，只提高入场节奏；楼下原有连续参数迁入 JSON。

### 开局编成与战场操作

`BattleSession` 的故事、演练、重开、下一关入口均先进入 `roster` 页面，`confirmRoster()` 后才创建本局。核心 `BattleTestHarness.start(levelId, seed, roster?)` 可接受五种兵种的确切非负整数数量，总和1～15；不传时使用场景默认。`Roster.ts` 共用预览与部署计算；别墅显式站位来自场景JSON的 `level.soldierPositions`。

`SquadSystem` 按120地图像素连通组队、160像素拆已有连接，每0.20s复核并排除地形阻挡。普通拖动捕获整队，原地长按450ms后拖动捕获单兵；8屏幕逻辑像素以上的拖动锁定模式。整队保留相对落点，按最慢成员速度移动，等待收火/拆卸完成。`fitBattlefield()` 计算安全区约50%面积的等比居中变换，输入与所有场内绘制共用该变换。细节与实机待验项见 [设计与实现记录](14-battle-controls-and-pacing-design.md)。

### 新增场景前的确认

新增场景前必须先提问并记录用户决定，确认后再编写场景配置或实现。已有对话中明确给出的内容可直接记录，不必重复询问；没有给出的内容不得默认为上一张地图的参数。此要求也记录在根目录 [AGENTS.md](../AGENTS.md)，供后续开发遵循。

| 必须确认 | 需要记录的具体决定 | 对应配置或实现 |
|---|---|---|
| 生成模式与节奏 | 波次还是连续；首批何时出现；每批几只、间隔多久；是否逐渐加速，多久达到什么速度 | `level.waves` 或 `level.continuousSpawn`；非零连续首批延迟需要额外实现 |
| 僵尸生成位置 | 从哪几侧、哪个入口或区域出现；区域范围；各入口占比；是否随时间变化 | `map.spawnPoints`、`spawnArea`、`spawnPoints / distribution` |
| 敌人构成与总量 | 总计多少只、各兵种比例、是否有特殊僵尸、达到上限后是否停止 | `totalTarget / specialRatios` 或 `waves[].spawns` |
| 士兵编制与位置 | 士兵总数、兵种、每名士兵的初始位置或阵形；与入口、掩体和保护目标的关系 | 当前默认编制配置；显式站位使用 `initialSoldiers / soldierPositions`，新场景需接入部署读取 |
| 开场与目标 | 是否有布阵时间；平民或其他保护目标的数量、位置；胜利和失败条件 | `scenarioKind`、`civilians` 及相应部署、结算规则 |

每张新场景的设计 MD 使用以下记录模板，填入实际答案；存在待定关键项时继续确认，不先生成具体场景：

```md
## 场景前置确认

- 生成模式、首批时机：待确认
- 每批数量、初始间隔、最终间隔、加速时长：待确认
- 总生成数、敌人种类与比例：待确认
- 出生入口、区域范围、各入口权重：待确认
- 士兵编制、逐人站位或阵形：待确认
- 布阵时间：待确认
- 保护目标、位置与胜负条件：待确认
```

## 验证层级

- `test/core`：单位、命令、波次、移动、战斗、结果与生命周期边界。
- `test/acceptance`：W1–W7、整局、报告及固定本路后撤。
- `test/adapter`：坐标/手势契约、真实 controller/input/view 结合 cc 边界替身、固定步进分段等价及移动中捕获的单兵 ID。
- `test/performance`：统计、一次实际适配战斗和 19 次快速重开清理；不含真实渲染器、堆或 GPU。
- [source-workflows.test.mjs](../test/workflows/source-workflows.test.mjs)：复制无 Git/依赖/生成物的源码，真实 npm ci，验证入口自动再生、损坏产物替换、含空格路径及 foreign cwd；会下载依赖。

快速定位示例：

```sh
npm test -- test/core/commands.test.ts
npm test -- test/adapter/moving-selection.test.ts
node --test test/workflows/source-workflows.test.mjs
```

本轮的波次/帧边界专项 8 项通过，`npm run typecheck` 与 `npm run check:cocos-bundle` 通过。完整 `npm test` 有 34/35 个测试文件通过，验收文件在约 442.7 秒后以文件级失败结束；`typecheck:cocos` 与 Creator/设备验证未确认。详见[场景验证记录](testing/scenes-test-report.md)。数量随测试变化，不是固定质量阈值。

## 编辑器与构建

遵循 [上手流程](getting-started.md)，同步后用 Creator 3.8.8 导入并保存 Battle.scene。当前场景在加载时建立 Canvas、UI Camera、Graphics 与 Labels，无需贴图或 prefab；模式选择、场景演练与结算均在通用 Battle 场景中呈现。新增场景的模块约定见 [场景设计稿](10-story-scenes-design.md)。Web Mobile 与 WeChat Mini Game 都通过 Creator Project → Build，选择 Battle 启动场景。微信还需本地授权的 AppID、开发者工具和真机；仓库没有经验证的无人值守构建命令，也不把凭据写入文档或配置。

正常构建不运行 `scripts/author-cocos-scene.py`。它是依赖历史官方场景样本输入的一次性生成工具，不是源码交付可保证复现的入口；若需重建用编辑器流程，并保留资产 UUID。

## 排错

| 症状 | 检查 |
|---|---|
| generated/core 不存在或画面规则过旧 | 在完整源码目录 npm ci 后 sync:core；确认 AssetDB 重导入；不要修改生成 JS |
| 点击故事/演练时报 `Cannot read properties of undefined (reading 'defend')` | 使用显式 `Array.from` 的修复源码，重新 sync:core 并构建；按下方步骤核对启动日志中的核心包版本 |
| JSON import、tsx 或 Node API 错误 | 检查独立 Node 版本是否与 v26.7.0 记录一致；其他版本先验证再声明支持 |
| esbuild 安装脚本策略警告/二进制不可用 | 记录 npm 的真实提示，检查本地审批策略；以 sync/bundle 是否实际成功为准，勿全局盲目关闭限制 |
| 场景 missing script、Canvas 重叠 | 保留 .meta，检查首条错误，采用上手文档的新场景挂组件流程 |
| 切后台后不动、轻点无命令 | 主动 RESUME；确认按下点附近有活兵、拖拽阈值、HUD 排除与冷却 |
| 卡顿后战斗钟落后 | controller 每次 update 截 dt 到 50ms，是现有 stall 策略；不是完整墙钟追赶 |
| 工作流测试下载失败 | 检查网络与 npm registry；报告未验证，不伪称源码交付回归通过 |
| 字体、触摸、安全区、平台能力异常 | Creator/设备核查，cc 替身测试不能诊断真实引擎渲染；确认 performance.now 可用且单调 |

### 微信入口的 defend 异常与构建版本核对

此异常发生在初始士兵布阵：路线查询返回 `undefined`，随后读取 `route.defend`。当构建把 `[...map.keys()]` 转成 `[].concat(map.keys())` 时，结果是包含一个迭代器对象的数组，无法通过该对象查到路线。修复使用 `Array.from` 显式转换集合，并让数组循环直接访问索引；士兵、弹道、门状态和界面中的同类集合迭代也采用此规则。新增的 `test/adapter/array-iteration-build.test.ts` 模拟数组拼接与索引循环，验证错误复现、故事/演练入口、战斗弹道和重开。该测试不是实际 Creator 平台构建。

`assets/scripts/generated/core.js` 是生成物，只更新 `src/` 不会自动更新编辑器和微信导出包。同步脚本会在声明检查通过后写出核心，并打印由核心内容计算出的 `Build: core-…`；启动日志 `bootstrap.controller-module-ready` 中的 `data.coreBuild` 应与之相同。

在更新后的完整源码根目录执行（依赖缺失时先 `npm ci`）：

```sh
npm run sync:core
npm run test:scenes
npm run typecheck:cocos
npm run check:cocos-bundle
```

所有命令成功后，在 Creator 等待资源导入完成，必要时对 `assets/scripts/generated/core.js` 执行重新导入。重新构建微信小游戏，建议输出到新的构建目录，再让微信开发者工具打开该目录，清除缓存并重新编译。启动时搜索 `bootstrap.controller-module-ready`，确认 `coreBuild` 与本地同步命令输出一致，再检查故事模式、两个演练场景和重开。若仍报错，保留版本标识及第一条 `session.action:failed` 的完整日志，这样可以区分构建未更新与新的运行错误。

性能采集字段、调试器获取 controller 方法和设备数据要求见 [性能采集](../README-cocos.md#performance-capture-task-7)。
