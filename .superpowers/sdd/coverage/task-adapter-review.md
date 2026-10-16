# Independent adapter coverage review

## Verdict

Adapter checks independently pass **47/47**, both normal and serialized with coverage. Reported direct-source coverage is exactly **100.00% lines / 100.00% branches / 100.00% functions**, but this is **not controller coverage**. No blocking production defect found in the reviewed diff. One test-strength issue and one maintainability concern are noted below; no fixes or commits made.

Reviewed working tree against HEAD `5930eab` (not a clean-tree or commit-only review). Existing changes were preserved. Scope: production diagnostics in BattleSceneController/PerfBudget, shared fixture, new adapter boundary tests, adapter report, Cocos check implementation and git diff. Concurrent core coverage tests are outside this review.

## Fresh verification

Node **v26.7.0**. All commands below exited 0:

- `npm run test:adapter`: **47 tests, 47 pass, 0 fail/cancelled/skipped/todo**, duration **37657.671639 ms**. Includes the package's core-sync pretest hook.
- `node --import tsx --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include='assets/scripts/adapter/*.ts' --test-coverage-include='src/adapter/*.ts' test/adapter/*.test.ts`: **47 tests, 47 pass, 0 fail/cancelled/skipped/todo**, duration **160397.091483 ms**.
- `npm run typecheck`
- `npm run typecheck:cocos`
- `npm run check:cocos-bundle`
- `git diff --check`

Fresh logs:

- `/root/.hermes/cache/scratch/adapter-review-normal.log`
- `/root/.hermes/cache/scratch/adapter-review-coverage.log`

Exact fresh coverage output:

| Reported source | Lines | Branches | Functions |
|---|---:|---:|---:|
| assets/scripts/adapter/contracts.ts | 100.00% | 100.00% | 100.00% |
| assets/scripts/adapter/VibrationAdapter.ts | 100.00% | 100.00% | 100.00% |
| src/adapter/BattleSession.ts | 100.00% | 100.00% | 100.00% |
| all files (reported subset) | 100.00% | 100.00% | 100.00% |

No uncovered lines were listed. These are the only individual source modules in the coverage table. Include globs do not establish that every matching source file was instrumented or reported.

## Findings

### Minor: terminal-gate assertions cannot isolate the adapter guard

`test/adapter/coverage-boundaries.test.ts:63-67` asserts terminal move/moveGroup rejection and unchanged event count. However, `src/core/BattleTestHarness.ts:108-119` independently rejects both operations when the core result is not running. Removing only the terminal checks from `BattleSession.move` and `moveGroup` would therefore still satisfy those terminal assertions. The original unit coordinates/IDs may also cease to represent a valid living selection by that point. The pause checks use valid initial riflemen and do distinguish the adapter's pause guard, because the core has no corresponding session pause state.

This is not a runtime defect; terminal behavior remains correct through defense in depth. It is a regression-sensitivity limitation, particularly relative to the broad comment at test lines 8-10. The adapter report's combined lifecycle-gate mutation evidence does not establish independent sensitivity of each terminal guard. Consider a focused call-through observation in future if the adapter-specific guard itself is intended as a protected contract. No test changed here.

### Minor: broad TypeScript import suppression

`assets/scripts/adapter/PerfBudget.ts:2-3` adds a documented `@ts-ignore` for the extensionless Cocos-authored import. This preserves the existing runtime import and both typechecks pass, but suppresses all diagnostics on that import (not just NodeNext's extension diagnostic), so future missing-export/path errors at this line can be hidden. The current import resolves during both bundling and Cocos typechecking; no current runtime failure found. Treat as a maintainability tradeoff, not a blocker or a requested production refactor.

### Explicit non-defect / scope caveat

`globalThis.console?.log?.(...args)` correctly preserves the console receiver and handles absent/null console or absent log. A noncallable/throwing log remains capable of breaking load/update. The tests and adapter report explicitly do not promise resilience to those cases; this is not a newly introduced regression from direct console calls. Likewise PerfBudget's existing default warning callback still calls `console.warn` directly if warnings are enabled. Its default `warningsEnabled=false` means the absent-console tests do not establish safety of enabled performance warnings. Do not generalize their diagnostic-log guarantee to all telemetry.

## Production and fixture inspection

- BattleSceneController changes only introduce a module-local optional diagnostic helper and replace five logging call sites. Simulation steps, clocks, rendering, input lifecycle and diagnostic frame cap remain unchanged. The receiver-sensitive logger test verifies the optional-call semantics and first-three-update behavior.
- PerfBudget changes are comments/directive only; no runtime timing or budget behavior changed.
- The fixture adds an explicit third console-boundary argument and passes it into the VM. Its warn-only default is preserved. It continues executing production controller/input/HUD/core code behind the cc double rather than replacing the controller implementation.
- New boundary tests assert observable values, rejection, event batches, state progress, copies/identity, interpolation and logging rather than merely executing lines. The optional global wx test restores the original property descriptor in finally.
- The adapter report accurately limits coverage to direct-source modules and records its interrupted full-suite attempt rather than claiming an uninterrupted green full suite. This review freshly verifies the adapter suite, not the report's historical full-suite, baseline, isolated performance or mutation runs.

## Why bundle/controller source coverage is unavailable here

`test-support/cocos-fixture.ts:37-39` esbuild-bundles authored adapter modules and generated core into a CJS string, then executes it with `vm.runInNewContext` without a source filename or sourcemap. Node's source-filtered test coverage does not map that anonymous bundled execution back to individual authored controller/render modules. The real controller is behaviorally exercised, but BattleSceneController, PerfBudget, HUD and views are absent from the source coverage table. There is no defensible controller line/branch/function percentage from this run, and no claim of 100% coverage for the entire adapter directory.

## Independent Cocos check assessment

Read `scripts/check-cocos-bundle.mjs` and executed the check. It synchronizes generated core, bundles and executes browser core in a VM without Node APIs/clone global, checks a terminal result and wave 3, bundles the controller with only `cc` external, validates scene reference indices, and matches the attached controller UUID. Fresh result:

> Browser core executed to lose at 49.55s, wave 3; adapter bundle imports only cc; scene references/controller UUID consistent.

This does **not** instantiate a real Creator engine, import the project in Creator, render the camera/canvas, test device APIs, or produce a Cocos platform build. Cocos typechecking and bundle parsing do not replace those acceptance steps.

## Working-tree preservation

Initial and post-verification tracked diff remained the same: BattleSceneController **11 changed lines**, PerfBudget **2 added lines**, fixture **4 changed lines**; **3 files changed, 10 insertions, 7 deletions** overall. Untracked adapter/core tests and existing coverage report were left intact. Generated sync/check outputs introduced no new tracked diff. The only authored artifact from this review is `.superpowers/sdd/coverage/task-adapter-review.md`; no source/test edits or commits.
