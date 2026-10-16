# 上手与使用

[返回首页](../README.md) · [开发指南](development.md) · [限制与发布清单](release-checklist.md)

## 两种运行方式

- 无渲染模拟：独立 Node.js v26.7.0、npm、完整源码和依赖安装网络即可。无需 Creator；输出测试或 JSON，不提供网页游戏服务。
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
4. 应检查三路地图、50 个绿色步枪兵、3→2→1 布阵倒计时，以及战斗时间 0 时中路刷怪。紫色为僵尸；青色为选中与移动指令。上述是人工验收目标，尚无本环境编辑器成功记录。

若脚本缺失或序列化默认值迁移失败，先读第一条导入错误。必要时在 Creator 新建场景、添加空节点 Battle，将 `assets/scripts/adapter/BattleSceneController.ts` 拖到节点，不需 Inspector 参数；保存为原 `Battle.scene` 并保留 `.meta` UUID。组件会自行创建 Canvas 和正交 UI Camera，先移除新场景自带的默认 Canvas/Camera，防止重叠。完整说明见 [Cocos 导入说明](../README-cocos.md#prepare-and-import)。

## 操作

1. 按在至少两名存活步枪兵附近：以按下点为中心，逻辑半径 72px 内的兵被捕获为选中 ID 列表，显示青色圈。
2. 拖向目标并松手；释放点相对按下点至少相距 8 个 UI/设计坐标像素才提交。预览是虚线青色直箭头，当前不记录弯曲手指轨迹。
3. 原组选中的兵即使在拖动中移动，也按原 ID 收到替换命令；死亡和无效 ID 被核心排除，少于两名存活兵则拒绝。不重新选择后来经过按下位置的兵。
4. 目标与整队阵形限制在 x=60..1020、y=180..2160。人类移动时不射击，到达后恢复自动索敌。墙目前是表现元素，不提供障碍寻路。

轻点、空地按下、拖回起点附近、取消触摸、在 HUD 开始或结束均不能提交移动；非主触点不能接管当前手势，第二根手指不能抢走正在拖拽的控制权。命令手势有 300ms 墙钟冷却。布局变化和切后台会取消持有输入；新一局才重置冷却。

HUD 的 PAUSE/RESUME 暂停或恢复；切后台自动暂停，回前台须主动恢复。RESTART 新建战斗、清理表现与统计。终局冻结战斗和效果时间，保留存活单位、结果卡和重启操作。无镜头缩放/拖动、单兵操作或手动点选集火；白色十字只显示 AI 已选目标。

## 当前验收战术：两阶段后撤

战斗24s按A/B/C当前活兵质心各选一次，到(180,1550)/(540,1550)/(900,1550)；35s重新按各区域当前活兵位置捕获ID，到各自x、y1750，共六条正常群体命令。自动化两阶段均选17/17/16，实测74.85s胜利、4人存活；挂机25.7s首次减员、49.55s失败、57僵尸。当前僵尸41.9px/s、0.13s间隔，HP40/伤害10不变，0.25→0.13s属于平衡校准。

回放验证直接调用实际BattleSession.move；另有真实InputManager按下/松手与捕获ID回归，使用真实300ms冷却、受控墙钟且不在命令间推进战斗。它证明生产输入路径可以下达相同六命令，并不保证玩家实时逐帧操作同样存活4人；人工命令耗时应如实记录，不能宣称触控平台验收。

A/B/C是出生标签而非固定路线，僵尸从出生即全场最近索敌、直线追击；防线只警告，无伤害门槛。3秒布阵自动结束，MVP不支持跳过。可选微信短振动已实现，首次跨线同批合并且至少1000ms限频，支持性与物理效果待真机；无能力时不影响战斗。墙阴影/复杂场景和发布事项延期。

`npm run acceptance:report`默认覆盖 [当前报告](testing/mvp-test-report.json)，保留旧证据可使用`-- --output dist/reports/mvp-test-report.json`。后续由用户运行Creator；按 [手测清单与填写模板](testing/cocos-manual-checklist.md)记录，未操作的项目保持“未验证”。

## 构建去向

此仓库没有 npm 启动服务器或已验证的 Creator CLI 发布命令。先同步核心，在 Creator 的 Project → Build 选择 Web Mobile，加入 Battle 作为启动场景，构建并运行。再按 [微信与真机检查](release-checklist.md) 用合法授权的 AppID 构建 WeChat Mini Game，并在微信开发者工具打开导出目录；账号、凭据和界面操作由操作者本地完成，不写入公开仓库。
