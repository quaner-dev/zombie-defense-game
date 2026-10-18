# Zombie Defense · 四向僵尸防守

实时士兵微操防守游戏：进入游戏先选择故事模式或场景演练；故事从大屋内部开始，三波通关后前往大楼楼下，第二关同样三波。当前小队为 7 名士兵，喷火兵可对火焰范围内的多个僵尸造成伤害。大屋外围墙体形成一个完整大厅，南北两扇可被僵尸攻击破坏的大门；僵尸从南北入口出生并先攻击挡路的大门。楼下场景则从地图四边出怪。玩家可在固定范围内选中一名士兵并拖拽微操。独立 TypeScript 核心负责战斗规则，Cocos Creator 3.8.8 适配层负责输入、Graphics 绘制与 HUD。

场景已独立为 `src/scenes/` 内容模块，第二关使用更宽、更长的长方形建筑墙体。查看 [故事与场景设计稿](docs/10-story-scenes-design.md) 和可在浏览器中直接打开的 [交互设计预览](docs/design/scenes-preview.html)。场景回归运行 `npm run test:scenes`；本轮结果见 [场景与战斗验证记录](docs/testing/scenes-test-report.md)。

**当前是已做无渲染验证的核心与已编写的 Cocos 场景适配层。Creator 导入、预览、Web Mobile/微信构建及真机性能尚未验证，不能视为可发布版本。**

## 快速开始

准备独立安装的 **Node.js v26.8.1** 和 npm。v26.8.1 是本轮执行验证使用的版本；项目尚无 `engines` 约束或版本矩阵，不宣称 Node 20/22 或其他版本兼容。Creator 自带 Node 不替代此前置条件。

在完整源码根目录执行：

```sh
npm ci
npm run sync:core
npm test
npm run typecheck
npm run typecheck:cocos
npm run check:cocos-bundle
```

这些命令不会启动游戏画面。`npm test` 自动同步生成核心；bundle 检查**不是引擎构建**。可视运行请按 [上手与使用](docs/getting-started.md) 安装 Creator 3.8.8，导入 `assets/scenes/Battle.scene`。完整测试含 20 局重启回归和临时源码副本的真实依赖安装，耗时较长且需要网络。

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

3秒布阵结束才启动战斗钟，无跳过入口；波次按场景在0/7/20s或0/14/30s触发，不等待清场。A/B/C是士兵分组与僵尸统计标签。大屋的僵尸从南北入口出生，追击时遇墙沿墙角寻路，并优先攻击路线上的关闭大门；门被破坏后才可进入大厅。楼下僵尸从北、南、东、西边缘进入。僵尸28px内按间隔攻击。两张故事地图的完整墙体不能翻越；旧地图中显式配置 `stackRequired` 的矮障碍仍保留堆叠翻越规则。每次按下仅选中112px圆内距离最近的一名存活士兵，该士兵向松手点附近靠拢，移动中仍会自动索敌和射击。全灭失败优先。50ms固定步进。

当前配置：最多7名士兵，初始编成为4名步枪兵、2名喷火兵和1名盾兵。步枪射程260px、士兵速度48px/s，略快于僵尸的41.9px/s；步枪每0.35s一发、单发30点伤害，僵尸60HP、攻击间隔0.13s。喷火兵每次启动持续0.6s，190px射程、72px火焰范围半径，每0.1s结算24点持续伤害，并显示连续火焰轨迹和命中特效。大屋每扇门耐久600；墙体遮挡射击，门允许隔门射击；楼下无门。僵尸在波次之间持续留场，不会因新一波开始而重置；大屋每批10只、间隔0.5s、全关700只，楼下每批10只、间隔0.5s、全关270只。士兵和僵尸的显示直径都已放大为原来的两倍。射击须同时满足距离和墙体遮挡判断，飞行途中碰墙即停止，目标中途躲到墙后也不会扣血；拖拽时显示固定选择圆与一名士兵的射程参考圈。枪口闪光、飞行亮线与弹头显示射击方向，命中弹道保留0.10s，近距离也可见；边框保持静态中性色，不再红色闪动。

自动化覆盖核心战斗、大门耐久、火焰范围伤害、寻路和两种场景的出生布局。本轮整局结果和检查见 [场景与战斗验证记录](docs/testing/scenes-test-report.md)；运行 `npm run acceptance:report -- --output dist/reports/mvp-test-report.json` 可生成当前配置的 JSON。仓库内 [旧 JSON 报告](docs/testing/mvp-test-report.json) 保留历史配置数据。seed当前不影响随机战斗，完整状态/事件在不同帧分段下应等价。

可选微信破门短振动已实现，同批合并、1000ms限频，物理效果未验证。墙侧阴影仍延期；卡顿策略待Cocos反馈，GitHub/许可证/发布暂缓。[用户Cocos手测清单与模板](docs/testing/cocos-manual-checklist.md)用于后续记录，自动化通过不等于平台验收。实际测试计数及检查结果见 [本轮验证记录](docs/testing/scenes-test-report.md)；旧99项记录不代表当前套件。

## 授权与灵感来源

**项目开源许可证尚未选择，当前不声明项目已按某开源许可证授权。** 公开发布前需明确许可证、贡献授权和第三方材料处理；公开可见不能代替授权决定。当前没有为项目新增 LICENSE。

玩法设计记录的灵感来源是 B 站《50步枪兵 VS 3波僵尸》（BV1YTp362EkH，作者：这球有问题，EP03）。这是来源说明，不代表获得视频、素材、名称或其他内容的转载、衍生或商业使用许可。场景序列化参考 Cocos 官方示例，详见 [Cocos 参考资料](README-cocos.md#evidence-and-schema-references)；发布前仍须审查示例和依赖的许可、署名要求。
