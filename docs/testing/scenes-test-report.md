# 场景扩展验证记录

日期：2026-10-18。范围：模式入口、场景模块、小屋→大楼楼下、每场三波、场景设计预览。Node.js v26.8.1；本记录不代表 Creator 导入或设备验收。

## 已通过

| 检查 | 结果 |
|---|---|
| 场景专项 | 11 项通过、0 失败。覆盖模块解析、三波、出生/部署避墙、宽墙碰撞与通路、菜单冻结、演练重开、故事推进条件、末关结束、真实按钮、切换清理、安全区及当前地图的操作范围 |
| 相关适配回归 | `coverage-boundaries`、`runtime-bindings`、`offscreen-units`、`phone-viewport`、`vibration-integration` 共 32 项通过 |
| TypeScript 核心与测试 | `npm run typecheck` 通过 |
| Cocos 类型声明 | `tsc -p tsconfig.cocos.json` 通过；前序 `npm run typecheck:cocos` 同样通过 |
| 浏览器核心与适配层 bundle | `npm run check:cocos-bundle` 通过，适配层只有 `cc` 外部引用，场景 UUID/引用有效 |
| 交互设计预览 | JavaScript 语法检查通过；使用 DOM 边界替身执行故事→第二关→结束、演练返回、波次切换，通过 |
| 差异空白检查 | `git diff --check` 通过 |

场景专项命令：

```sh
npm run test:scenes
```

本次还使用 `--test-isolation=none` 查看逐条结果，避免 Node 默认报告只显示两个测试文件的汇总：

```sh
node --import tsx --test --test-isolation=none test/core/scenes.test.ts test/adapter/scene-flow.test.ts
```

## 当前内容的完整故事模拟

使用当前默认人数、兵种、地图、波次和战斗规则，没有替换调度器、修改生命或强制结果。通过 `BattleSession.startStory()` 开始，第一关结束后调用 `advanceScene()`，再继续模拟第二关：

| 场景 | 结局 | 战斗时间 | 完成波数 | 累计生成僵尸 | 存活人类 |
|---|---|---|---|---|---|
| 小屋突围 | 胜利 | 81.15 秒 | 3 | 350 | 15 |
| 楼下集结 | 胜利 | 61.70 秒 | 3 | 135 | 15 |

以上是本次工作区配置下的无渲染结果。它说明默认故事流程可完成；挂机亦可获胜，后续可根据 Creator 实际手感调整难度，不将这些数字用作长期平衡阈值。

## 综合回归未全绿

运行核心、适配层、验收和性能目录的测试，结果为 **30 个测试文件中 15 个通过、15 个失败**。本次未执行需要在临时源码副本联网安装依赖的 `test/workflows`，因此不宣称完整 `npm test` 全部通过。

开始修改场景前，核心与适配层基线已存在 15 个失败文件；工作区还在调整兵种、数值、选兵和分批出怪。本次保留这些更改，不为清除失败而改回旧配置。综合回归中的失败需要按最终玩法迁移，不能据场景专项通过认定全部旧断言仍有效。例如：

- `candidate-defaults` 仍期望步枪伤害 10，当前配置为 30；出生横向展开也已变化。
- 部分旧测试固定期望 50 名人类，当前默认 15 人。
- 旧波次验收按宣告瞬间整波生成计算累计数量，当前采用分批生成。
- 旧指挥/性能验收还包含旧选兵方式、移动攻击行为和挂机必须失败等预期。

本次综合回归日志保存在生成目录 `dist/scene-validation/regression.log`，典型旧断言的详细结果在 `dist/scene-validation/existing-failures.log`。这些日志不作为版本库中的持久源文件。

## 引擎内仍需观察

Cocos Creator 3.8.8 中的中文断行、菜单/场景卡片、实际触摸、Graphics 绘制、街角绕行与翻墙，以及 Web/微信构建尚未在本环境执行。静态预览和 cc 边界替身不提供这些运行证据。
