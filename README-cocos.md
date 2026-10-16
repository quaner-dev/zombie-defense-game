# Cocos Creator adapter — 3.8.8

中文入口：[上手与操作](docs/getting-started.md) · [实际架构](docs/architecture.md) · [开发指南](docs/development.md) · [已知限制与发布清单](docs/release-checklist.md)。本文保留详细编辑器与采集参考；独立 Node.js v26.7.0 是已有验证版本，其他版本兼容性未建立。项目许可证尚未选择，见 [首页授权说明](README.md#授权与灵感来源)。

Authored adapter and scene bootstrap for **Cocos Creator 3.8.8**. Headless contracts, real published engine typings, and browser bundle checks are available here. **Editor import, preview, rendering, WeChat build, and device performance have not been validated in this environment.** No editor executable was found on PATH.

## Prepare and import

```sh
npm ci
npm run sync:core
npm run test-adapter
npm run typecheck
npm run typecheck:cocos
npm run check:cocos-bundle
```

Use Cocos Dashboard to import this directory with Creator **3.8.8**. The root `package.json` has `creator.version` and the project UUID. Versioned settings live in `settings/v2/packages/project.json`. Creator generates `library`, `temp`, `local`, and folder metadata on import.

Open `assets/scenes/Battle.scene`. It contains a serialized **Battle** node with **BattleSceneController** attached by its script metadata UUID. On load the component constructs a real Canvas, orthographic UI camera, Graphics layers, Labels, input listeners, and HUD. It does not require textures or prefabs. Enter Play with **Current Scene** selected. The authored scene is derived from the official Cocos test project's serialized scene graph (references below), but must still be imported and saved by 3.8.8 before calling it an editor-validated scene.

If the imported scene reports a missing script or cannot migrate the sample's defaults:

1. Inspect the first importer/console error; do not overwrite core files.
2. Create a new scene in Creator; add an empty node named **Battle**.
3. Drag `assets/scripts/adapter/BattleSceneController.ts` onto that node. No Inspector properties are required.
4. Save to `assets/scenes/Battle.scene`, preserving its `.meta` UUID. Open and play it.

The runtime creates its own Canvas/camera; remove any editor-created default Canvas/camera from the fallback scene to avoid overlapping cameras.

## Core authority and bundling

`src/core` and `config/*.json` remain the only authoritative gameplay sources. `src/adapter/BattleSession.ts` bridges clock/pause/restart to that API. `npm run sync:core` bundles them into ignored `assets/scripts/generated/core.js` using pinned esbuild, inlining JSON and resolving `.js` source imports. It also emits real TypeScript declarations to ignored `dist/cocos-types` plus a generated facade. It does not copy an editable second core under assets. Rerun after every source/config change and **before editor import or build**; keep the editor open to let AssetDB reimport the output. The generated JS is a normal ES module, not an editor plugin. Its `.meta` is versioned to preserve asset identity.

Core copying uses an explicit JSON-data clone helper instead of relying on `structuredClone`, which is not universally present in mini-game runtimes. `readEvents(cursor)` returns isolated unseen events and a new cursor; the session resets its cursor on restart. Full history remains available to headless acceptance tests but is not cloned each rendered frame. Unit snapshots are copied each frame; no gameplay state is mutated by the render classes.

## Controls and presentation

- 3 seconds of deployment, then all wave timing and combat come from core.
- Press near at least two living riflemen, capture their IDs, drag at least 8 UI/design pixels, release through `BattleSession.moveGroup` / core `issueMoveGroup`. Surviving captured identities remain selected while moving; release does not spatially reselect at the old press point. Selection radius and target bounds use config. Tap, empty start, drag back, touch cancel, UI start/release, and non-primary touch cannot submit a move. Cooldown is 300 ms of wall time.
- The preview is a dashed cyan arrow. Selected units have cyan rings; moving units have short direction arrows. Humans are green, zombies purple, both use glow/core circles. Gray walls separate the three configured routes; spawn markers and dashed defense lines show map geometry.
- Spawn/hit/expired events drive interpolated white projectile strokes and short impact flashes; visuals never apply damage. Shared Graphics streams reuse render resources instead of spawning a node per projectile.
- HUD displays counts, comparative bars, wave, battle time, deployment, pause, breach routes and result. PAUSE/RESUME and RESTART have 260×100 design-unit hit areas. App backgrounding pauses; resuming is explicit. Restart clears presentation pools and creates a fresh battle.
- `SHOW_ALL` preserves the complete 1080×2400 design; map containment inside `sys.getSafeAreaRect()` reserves top/bottom HUD space. Input uses `getUILocation()` in the same coordinate system. Map coordinates are top-left/y-down; engine Graphics are y-up. This prioritizes full battlefield visibility over the technical plan's potentially cropping Fit Height behavior.
- Terminal states freeze simulation and presentation clocks. Labels and restart stay interactive.

### Visual scope after Task 6 review

Result rendering now draws a full-visible-viewport translucent black dimmer behind the centered card (including SHOW_ALL margins), with HUD buttons above it. Waves have a white-outlined 0.5-second scale-pop banner driven by battle time; pause freezes it and restart clears its lifetime. White four-arm AI crosshairs mark distinct living zombie targets read from core `targetId` values; the renderer does not choose targets or accept target taps.

This reconciles docs/05 §§3/5 with docs/04's explicit omission of **clickable manual** focus crosshairs: read-only AI indicators are supported, manual targeting remains absent. The earlier Task 6 report's banner/crosshair deferrals are superseded, not a claim that all docs/05 MVP visuals were previously delivered. Remaining known docs/05 gaps: pressed-button highlight, curved finger-history preview/cancel fade, 8px moving-arrow sizing, wall side shading, breach shake and melee pulse. These are outstanding visual-spec deviations, not automatically optional release polish. Rendering/outline appearance and animation readability still require Creator/device review.

Input lifetime rules: a primary battlefield drag owns the gesture until release/cancel; a secondary HUD finger cannot steal it or fire a button. Paused/terminal frames cancel only battlefield gestures, preserving frame-spanning RESUME/RESTART presses. Hide, layout, destroy and restart still cancel all held input; only a new battle resets the 300ms command cooldown.

## Editor integration gate

After import, confirm there are 50 green units, three routes, a visible 3→2→1 deployment, and zombies appearing at battle time 0. Check group drag at portrait and landscape sizes, notched safe area, drag-return cancellation, secondary-touch ownership, UI exclusion, pause/background resume, breach flashes, projectile motion/hits, terminal freeze, and repeated restart. Candidate C is calibrated: the last fixed-step records show idle loss at 47.75s with 69 zombies, and approved local fallback victory at 78.30s with three humans. These are headless evidence, not editor/device acceptance.

In **Project → Project Settings**, confirm 1080×2400 resolution and UI/Graphics modules are enabled. In **Project → Build**, select **Web Mobile**, add Battle as the start scene, build and run. Then select **WeChat Mini Game**, set your authorized app ID in Creator, add the same start scene, build, and open the exported directory in WeChat DevTools. Measure real device FPS and touch latency; no 60fps claim follows from headless tests.



## Performance capture (Task 7)

Use the commands in the [developer guide](docs/development.md), including `npm run test:performance`, before importing. Expected: seven
performance tests pass, the full suite passes, both TypeScript checks return no
diagnostics, and bundle check explicitly says it is **not** an engine build.
The performance test's scripted clock values are regression fixtures, not hardware
measurements. A 20-battle pool reset test verifies real adapter track/impact/death
caches and stable render-root direct-child counts only, not the whole descendant tree; it does not measure JS heap, GPU memory,
native Graphics buffers or garbage collection.

For **Creator 3.8.8**, run `npm run sync:core`, import/save Battle.scene, and Play
Current Scene as above. In browser devtools Sources, set a breakpoint in
`BattleSceneController.update` and store `this` as a console variable (for example
`battleController`). Then resume and inspect:

```js
battleController.performance.warningsEnabled = true; // development capture only
battleController.performance.snapshot();
JSON.stringify(battleController.performance.snapshot()); // save before restart
```

Warnings default OFF and are opt-in only for development; turn them off for
release/timing comparison. They are globally rate-limited to one per 5000 ms per
battle, for >200ms wall frames, rolling <50 FPS after a full window, or >100ms
command feedback. The 60 FPS target has a separate `overBudgetFrames` counter.
No automatic combat throttling, balancing or spawning changes occur.

Snapshot definitions:
- `frames`: rolling ~1000ms of **monotonic performance.now() completion-to-completion**
  frame intervals, capped at 240 samples. `fps` is intervals/elapsed wall seconds;
  null until a valid interval. `maxFrameMs`, `slowFrames` (>200ms) and
  `overBudgetFrames` (>16.667ms with 0.01ms tolerance) describe that window, not
  lifetime peaks. Save periodic snapshots externally for a full device run.
- `coreMs`: mean measured CPU time in session.tick, including core event copying.
  `presentationMs`: mean adapter CPU time after tick through Graphics/HUD draw
  submission, including snapshot/unit copies and command cancellation. Neither
  measures engine render traversal, GPU, compositor or display presentation.
  Those costs can influence wall frame intervals but cannot be separated here.
- `commands`: latest 120 accepted group commands; release, synchronous core
  application and first subsequent adapter draw-complete timestamps (ms), plus
  release-to-feedback `responseMs`. This is **not touch-to-photon latency**; OS
  touch delivery before release and GPU/display latency are unmeasured. Tap,
  rejected gestures and rejected core commands are not samples. Pause/background
  discard pending feedback rather than counting suspended time.
- `pools`: live projectile tracks, impact flashes and retained death entries.
  These are shared Graphics-stream lifetimes, not node-per-projectile pools.
  Terminal clears transient effects/caches while retaining living units behind
  the result card; restart clears them and resets telemetry. Core history is
  retained for the current battle and resets on restart, not an endless session.

Pause/HUD resume and EVENT_HIDE break frame continuity, even if no paused update
runs. Background remains paused until explicit RESUME. Deployment is active
measured time; paused/terminal updates are excluded. The existing 50ms simulation
dt cap is unchanged; FPS uses uncapped wall time. `performance.now()` is required
(as it already was for gesture cooldown); verify it is monotonic/available in the
chosen WeChat runtime, not replace it with Date.now().

Build **Web Mobile**, include Battle as start scene, inspect console and repeat
pause/background, commands, projectile/impact cleanup, terminal and 20 restarts.
Then build **WeChat Mini Game** with an authorized AppID in Creator 3.8.8; open
the exported project in WeChat DevTools, select real-device Preview/QR, and repeat
on named mid/high and low-end devices. Capture model, OS, WeChat/DevTools version,
build mode, start/end heap/native/GPU measurements where available, rolling
snapshots throughout the peak-wave/continuous-command segment, and the engine
profiler's render/draw-call/GPU data separately. Exercise the specified peak
50 humans / 350 zombies spawned / 64 concurrent projectile visuals rather than
assuming default idle achieves that concurrency. Run both idle loss and approved
24s fallback victory; compare before/after 20 restarts and GC-stabilized memory.
Acceptance remains 60 average FPS mid/high, >=50 low-end, no >200ms spike,
<=100ms first feedback, and no sustained memory growth. **None of these device,
editor import/render, platform build or physical latency gates has been verified
here.** Task 6 visual deviations listed above remain outstanding.

## Evidence and schema references

- Official scene manual: https://docs.cocos.com/creator/3.8/manual/en/asset/scene.html
- Official input API examples: https://docs.cocos.com/creator/3.8/manual/en/engine/event/event-input.html
- Official serialized scene and meta: https://github.com/cocos/cocos-test-projects/tree/v3.8/assets/cases/ui/14.graphics
- Official project/settings samples: https://github.com/cocos/cocos-test-projects/blob/v3.8/package.json and https://github.com/cocos/cocos-test-projects/blob/v3.8/settings/v2/packages/project.json
- Official script metadata sample: https://github.com/cocos/cocos-test-projects/blob/v3.8/assets/auto-test-case/dynamic/ui/graphics.test.ts.meta
- Engine version pin: https://github.com/cocos/cocos-engine/tree/3.8.8 (commit `411f98df047c25902f93440d4b22925c2fb65461`), with published `@cocos/creator-types@3.8.8`.
- API signatures checked in that real package: `Component`, `Node`, `Canvas.cameraComponent`, `Camera`, `UITransform`, `Graphics`, `Label`, `input.on/off`, `EventTouch.getUILocation/getID`, `view`, `sys.getSafeAreaRect`, `Game.EVENT_HIDE`.

The old plan paths `project.json` at root and `settings/v2/packages.json` are intentionally not fabricated: official Creator 3.x samples use root `package.json` and per-package files under `settings/v2/packages/`. The 3.8 sample still contains some older saved defaults; editor migration remains part of the integration gate. `scripts/author-cocos-scene.py` is a historical one-off depending on a historical sample input, not a supported source-delivery build step. Public evidence boundaries are collected in the [release checklist](docs/release-checklist.md). These references attribute sources; they do not establish third-party reuse permission or the project's license.
