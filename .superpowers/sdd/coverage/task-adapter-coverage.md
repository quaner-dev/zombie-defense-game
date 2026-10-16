# Adapter coverage task

## Outcome and scope

Added **11 tests**, without changing production files, in `test/adapter/coverage-boundaries.test.ts`. Extended the existing test-only Cocos fixture to accept a console boundary, preserving its warn-only default. Existing working-tree changes in `BattleSceneController.ts` (guarded diagnostics) and `PerfBudget.ts` (authored TypeScript import annotation) were inspected and left intact. No commits.

## Verification

Node v26.7.0.

- Isolated, no coverage: `node --import tsx --test test/adapter/frame-segmentation.test.ts`: **3/3 pass**, 34,941.735967 ms. Idle replay 15,581.428672 ms; fallback replay 19,223.530784 ms.
- Baseline serialized adapter coverage: **36/36 pass**, 153,304.996001 ms.
- Final serialized adapter coverage: **47/47 pass**, 156,494.256257 ms; no skipped/cancelled tests.
- Final normal `npm run test:adapter`: **47/47 pass**, 39,092.235760 ms.
- `npm run typecheck`, `npm run typecheck:cocos`, `npm run check:cocos-bundle`, and `git diff --check`: passed. Bundle check executed browser core to lose at 49.55s/wave 3 and verified only `cc` as adapter external; this is not Creator renderer/device validation.
- Full `npm test` was attempted: tool execution was interrupted at its 420-second limit. Its final output reported **145 tests, 144 passed, 0 failed, 1 cancelled**; `test/performance/perf-budget.test.ts` was cancelled with `Promise resolution is still pending but the event loop has already resolved`. Do not report this as a fully green full suite. Source-workflow tests completed successfully even during shutdown. An isolated retry `node --import tsx --test test/performance/perf-budget.test.ts` subsequently **passed 5/5**, exit 0, in **368,973.263329 ms**; the twenty-restart pool-lifetime case alone took 368,731.950468 ms. Thus every test in that interrupted file was separately verified, but the full suite was not observed green in one uninterrupted run.

Coverage command:

```sh
node --import tsx --test --test-concurrency=1 --experimental-test-coverage \
  --test-coverage-include='assets/scripts/adapter/*.ts' \
  --test-coverage-include='src/adapter/*.ts' test/adapter/*.test.ts
```

| Direct source | Before lines / branches / functions | After lines / branches / functions |
|---|---|---|
| contracts.ts | 100 / 95 / 90 | **100 / 100 / 100** |
| VibrationAdapter.ts | 100 / 95.45 / 72.73 | **100 / 100 / 100** |
| BattleSession.ts | 100 / 92.86 / 88.89 | **100 / 100 / 100** |
| Aggregate | 100 / 94.74 / 85 | **100 / 100 / 100** |

**Coverage limitation:** Node reports only the three directly imported source modules above. Controller/render modules run via esbuild bundles in anonymous VM scripts, so they do not appear as individual source files. Diagnostic tests execute the real controller through the controlled `cc` boundary, but there is no justified controller source-coverage percentage.

## Timeout diagnosis

The frame-segmentation file has two synchronous, CPU-heavy tests: each runs four whole-battle replays (single large step, 50ms, 60fps, jitter), comparing complete snapshots, units, event histories and terminal freeze; it is not waiting on unresolved asynchronous work. No timeout is configured in that test or package scripts. Under serialized coverage, baseline replay tests took **31,081.106573 ms + 40,877.001132 ms**, versus **15,581.428672 ms + 19,223.530784 ms** without coverage. Final coverage replay tests also passed at 29,918.100131 ms + 39,229.162077 ms. Instrumentation alone therefore pushes the file beyond the previously reported ~59s external deadline, and concurrent full-battle adapter files add CPU contention. This supports a coverage/external-run-budget timeout rather than divergent simulation or diagnostic-console failure. The precise source of the earlier external 59-second limit is not present in this repository and was not independently recovered. No replay assertions, production clocks or test timeouts were weakened.

## Exact new tests and gaps covered

1. `fitMap rejects nonpositive and nonfinite dimensions in every slot`: viewport error branch and all four dimension inputs.
2. `drag ignores unrelated motion and accepts exactly eight pixels with captured identities`: unrelated move/no active drag, captured input copies, exact threshold, reset.
3. `projectile zero-distance, pre-spawn and overshoot positions stay bounded; hits expire`: zero-distance interpolation, clamp ends, unrelated event, duplicate hit, expiry lifetime.
4. `session invalid ticks clear pending batches without advancing or consuming commands`: negative/nonfinite delta guard, batch clearing, pending cursor retention, empty selection false result.
5. `session group commands obey pause and terminal gates and recover after restart`: real group forwarding, paused and terminal move/moveGroup gates, fresh-battle recovery.
6. `vibration finite-clock guard does not spend cooldown and reset clears a prior attempt`: finite guard, harmless native failure callback, reset.
7. `vibration default clock and optional wx preserve the platform receiver`: supported global wx path, default monotonic clock, truthy non-Promise result, receiver preservation; restores the global.
8. `diagnostics tolerate absent console through load, layout, restart and updates`.
9. `diagnostics tolerate null console through load, layout, restart and updates`.
10. `diagnostics tolerate warn-only console through load, layout, restart and updates`.
11. `diagnostics keep console receiver and log only the first three update frames`.

The diagnostic cases execute onLoad/layout/restart/update and assert simulation progress, not just logger calls. Noncallable or throwing `console.log` is not promised by existing behavior and was not silently converted into a new contract.

## Test-first / sensitivity evidence

These characterize existing correct behavior; no new production implementation was appropriate. The initial group test exposed an incorrect test assumption (one unit accepted as a group); the real core requires at least two living riflemen. Corrected that fixture and used two valid IDs for the pause gate so core validation cannot mask a missing adapter guard.

Used an isolated scratch copy, not the working tree, to verify tests go red for four deliberate regressions: removed viewport validation (`Missing expected exception`), removed finite vibration clock guard (`2 !== 0`), removed session command lifecycle gates (`true !== false`), and replaced optional diagnostic calls with direct console calls (three expected TypeErrors for absent/null/warn-only consoles). The scratch harness initially lacked config assets; after copying actual config, its unmutated baseline passed, then all four mutants failed for their intended behavioral reasons. Restored scratch sources; production tree unchanged by mutation checks. This is characterization-plus-mutation evidence, not a claim that previously correct production needed an implementation fix.

## Artifacts

- Created `test/adapter/coverage-boundaries.test.ts`.
- Modified test utility `test-support/cocos-fixture.ts` only.
- Created this report.
- Verification logs: `/root/.hermes/cache/scratch/adapter-coverage-before.log`, `adapter-coverage-after.log`, `adapter-normal-after.log`, `adapter-full-suite.log`, `adapter-performance-retry.log`.
- Mutation scratch copy/logs: `/root/.hermes/cache/scratch/adapter-mutation-check/`.

Other concurrently created core tests are not part of this adapter task. Creator editor import, rendered preview and platform/device acceptance remain outside this verification.
