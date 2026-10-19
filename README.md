# Zombie Defense · 四向僵尸防守

实时士兵微操防守游戏：选择故事模式或场景演练，每局开始前自由选择五种兵种，合计1～15人。故事依次经过大屋、楼下和别墅解救。战场约占屏幕安全区面积50%并居中，士兵靠近自动组队；直接拖动整队，原地长按0.45秒后拖动单兵。喷火兵站定后持续喷火，僵尸实际受伤时自身闪白。独立TypeScript核心负责战斗规则，Cocos Creator 3.8.8适配层负责输入、Graphics绘制与HUD。完整说明见 [本轮设计与实现](docs/14-battle-controls-and-pacing-design.md)。

场景已独立为 `src/scenes/` 内容模块，第二关使用更宽、更长的长方形建筑墙体。查看 [故事与场景设计稿](docs/10-story-scenes-design.md) 和可在浏览器中直接打开的 [交互设计预览](docs/design/scenes-preview.html)。场景回归运行 `npm run test:scenes`；本轮结果见 [场景与战斗验证记录](docs/testing/scenes-test-report.md)。

**当前是已做无渲染验证的核心与已编写的 Cocos 场景适配层。Creator 导入、预览、Web Mobile/微信构建及真机性能尚未验证，不能视为可发布版本。**

## 快速开始

准备独立安装的 **Node.js v26.8.1** 和 npm。v26.8.1 是本轮执行验证使用的版本；项目尚无 `engines` 约束或版本矩阵，不宣称 Node 20/22 或其他版本兼容。Creator 自带 Node 不替代此前置条件。

在完整源码根目录执行：

```sh
npm ci
npm run sync:core
npm test
node --import tsx --test test/core/*.test.ts test/adapter/*.test.ts
npm run typecheck
npm run typecheck:cocos
npm run check:cocos-bundle
```

这些命令不会启动游戏画面。`npm test`自动同步生成核心，当前环境默认只发现mjs文件，TS核心和适配器回归使用上面的显式路径。性能与整局验收另运行 `npm run test:performance` 和 `npm run test:acceptance`。bundle检查**不是引擎构建**。可视运行按 [上手与使用](docs/getting-started.md) 导入Creator 3.8.8的Battle.scene；源码工作流测试含临时副本的真实依赖安装，需要网络。

## 文档入口

| 需要 | 文档 |
|---|---|
| 安装、启动、触屏操作、后撤示例 | [上手与使用](docs/getting-started.md) |
| 核心、适配层、时钟、命令与事件流 | [实际架构](docs/architecture.md) |
| 配置、命令、测试、构建、排错 | [开发指南](docs/development.md) |
| 模式入口、两关布局、三波节奏、后续场景提案 | [场景设计稿](docs/10-story-scenes-design.md) · [交互预览](docs/design/scenes-preview.html) |
| 编辑器操作、性能采集详细参考 | [Cocos 集成说明](README-cocos.md) |
| 已知问题、证据边界、发布检查 | [限制与发布清单](docs/release-checklist.md) |
| 设计规格与历史资料如何阅读 | [文档索引](docs/README.md) |
| 贡献与问题反馈 | [CONTRIBUTING](CONTRIBUTING.md) · [SECURITY](SECURITY.md) |

## 当前规则与证据

确认编成后，大屋/楼下有3秒布阵，别墅立即开战；选兵期间不计时。A/B/C是路线与统计标签。大屋僵尸从南北入口出生，遇墙寻路、优先破坏挡路大门；楼下和别墅四边出怪。队伍按120地图像素连通组队，已有连接超过160像素解除，墙和关闭门窗阻止组队。整队保留相对落点、按最慢成员速度移动，等待收火与拆卸；长按单兵暂时脱队。核心使用50ms固定步进。

当前默认编成大屋/楼下9人、别墅7人，可选1～15人。步枪射程460px、速度48px/s，每0.35s造成30伤害；普通僵尸60HP、速度41.9px/s、攻击间隔0.13s。喷火射程220px、锥形范围42，每0.15s造成14伤害，无过热停顿；移动前0.30s收火、停止后0.25s放火。大屋三波100/200/400只在0/7/20s开启，共700只，每0.60s最多10只；楼下连续720只，每0.35s10只；别墅连续240只，每批1只，60s内间隔0.60s降至0.20s。各场景生成限速由JSON配置。受击僵尸本体白闪0.10s，特殊标记保留，同一僵尸两次白闪起点至少相隔0.15s。

自动化覆盖核心战斗、大门耐久、火焰范围伤害、寻路和两种场景的出生布局。本轮整局结果和检查见 [场景与战斗验证记录](docs/testing/scenes-test-report.md)；运行 `npm run acceptance:report -- --output dist/reports/mvp-test-report.json` 可生成当前配置的 JSON。仓库内 [旧 JSON 报告](docs/testing/mvp-test-report.json) 保留历史配置数据。seed当前不影响随机战斗，完整状态/事件在不同帧分段下应等价。

可选微信破门短振动已实现，同批合并、1000ms限频，物理效果未验证。墙侧阴影仍延期；卡顿策略待Cocos反馈，GitHub/许可证/发布暂缓。[用户Cocos手测清单与模板](docs/testing/cocos-manual-checklist.md)用于后续记录，自动化通过不等于平台验收。实际测试计数及检查结果见 [本轮验证记录](docs/testing/scenes-test-report.md)；旧99项记录不代表当前套件。

## 授权与灵感来源

**项目开源许可证尚未选择，当前不声明项目已按某开源许可证授权。** 公开发布前需明确许可证、贡献授权和第三方材料处理；公开可见不能代替授权决定。当前没有为项目新增 LICENSE。

玩法设计记录的灵感来源是 B 站《50步枪兵 VS 3波僵尸》（BV1YTp362EkH，作者：这球有问题，EP03）。这是来源说明，不代表获得视频、素材、名称或其他内容的转载、衍生或商业使用许可。场景序列化参考 Cocos 官方示例，详见 [Cocos 参考资料](README-cocos.md#evidence-and-schema-references)；发布前仍须审查示例和依赖的许可、署名要求。
