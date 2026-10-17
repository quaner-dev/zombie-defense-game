# 上手与使用

[返回首页](../README.md) · [开发指南](development.md) · [限制与发布清单](release-checklist.md)

## 两种运行方式

- 无渲染模拟：独立 Node.js v26.8.1、npm、完整源码和依赖安装网络即可。无需 Creator；输出测试或 JSON，不提供网页游戏服务。
- 可视预览：另行通过 Cocos Dashboard 安装 **Cocos Creator 3.8.8**。项目已编写场景和动态 UI，但实际编辑器导入、渲染与构建仍待验证。不能用类型检查代替这一步。

Node 其他版本尚无验证矩阵。先在源码根目录检查 `node --version` 与 `npm --version`，不要默认使用 Creator 内置 Node。

```sh
npm ci
npm run sync:core
npm run test:adapter
npm run typecheck
npm run typecheck:cocos
npm run check:cocos-bundle
```

## 导入与首次预览

1. 在 Dashboard 中用 3.8.8 导入源码根目录。版本信息在根 `package.json`，项目设置在 `settings/v2/packages/project.json`；不要按旧计划自行补造根 `project.json`。
2. 等待 AssetDB 导入。打开 `assets/scenes/Battle.scene`；场景的 Battle 节点已关联 `BattleSceneController`。导入后用 3.8.8 保存场景。
3. 确认项目设计分辨率 1080×2400，UI/Graphics 模块可用；选择 **Current Scene**，点击 Play。
4. 应检查无固定通道的地图、50 个绿色步枪兵、3→2→1 布阵倒计时，以及战斗时间 0 时从四边进入的僵尸。紫色为僵尸；青色为选中与移动指令。上述是人工验收目标，尚无本环境编辑器成功记录。

若脚本缺失或序列化默认值迁移失败，先读第一条导入错误。必要时在 Creator 新建场景、添加空节点 Battle，将 `assets/scripts/adapter/BattleSceneController.ts` 拖到节点，不需 Inspector 参数；保存为原 `Battle.scene` 并保留 `.meta` UUID。组件会自行创建 Canvas 和正交 UI Camera，先移除新场景自带的默认 Canvas/Camera，防止重叠。完整说明见 [Cocos 导入说明](../README-cocos.md#prepare-and-import)。

## 操作

1. 按在存活步枪兵附近：每次以按下点为中心，只捕获逻辑半径 112px 内的士兵，显示固定青色选择圆；碰到旧选中组的一名士兵也不会自动选中整组。拖动不扩大范围，空地拖动不会框选或沿途收集士兵。
2. 从选中兵附近拖向目标并松手；释放点相对按下点至少相距 8 个 UI/设计坐标像素才提交。预览是虚线青色直箭头，当前不记录弯曲手指轨迹。
3. 原组选中的兵即使在拖动中移动，也按原 ID 收到替换命令；死亡和无效 ID 被核心排除。单兵也可以独立移动，不重新选择后来经过按下位置的兵。
4. 各名士兵独立向松手点附近靠拢，不保留原整队形状；个人落点保持小范围散布，并限制在 x=60..1020、y=180..2160 的可行走区域。士兵以48px/s移动，略快于41.9px/s的僵尸，移动时不射击，到达后恢复260px内自动索敌，每0.35秒射击一次。僵尸60HP，需要6次有效命中；墙体阻挡索敌和子弹，目标中途进入掩体不会被隔墙扣血。观察枪口闪光、飞行亮线和弹头，命中轨迹短暂保留，碰墙在墙面结束。士兵与僵尸都可绕墙，墙边足够3只僵尸时仍可翻墙。

轻点、空地按下、拖回起点附近、取消触摸、在 HUD 开始或结束均不能提交移动；非主触点不能接管当前手势，第二根手指不能抢走正在拖拽的控制权。命令手势有 300ms 墙钟冷却。布局变化和切后台会取消持有输入；新一局才重置冷却。

HUD 的“暂停/继续”可以暂停或恢复；切后台自动暂停，回前台须主动恢复。 “重新开始”会新建战斗并清理表现与统计。暂停、开始菜单和重开确认不属于本轮 MVP 验收。终局冻结战斗和效果时间，保留存活单位、结果卡和重启操作。无镜头缩放/拖动或手动点选集火；白色十字只显示 AI 已选目标。

## 当前验收战术：开局向中部收拢

3秒布阵结束、战斗时间0s时，按A/B/C三组活兵的当前质心依次选中，分别拖到墙下方空地(450,1400)、(540,1400)、(630,1400)，共三条正常移动命令。自动化核对每条命令的原始选中ID；另用真实InputManager按下/松手路径验证，保留300ms墙钟冷却。该示例用于当前四向地图，不能保证人工操作耗时不同仍有相同存活人数。

旧版28s/52s两阶段后撤属于历史三通道地图，已不作为当前规则的胜利验收。当前自动化实测挂机56.85s失败，收拢战术48.3s胜利、存活42人；完整结果见[验收报告](testing/mvp-test-report.json)。

A/B/C是分组与统计标签，不是固定路线；僵尸从四边出生后全场最近索敌，遇墙沿墙角绕行，最近目标无法到达时选择其他可达士兵。墙边堆叠达到3只时仍可翻墙。3秒布阵自动结束，MVP不支持跳过。可选微信短振动已实现，首次跨线同批合并且至少1000ms限频，支持性与物理效果待真机。

`npm run acceptance:report`默认覆盖 [当前报告](testing/mvp-test-report.json)，保留旧证据可使用`-- --output dist/reports/mvp-test-report.json`。后续由用户运行Creator；按 [手测清单与填写模板](testing/cocos-manual-checklist.md)记录，未操作的项目保持“未验证”。

## 构建去向

此仓库没有 npm 启动服务器或已验证的 Creator CLI 发布命令。先同步核心，在 Creator 的 Project → Build 选择 Web Mobile，加入 Battle 作为启动场景，构建并运行。再按 [微信与真机检查](release-checklist.md) 用合法授权的 AppID 构建 WeChat Mini Game，并在微信开发者工具打开导出目录；账号、凭据和界面操作由操作者本地完成，不写入公开仓库。
