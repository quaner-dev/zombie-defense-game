# 文档索引与阅读约定

> 当前MVP：出生区域不是固定路径，僵尸从出生全场最近索敌、直线追击；警戒线不限制伤害。3秒布阵不可跳过。可选限频短振动已实现、物理效果待验证；阴影/复杂场景及发布延期。[用户Cocos手测表与模板](testing/cocos-manual-checklist.md)。

[返回首页](../README.md)

## 当前使用与实现

- [上手与操作](getting-started.md)：Node 无渲染运行、Creator 首次导入、手势与后撤。
- [实际架构](architecture.md)：以当前源码为依据的模块和数据流。
- [开发指南](development.md)：配置、命令、测试、构建和排错。
- [限制与发布清单](release-checklist.md)：复审未关闭项和平台/授权门槛。
- [页面与流程未完成项](页面与流程未完成项.md)：按当前实现梳理页面、玩家流程、验证缺口与待讨论决定。
- [验证与自动审核](验证与自动审核.md)：Node 自动审核、完整测试、Cocos 运行入口和关卡扩展回归步骤。
- [当前问题与讨论决策](open-issues-and-decisions.md)：逐项影响、建议、关闭条件及待确认决策。
- [Cocos 详细集成参考](../README-cocos.md)：编辑器 bootstrap、性能字段与采集流程。

运行事实以源码、配置和实际执行结果为准；设计要求以相应规格为准。两者有偏差时须披露，不得用“设计终版”推导“已实现/已验收”。已保存 [测量报告](testing/mvp-test-report.json) 是某次配置下的结果；[报告模板](testing/mvp-test-report-template.json) 不是运行证据。

## 保留的设计规格

| 文档 | 阅读定位 |
|---|---|
| [01 玩法总纲](01-zombie-defense-gameplay-overview.md) | 产品目标与后期方向；随机事件、成长等并非当前 MVP |
| [02 数值与平衡](02-zombie-defense-game-balance-design.md) | 原型观察与当前校准，勿将原作 OCR 视为本项目测量 |
| [03 测试关卡](03-zombie-defense-test-level-design.md) | 关卡设计与体验目标，当前战术见使用指南 |
| [04 微信技术方案](04-wechat-zombie-defense-mini-game-technical-plan.md) | 历史目标架构和性能目标；主菜单/存档等未交付，当前实现不是完整 ECS 框架 |
| [05 视觉规格](05-zombie-defense-visual-style-design.md) | 视觉要求；部分偏差明确保留，待编辑器验证 |
| [06 地图](06-map-design.md) | 空间规则，实际 JSON 与加载注册见开发指南 |
| [07 单位](07-unit-design.md) | 单位职责/状态和后期扩展；实际字段见 src/core/types.ts |
| [08 战斗模型](08-combat-numeric-model.md) | 当前默认数值与战斗规格，时间实现细节见实际架构 |
| [09 验收](09-mvp-acceptance-and-automation.md) | 可执行验收目标，不代表全部人工/设备门槛已通过 |
| [原实现计划](implementation-plan.md) | 历史任务拆分和当时环境，未勾选项不作为当前完成度判断 |

原实现计划及内部交付日志保留用于追溯，旧目录树、环境假设、早期计数和测量可能已被替代。公开使用不依赖内部工作区日志；当前必要事实已汇总在上述使用、开发和限制文档。公开发布仍须审查历史材料中的私人路径和敏感信息，不能直接把工作区当成干净发布包。
