# Core branch coverage review

## Scope and changes

Tests only: added four cases to the existing uncommitted `test/core/coverage-edges.test.ts` (one terminal-state case and three invalid-time cases). No production, adapter, frame-segmentation, or existing tracked test edits; no commit. Existing dirty adapter/controller/performance/fixture changes were preserved.

- Terminal defeat with zero initial humans: `endDeployment`, `advance`, positional commands and identity commands leave snapshots, units and events unchanged; identity command returns false.
- Negative, NaN and infinite elapsed times: real MovementSystem and CombatSystem return no events, preserve complete detached unit snapshots (positions, targets, state, HP, timers), and produce no shots. A moving human and in-range zombie make omitted guards observable rather than testing empty stores.

## Fresh verification

Baseline command:

```sh
NODE_V8_COVERAGE=/root/.hermes/cache/scratch/zombie-core-v8 node --import tsx --test --test-concurrency=1 --experimental-test-coverage test/core/*.test.ts
```

75 passed, zero failed. Lines/functions 100%; reported aggregate branch 98.61%; BattleTestHarness 98.46%, CombatSystem 96.30%, MovementSystem 94.44%.

Focused command:

```sh
node --import tsx --test --test-concurrency=1 test/core/coverage-edges.test.ts
```

22 passed, zero failed/cancelled/skipped.

Final core coverage command:

```sh
NODE_V8_COVERAGE=/root/.hermes/cache/scratch/zombie-core-v8-after node --import tsx --test --test-concurrency=1 --experimental-test-coverage test/core/*.test.ts
```

79 passed, zero failed/cancelled/skipped. Lines/functions 100%, aggregate branches **99.32%**. MovementSystem **100%**, CombatSystem **98.25%**, BattleTestHarness **98.44%**; all other core files 100% in all metrics. Harness percentage denominator changed under V8 instrumentation; it is not evidence of a newly untested behavior.

`npm run typecheck`: exit 0.

Raw logs: `/root/.hermes/cache/scratch/zombie-core-before.log`, `zombie-core-after.log`; raw V8 JSON is in the two directories above.

## Exact remaining alternatives (not hidden or forced)

Parsed V8 JSON across subprocesses using the narrowest enclosing range in each script, rather than treating a zero count in one test file as globally uncovered. Matched transformed offsets with esbuild using `minifyWhitespace: true`, `keepNames: true`, ESM, node22 target.

1. BattleTestHarness `runWaves`, source line 148, transformed offsets 4218–4225: `if (!this.waveManager) return`. This is unreachable through the public lifecycle: `waveManager` is assigned during `start` before `started = true`; all public paths to `runWaves` require the started state. Calling a private method or corrupting the private lifecycle solely to execute this return would not test a supported behavior.
2. CombatSystem `nearest` comparator, source line 81, transformed offsets 1980–1982: equality fallback `: 0` after both `a.id < b.id` and `a.id > b.id` are false. UnitStore allocates distinct string IDs per spawn lifetime and stores them in a Map, and `living()` returns each entry once. The compared distinct candidates cannot have equal IDs. Mutating public Unit IDs to duplicate another unit or replacing `living()` with duplicate references would violate store identity invariants solely for coverage.

Therefore **literal 100% branch coverage is not achieved** under the tests-only/no-production-edits constraint. Both remaining alternatives need an explicit decision about unreachable defensive code or the measurement policy, not meaningless tests. No coverage ignore directives, threshold reductions, private-method calls, duplicate-identity fixtures, or production modifications were introduced.

## Independent assertion review

Reviewed every case in the existing new core coverage file, not only the four additions:

- Readiness guards: throws on map access, false identity command, complete unchanged snapshot and empty event cursor.
- Cursor behavior: nested event payload mutation cannot affect retained events, consumed cursor yields no events, next cursor tracks emitted commands, malformed/out-of-range cursors throw.
- Invalid harness times: snapshot and event stream remain unchanged.
- Partial deployment tick: movement occurs, first wave emits once at deployment boundary, clock remains zero then advances by an actual battle tick.
- Unknown level/map: documented fallback wave schedule and geometry match defaults; fallback equality is intentional contract characterization, not generated expected simulation output.
- Invalid spawn coordinates and empty route: specific validation errors cover both finite and battlefield constraints.
- Spawn layouts: literal positions cover coincident default, zero count, column/spacing normalization, per-route override, width/bounds clamps.
- Single formation: literal clamped position guards division-by-zero behavior.
- Selection NaN: every argument is rejected and valid human states/targets remain unchanged.
- Zero-distance projectile: invalid intervals preserve HP; valid zero-duration arrival damages exactly once at launch timestamp, consumes projectile, and cannot reapply damage.
- New terminal/invalid-time tests: detached full-state snapshots, explicit return/event/shot assertions and nonempty real systems; no mocks or production hooks.

All tests assert observable results and use real components. No existing assertions were weakened, removed, skipped, marked todo, or changed to tolerate failures. These are coverage/characterization tests for existing code, not a production implementation red/green claim.

## Broader suite limitations

Attempted full project command `npm test -- --test-concurrency=1` twice. First run exceeded 180 seconds and was interrupted in `test/adapter/frame-segmentation.test.ts`; remaining pending files were cancelled. Retry exceeded the terminal service's effective 420-second cap (despite requesting 600 seconds): summary **148 tests, 146 passed, 0 failed, 2 cancelled**, interruption in `test/performance/perf-budget.test.ts` (the twenty-restart simulation), with `test/workflows/source-workflows.test.mjs` still pending. Both cancelled files reported `Promise resolution is still pending but the event loop has already resolved` after interruption. No claim of a passing full suite is made. Full retry log: `/root/.hermes/cache/scratch/zombie-all-complete.log`; first attempt: `zombie-all-after.log`.

A separate workflow-only retry also exceeded 60 seconds. Adapter/frame/performance tests were not modified to accelerate or weaken them. Core-focused results and typecheck above completed normally.
