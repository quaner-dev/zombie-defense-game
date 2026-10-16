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
| `npm test` | pretest 先同步，再由 Node 默认发现完整测试；含较慢性能和源码工作流测试 |
| `npm run test:adapter` | pretest:adapter 先同步，再运行适配层测试 |
| `npm run test-adapter` | 上一命令的兼容别名 |
| `npm run test:acceptance` | 直接使用源码核心的验收测试，不依赖生成包 |
| `npm run acceptance:report` | 默认覆盖已保存的 JSON 报告；场景断言失败也写报告并返回非零 |
| `npm run test:performance` | 先同步；七项时钟/生命周期回归含 20 局，历史约两分钟，不是设备基准 |
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
| [map.json](../config/map.json) | 1080×2400、战场边界、防线、72px 选择半径、路线、出生阵列；地图默认注册键为 default，map_id 是描述字段 |
| [levels.json](../config/levels.json) | LV01_zombie_wave 的 mapId、按时排序的 waves、各路类型与数量；默认 0/7/20s、50/100/200 只 |
| [units.json](../config/units.json) | 生命、速度、攻击、弹道与阵形；当前默认为全场追击配对校准41.9px/s、0.13s |
| [core/config.ts](../src/core/config.ts) | 3s 布阵、50 初始人类；不是所有参数都在 JSON |

有效出生阵列示例（map.json 中的一个字段，不是完整配置）：

```json
{
  "spawn_layout": { "columns": 9, "spacing_px": 5 }
}
```

路线可覆盖 spawn_layout；当前未完整拒绝缺失/非有限字段，修改者须先检查其值。新增地图/兵种还须更新注册、类型和行为，不能只加任意 JSON 就保证扩展。当前未知关卡/地图 ID 会回落默认，不应拿成功加载当作 ID 校验。

改配置后同步核心、跑相关测试和报告，对比确定字段并说明测量改变的规则原因。不要为了通过测试放宽胜利/减员目标；原型夹具中的 300px / 60px/s / 1s 用于旧规则边界测试，当前默认 400px / 41.9px/s / 0.13s 有独立回归。子弹视觉不能自行造成伤害。

## 验证层级

- `test/core`：单位、命令、波次、移动、战斗、结果与生命周期边界。
- `test/acceptance`：W1–W7、整局、报告及固定本路后撤。
- `test/adapter`：坐标/手势契约、真实 controller/input/view 结合 cc 边界替身、固定步进分段等价及移动组选中 ID。
- `test/performance`：统计与实际适配流程的 20 局清理；不含真实渲染器、堆或 GPU。
- [source-workflows.test.mjs](../test/workflows/source-workflows.test.mjs)：复制无 Git/依赖/生成物的源码，真实 npm ci，验证入口自动再生、损坏产物替换、含空格路径及 foreign cwd；会下载依赖。

快速定位示例：

```sh
npm test -- test/core/commands.test.ts
npm test -- test/adapter/moving-selection.test.ts
node --test test/workflows/source-workflows.test.mjs
```

本轮执行完整套件、验收、报告、两项类型检查、bundle与源码工作流，实际计数见Task3/4报告；历史99项完成口径已失效。数量随测试变化，不是固定质量阈值。

## 编辑器与构建

遵循 [上手流程](getting-started.md)，同步后用 Creator 3.8.8 导入并保存 Battle.scene。当前场景在加载时建立 Canvas、UI Camera、Graphics 与 Labels，无需贴图或 prefab；没有主菜单或独立 Result 场景。Web Mobile 与 WeChat Mini Game 都通过 Creator Project → Build，选择 Battle 启动场景。微信还需本地授权的 AppID、开发者工具和真机；仓库没有经验证的无人值守构建命令，也不把凭据写入文档或配置。

正常构建不运行 `scripts/author-cocos-scene.py`。它是依赖历史官方场景样本输入的一次性生成工具，不是源码交付可保证复现的入口；若需重建用编辑器流程，并保留资产 UUID。

## 排错

| 症状 | 检查 |
|---|---|
| generated/core 不存在或画面规则过旧 | 在完整源码目录 npm ci 后 sync:core；确认 AssetDB 重导入；不要修改生成 JS |
| JSON import、tsx 或 Node API 错误 | 检查独立 Node 版本是否与 v26.7.0 记录一致；其他版本先验证再声明支持 |
| esbuild 安装脚本策略警告/二进制不可用 | 记录 npm 的真实提示，检查本地审批策略；以 sync/bundle 是否实际成功为准，勿全局盲目关闭限制 |
| 场景 missing script、Canvas 重叠 | 保留 .meta，检查首条错误，采用上手文档的新场景挂组件流程 |
| 切后台后不动、轻点无命令 | 主动 RESUME；确认群体至少两人、拖拽阈值、HUD 排除与冷却 |
| 卡顿后战斗钟落后 | controller 每次 update 截 dt 到 50ms，是现有 stall 策略；不是完整墙钟追赶 |
| 工作流测试下载失败 | 检查网络与 npm registry；报告未验证，不伪称源码交付回归通过 |
| 字体、触摸、安全区、平台能力异常 | Creator/设备核查，cc 替身测试不能诊断真实引擎渲染；确认 performance.now 可用且单调 |

性能采集字段、调试器获取 controller 方法和设备数据要求见 [性能采集](../README-cocos.md#performance-capture-task-7)。
