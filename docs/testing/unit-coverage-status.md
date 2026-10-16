# 单元测试与覆盖率状态

更新时间：2026-10-16

## 当前结果

| 范围 | 测试 | 行覆盖率 | 分支覆盖率 | 函数覆盖率 |
|---|---:|---:|---:|---:|
| 核心代码 | 79/79 | 100.00% | 99.31% | 100.00% |
| `test/adapter/*.test.ts` | 47/47 | 100.00%* | 100.00%* | 100.00%* |
| `test/acceptance/*` | 18/18 | — | — | — |
| `test/performance/*` | 7/7 | — | — | — |
| `test/workflows/*` | 2/2 | — | — | — |

`*` 适配层覆盖率只统计 Node 能直接映射到源码的 `contracts.ts`、`VibrationAdapter.ts` 和 `src/adapter/BattleSession.ts`。Cocos 控制器、HUD、视图通过 esbuild 匿名 VM bundle 执行，当前没有 source map，不能把该行为测试结果冒充成这些文件的源码覆盖率。

## 仍未达到字面 100% 的分支

核心剩余分支是两个公开生命周期不可达的防御性分支：

1. `BattleTestHarness.runWaves()` 的 `!waveManager` 返回。公开流程在 `start()` 中先初始化 `waveManager`，所有能调用波次处理的公开路径都要求已启动。
2. `CombatSystem.nearest()` 比较器的相同 ID 返回 `0`。`UnitStore` 为每个存活单位分配唯一 ID，存储及遍历不会产生两个相同 ID 的候选单位。

没有通过调用私有方法、破坏对象内部状态、制造重复单位 ID、覆盖覆盖率阈值或忽略代码来伪造 100%。如果产品要求字面 100%，应先决定是否删除这些不可达防御分支或建立专门的内部测试接口；当前保持生产代码不变。

## 可重复命令

```bash
npm run test:coverage:core
npm run test:coverage:adapter
npm run test:adapter
npm run test:performance
npm run typecheck
npm run typecheck:cocos
npm run check:cocos-bundle
```

## 已知验证边界

- Cocos Creator 编辑器导入、真实渲染、触控、微信构建和真机振动仍需要手测。
- 全部测试串行执行受性能测试中“20 次重启”用例耗时影响，工具的 420 秒上限可能在完整命令结束前中断；各分组已独立运行并通过，不能把工具超时描述成断言失败或一次性全套通过。
- 诊断日志使用可选 `console.log`，以兼容测试替身和 Cocos 控制台；性能警告仍受其原有开发开关控制。
