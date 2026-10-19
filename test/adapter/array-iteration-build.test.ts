import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { fixture } from '../../test-support/cocos-fixture.js';

// Model array-only lowering: spread becomes concat, and for-of becomes an
// indexed loop. This is a compiler compatibility regression, not a Creator build.
function arrayOnly(code: string): string {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES5, downlevelIteration: false },
    transformers: { before: [context => {
      const visit: ts.Visitor = node => {
        if (ts.isArrayLiteralExpression(node) && node.elements.some(ts.isSpreadElement)) {
          const parts = node.elements.map(element => ts.isSpreadElement(element)
            ? ts.visitNode(element.expression, visit) as ts.Expression
            : ts.factory.createArrayLiteralExpression([ts.visitNode(element, visit) as ts.Expression]));
          return ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(
            ts.factory.createArrayLiteralExpression(), 'concat'), undefined, parts);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return source => ts.visitNode(source, visit) as ts.SourceFile;
    }] },
  }).outputText;
}

test('array-only spread reproduces the reported missing defend error', () => {
  const code = `const routes = new Map([['A', {}], ['B', {}], ['C', {}]]);
    const ids = [...routes.keys()];
    routes.get(ids[Math.floor(ids.length / 2)]).defend;`;
  assert.throws(() => vm.runInNewContext(arrayOnly(code)), /reading 'defend'/);
});

test('array-only build starts story and practice, runs combat, and restarts with a fresh squad', () => {
  const f = fixture(true, undefined, { console: undefined }, undefined, true, arrayOnly);
  const c = f.controller, s = c.session;
  const squadSize = s.initialHumans;
  const click = (index: number) => { f.button(index, 'start'); f.button(index, 'end');if(s.screen==='roster')f.confirm(); };
  const soldiers = () => s.battle.getUnits().filter((unit: { faction: string }) => unit.faction === 'human');
  try {
    assert.ok(squadSize > 0);
    assert.equal(s.screen, 'menu');
    assert.ok(c.hud.boxes.every((box: { width: number }) => box.width > 0));
    click(0);
    assert.equal(s.screen, 'battle');
    assert.equal(s.activeScene.id, 'cabin');
    assert.equal(soldiers().length, squadSize);
    assert.equal(JSON.stringify(s.map.routeIds()), '["A","B","C"]');
    assert.equal(s.map.getDoorStates().length, 2);
    for (let frame = 0; frame < 65; frame++) c.update(.05);
    assert.ok(s.snapshot.time_s > 0);
    assert.ok(s.snapshot.spawnedZombies > 0);
    // Put one admitted zombie within the squad's range to exercise flight and
    // impact without depending on the current wave travel times or balance.
    const human = soldiers()[0];
    const zombie = s.battle.units.all().find((unit: { faction: string }) => unit.faction === 'zombie');
    assert.ok(zombie);
    zombie.position = { x: human.position.x + 80, y: human.position.y };
    for (let frame = 0; frame < 30; frame++) c.update(.05);
    assert.ok(s.battle.getEvents().some((event: { type: string }) => event.type === 'projectile_hit'));
    const previousIds = new Set(s.battle.getUnits().map((unit: { id: string }) => unit.id));
    click(1);
    assert.equal(s.snapshot.time_s, 0);
    assert.equal(s.deploymentRemaining, 3);
    assert.equal(s.battle.getUnits().length, squadSize);
    assert.ok(soldiers().every((unit: { id: string }) => !previousIds.has(unit.id)));
    assert.equal(c.projectiles.counts.active, 0);
    click(2);click(1);
    assert.equal(s.screen, 'scenes');
    assert.ok(c.hud.boxes.every((box: { width: number }) => box.width > 0));
    click(1);
    assert.equal(s.screen, 'battle');
    assert.equal(s.mode, 'practice');
    assert.equal(s.activeScene.id, 'courtyard');
    assert.equal(soldiers().length, squadSize);
    const logs = c.diagnostics.dump().split('\n').map((line: string) => JSON.parse(line));
    const bootstrap = logs.find((entry: { event: string }) => entry.event === 'bootstrap.controller-module-ready');
    assert.match(bootstrap.data.coreBuild, /^core-[0-9a-f]{12}$/);
    assert.ok(logs.some((entry: { event: string; data: { screen?: string } }) =>
      entry.event === 'scene.first-draw:complete' && entry.data.screen === 'battle'));
    assert.ok(!logs.some((entry: { level: string }) => entry.level === 'error'));
  } finally { c.onDestroy(); }
});
