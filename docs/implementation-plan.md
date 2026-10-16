# Zombie Defense MVP Implementation Plan

> 历史实现计划：保留原任务与当时环境记录，未勾选清单不代表当前完成度。下文“无 Git”、旧工程文件路径和早期数值是当时假设，不作为当前环境或命令依据。当前状态见 [文档索引](README.md)、[实际架构](architecture.md) 与 [发布清单](release-checklist.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a testable MVP of the three-route zombie-defense battle, with fixed-time waves, group movement, ordinary zombies, projectile trajectories, simplified breach damage, and a Cocos/WeChat integration boundary.

**Architecture:** Keep deterministic battle rules in a headless TypeScript core that does not import Cocos APIs. The core owns time, waves, units, movement commands, projectile hit validity, damage, breach state, and win/lose results. A thin Cocos adapter owns nodes, touch input, rendering, HUD, projectile visuals, and object pools; it consumes core snapshots/events rather than deciding combat outcomes.

**Tech Stack:** TypeScript, Node.js test runner (`node:test`), Cocos Creator 3.x adapter APIs, JSON configuration, WeChat Mini Game build target.

**Spec:** `/root/zombie-defense-game/docs/01-zombie-defense-gameplay-overview.md`, `/root/zombie-defense-game/docs/03-zombie-defense-test-level-design.md`, `/root/zombie-defense-game/docs/06-map-design.md`, `/root/zombie-defense-game/docs/07-unit-design.md`, `/root/zombie-defense-game/docs/08-combat-numeric-model.md`, `/root/zombie-defense-game/docs/09-mvp-acceptance-and-automation.md`

## Global Constraints

- The MVP has one map with exactly three routes: left `A`, center `B`, right `C`.
- A 3-second deployment phase precedes battle time; battle time starts at zero after deployment.
- Waves spawn at battle time `0s`, `7s`, and `20s`, without waiting for earlier waves to clear.
- The MVP has 50 riflemen and ordinary zombies only; no elite zombies, random events, fog, multi-unit selection, blank-area box selection, camera zoom, or camera pan.
- Players select a nearby group within `72px`; they never select an individual unit.
- Riflemen stop attacking while moving; ordinary zombies attack only after crossing `defense_line_y=1200` and reaching `28px` melee range.
- Rifle shots create visible projectile trajectories; the combat core remains authoritative for hit validity and damage.
- Default values come from `08-combat-numeric-model.md`; all tunable values are loaded from JSON.
- Do not commit, push, or publish by default; the user reviews delivery evidence before those operations.

## Review Focus

- Deployment-to-battle boundary: wave time must not advance during the 3-second deployment countdown; test this in the wave scheduler task.
- Projectile target death during flight: the visual projectile may finish, but it must not deal damage to a dead target; test in the projectile/combat task.
- Same-frame win/lose and post-result updates: lose wins ties and no further spawning, damage, or movement occurs; test in the battle-loop task.
- Group selection semantics: a tap selects all nearby living riflemen and never one unit or blank-area units; test in the command task.
- Pool reset correctness: reused units/projectiles must not retain HP, target, state, or active flags; test in the lifecycle task.

---

### Task 1: Project scaffold and deterministic core test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/core/types.ts`
- Create: `src/core/config.ts`
- Create: `src/core/BattleTestHarness.ts`
- Create: `test/core/scaffold.test.ts`
- Create: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `BattleConfig`, `BattleSnapshot`, `BattleEvent`, `BattleTestHarness.start()`, `advance()`, `getSnapshot()`, and `getEvents()` for later tasks.
- The harness must expose the interface documented in `09-mvp-acceptance-and-automation.md`.

- [ ] **Step 1: Write the failing test**

Create `test/core/scaffold.test.ts` that imports the planned harness, starts `LV01_zombie_wave`, advances through deployment, and asserts a snapshot can be read.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="reads an initial battle snapshot"`
Expected: FAIL because the core harness and package test script do not exist.

- [ ] **Step 3: Write the minimal scaffold**

Create the package and TypeScript configuration, define the shared types and a harness that returns an initial `deployment` snapshot with zero spawned zombies. Do not implement battle behavior yet.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- --test-name-pattern="reads an initial battle snapshot"`
Expected: PASS.

- [ ] **Step 5: Run the complete current suite**

Run: `npm test`
Expected: PASS with the scaffold test passing.

### Task 2: Configuration, map, and fixed-time wave scheduler

**Files:**
- Create: `config/map.json`
- Create: `config/units.json`
- Create: `config/levels.json`
- Create: `src/core/MapModel.ts`
- Create: `src/core/WaveManager.ts`
- Modify: `src/core/BattleTestHarness.ts`
- Create: `test/core/waves.test.ts`

**Interfaces:**
- Consumes `BattleConfig` and the harness from Task 1.
- Produces `MapModel.getRoute()`, `WaveManager.update(battleTime)`, and deterministic spawn events consumed by the battle loop.

- [ ] **Step 1: Write failing wave tests**

Cover: no spawn during deployment; 50 center zombies at battle `0s`; 100 zombies at `7s` split A/C; 200 zombies at `20s` split A/B/C; all types are `normal_zombie`; previous waves need not be cleared.

- [ ] **Step 2: Run wave tests to verify RED**

Run: `npm test -- test/core/waves.test.ts`
Expected: FAIL because the scheduler and configuration are absent.

- [ ] **Step 3: Implement configuration and scheduler**

Load the map and level JSON, end deployment explicitly, start battle time at zero, and make `WaveManager` emit each scheduled wave once when its battle time is reached.

- [ ] **Step 4: Run wave tests to verify GREEN**

Run: `npm test -- test/core/waves.test.ts`
Expected: all wave tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all current tests pass.

### Task 3: Unit lifecycle, movement, group selection, and commands

**Files:**
- Create: `src/core/UnitStore.ts`
- Create: `src/core/MovementSystem.ts`
- Create: `src/core/CommandSystem.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/BattleTestHarness.ts`
- Create: `test/core/commands.test.ts`
- Create: `test/core/lifecycle.test.ts`

**Interfaces:**
- Consumes map bounds, unit config, and spawn events.
- Produces `issueMoveAt(x, y, targetX, targetY)`, group command events, unit state transitions, and pool-safe removal/reset behavior.

- [ ] **Step 1: Write failing command and lifecycle tests**

Cover: 72px group selection, no selection in blank area, group movement, command replacement, movement arrival tolerance `12px`, moving units marked `Moving`, dead units excluded, and complete reset on reuse.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- test/core/commands.test.ts test/core/lifecycle.test.ts`
Expected: FAIL because unit storage and command systems are absent.

- [ ] **Step 3: Implement unit store and movement**

Represent units with stable IDs and explicit states. Apply one group command to all selected living riflemen, generate deterministic formation offsets, clamp targets to map bounds, and stop movement within 12px.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- test/core/commands.test.ts test/core/lifecycle.test.ts`
Expected: all focused tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all current tests pass.

### Task 4: Combat, target selection, projectile flight, breach, and result rules

**Files:**
- Create: `src/core/CombatSystem.ts`
- Create: `src/core/ProjectileSystem.ts`
- Create: `src/core/ResultSystem.ts`
- Modify: `src/core/BattleTestHarness.ts`
- Create: `test/core/combat.test.ts`
- Create: `test/core/projectile.test.ts`
- Create: `test/core/results.test.ts`

**Interfaces:**
- Consumes units, movement state, map defense line, and unit/projectile configuration.
- Produces projectile events (`projectile_spawned`, `projectile_hit`, `projectile_expired`), damage/death events, `route_breached`, and terminal `win`/`lose` results.

- [ ] **Step 1: Write failing combat tests**

Cover nearest-target selection, 0.5s rifle attack interval, no attacks while moving, ordinary zombie HP 40 dying after four valid 10-damage hits, zombie movement before breach, 28px melee damage every 1s after breach, and no duplicate death.

- [ ] **Step 2: Write failing projectile tests**

Cover 900px/s trajectory, maximum 0.35s flight time, one hit event per projectile, and a dead target receiving no damage even if the visual projectile reaches it.

- [ ] **Step 3: Write failing result tests**

Cover win only after all waves have spawned and all zombies are dead, lose when all riflemen die, lose winning a same-frame tie, and frozen state after a result.

- [ ] **Step 4: Run focused tests to verify RED**

Run: `npm test -- test/core/combat.test.ts test/core/projectile.test.ts test/core/results.test.ts`
Expected: FAIL because combat, projectile, and result systems are absent.

- [ ] **Step 5: Implement the minimal authoritative systems**

Use direct core events for combat outcomes and a separate projectile simulation for visual timing. Revalidate target liveness at hit time. Stop all updates after a terminal result.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run: `npm test -- test/core/combat.test.ts test/core/projectile.test.ts test/core/results.test.ts`
Expected: all focused tests pass.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all current tests pass.

### Task 5: Full battle harness, acceptance scenarios, and reports

**Files:**
- Modify: `src/core/BattleTestHarness.ts`
- Create: `test/acceptance/mvp-acceptance.test.ts`
- Create: `scripts/run-acceptance.mjs`
- Create: `docs/testing/mvp-test-report-template.json`
- Modify: `README.md`

**Interfaces:**
- Consumes the completed core systems.
- Produces repeatable W1-W7 wave checks, movement checks, combat checks, result checks, and JSON report output.

- [ ] **Step 1: Write failing acceptance tests**

Implement the W1-W7 scenarios and the fixed scripted command scenario from `09-mvp-acceptance-and-automation.md`, including deterministic report fields.

- [ ] **Step 2: Run acceptance tests to verify RED**

Run: `npm run test:acceptance`
Expected: FAIL for missing complete-loop behavior or unmet baseline assertions.

- [ ] **Step 3: Complete the harness integration**

Connect deployment, wave scheduling, unit updates, movement, combat, projectile timing, result checks, and event collection in one deterministic update order.

- [ ] **Step 4: Run acceptance tests to verify GREEN**

Run: `npm run test:acceptance`
Expected: all functional acceptance tests pass; if numeric target ranges fail, record the actual values and adjust only configuration after identifying the responsible rule.

- [ ] **Step 5: Run the complete suite and report generator**

Run: `npm test && npm run acceptance:report`
Expected: all tests pass and a JSON report is generated using the documented schema.

### Task 6: Cocos Creator adapter and runnable battle scene skeleton

**Files:**
- Create: `project.json`
- Create: `settings/v2/packages.json`
- Create: `assets/scripts/adapter/BattleSceneController.ts`
- Create: `assets/scripts/adapter/InputManager.ts`
- Create: `assets/scripts/adapter/UnitView.ts`
- Create: `assets/scripts/adapter/ProjectileViewPool.ts`
- Create: `assets/scripts/adapter/HudController.ts`
- Create: `assets/scripts/adapter/MapView.ts`
- Create: `assets/scenes/Battle.scene`
- Create: `README-cocos.md`

**Interfaces:**
- Consumes core snapshots/events from `src/core`.
- Produces rendered map, 50 unit views, group drag commands, projectile trails, breach warnings, HUD counts, and result overlay without duplicating combat rules.

- [ ] **Step 1: Write adapter contract tests**

Test pure adapter helpers for screen-to-map conversion, group command drag threshold, target clamping, and projectile event-to-view lifecycle without requiring a Cocos runtime.

- [ ] **Step 2: Run adapter tests to verify RED**

Run: `npm test -- test/adapter`
Expected: FAIL because adapter helpers are absent.

- [ ] **Step 3: Implement the thin Cocos adapter**

Bind touch input to `issueMoveAt`, render the three-route map and unit colors, animate projectile views from spawn to target, render arrows and breach warnings, and update HUD from snapshots.

- [ ] **Step 4: Run adapter tests to verify GREEN**

Run: `npm test -- test/adapter`
Expected: all adapter contract tests pass.

- [ ] **Step 5: Run all available verification**

Run: `npm test && npm run test:acceptance`
Expected: all headless and adapter-contract tests pass. Cocos Creator editor preview/build remains environment-dependent and must be reported if unavailable.

### Task 7: Performance instrumentation and handoff documentation

**Files:**
- Create: `assets/scripts/adapter/FpsMonitor.ts`
- Create: `assets/scripts/adapter/PerfBudget.ts`
- Create: `test/performance/perf-budget.test.ts`
- Modify: `README.md`
- Modify: `docs/09-mvp-acceptance-and-automation.md`

**Interfaces:**
- Consumes battle snapshots and frame timings.
- Produces FPS/latency counters, budget warnings, and documented commands for headless verification and Cocos preview.

- [ ] **Step 1: Write failing budget tests**

Cover frame budget accounting, command response timestamp capture, and object-pool active-count return to baseline after a completed battle.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- test/performance/perf-budget.test.ts`
Expected: FAIL because instrumentation is absent.

- [ ] **Step 3: Implement instrumentation**

Keep measurement code passive; do not alter combat behavior to satisfy a budget. Expose development-only warnings and report fields.

- [ ] **Step 4: Run focused and complete tests**

Run: `npm test -- test/performance/perf-budget.test.ts && npm test && npm run test:acceptance`
Expected: all tests pass.

- [ ] **Step 5: Document environment-dependent verification**

Document exact commands, expected outputs, Cocos Creator version requirement, WeChat DevTools preview steps, and unverified real-device limits.

---

## Implementation Notes

- No Cocos Creator executable is currently available in the environment. Headless core and adapter-contract tests must be completed here; actual editor preview, WeChat DevTools build, and device FPS verification require the user's local tools.
- The repository currently has no `.git` directory. Do not claim commits or branch status until a repository is initialized or supplied by the user.
- The first vertical slice is Tasks 1–5: it proves all gameplay rules without depending on an editor installation. Tasks 6–7 are integration and instrumentation.
