import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';

// Exercise production controller/input/render pools; only unavailable cc is doubled.
test('wall frame windows account for slow frames independently of capped simulation dt',()=>{
  const f=fixture(true),c=f.controller;
  assert.ok(c.performance,'controller must expose live instrumentation');
  c.update(.016);
  f.advanceTime(16);c.update(.016);
  f.advanceTime(250);c.update(.25);
  const m=c.performance.snapshot();
  assert.equal(m.frames.sampleCount,2);
  assert.equal(m.frames.elapsedMs,266);
  assert.equal(m.frames.fps,2000/266);
  assert.equal(m.frames.slowFrames,1);
  assert.equal(m.frames.maxFrameMs,250);
  assert.equal(m.frames.coreMs,0);assert.equal(m.frames.presentationMs,0);
  assert.ok(c.session.deploymentRemaining>2.9,'do not uncap/change combat for metrics');
});

test('pause and background gaps are excluded even when no paused update occurs',()=>{
  const f=fixture(true),c=f.controller;c.update(.016);f.advanceTime(16);c.update(.016);
  f.button(0,'start');f.button(0,'end');f.advanceTime(10000);
  f.button(0,'start');f.button(0,'end');c.update(.016);
  c.hide();f.advanceTime(10000);f.button(0,'start');f.button(0,'end');c.update(.016);
  assert.ok(c.performance,'live instrumentation missing');
  assert.equal(c.performance.snapshot().frames.elapsedMs,16);
  f.advanceTime(16);c.update(.016);assert.equal(c.performance.snapshot().frames.elapsedMs,32);
});

test('release, core application and first adapter feedback timestamps come from real input/render',()=>{
  const f=fixture(true),c=f.controller;
  assert.ok(c.performance,'live instrumentation missing');
  const u=c.session.battle.getUnits().find((u:any)=>u.faction==='human');
  const frame=c.frame,p={x:frame.x+u.position.x*frame.scale,y:frame.y+(2400-u.position.y)*frame.scale};
  f.touch('start',1,p.x,p.y);f.touch('end',1,p.x,p.y); // tap is not a command
  assert.equal(c.performance.snapshot().commands.length,0);
  f.touch('start',1,p.x,p.y);f.setTime(1010);f.touch('end',1,p.x+100,p.y);
  assert.ok(c.session.battle.getUnits().some((u:any)=>u.state==='Moving'));
  let record=c.performance.snapshot().commands[0];
  assert.equal(record.releasedAtMs,1010);assert.equal(record.appliedAtMs,1010);
  assert.equal(record.feedbackAtMs,null);
  f.setTime(1035);c.update(.016);record=c.performance.snapshot().commands[0];
  assert.equal(record.feedbackAtMs,1035);assert.equal(record.responseMs,25);
  f.setTime(1040);c.update(.016);assert.equal(c.performance.snapshot().commands[0].feedbackAtMs,1035);
});

test('actual projectile stream and death caches reset at terminal and across twenty restarts',()=>{
  const f=fixture(true),c=f.controller;
  const initial=c.root.children.length;
  let peak=0,deathPeak=0;
  for(let run=0;run<20;run++){
    if(run===0){
      // One full idle run observes real projectile/death pools and reaches the
      // current terminal state. The remaining restarts focus on
      // reset/reuse invariants so the suite stays practical.
      c.session.tick(30);(c as any).draw();
      const pools=c.projectiles.counts;
      assert.ok(pools,'real projectile pool must expose its active baseline');
      peak=Math.max(peak,pools.active);deathPeak=Math.max(deathPeak,c.units.retainedDeaths);
      c.session.tick(100);(c as any).draw();
      assert.equal(c.session.snapshot.result,'lose');
    }
    assert.equal(c.projectiles.counts.active,0);assert.equal(c.projectiles.counts.hits,0);
    assert.equal(c.units.retainedDeaths,0);
    assert.equal(c.performance.snapshot().pools.projectiles,0);
    c.restart();assert.equal(c.projectiles.counts.active,0);assert.equal(c.units.retainedDeaths,0);
    assert.equal(c.root.children.length,initial,'restart does not allocate new render nodes');
    assert.equal(c.performance.snapshot().frames.sampleCount,0);
  }
  assert.ok(peak>0,'must observe actual projectile activity before clearing');
  assert.ok(deathPeak>0,'must observe actual death cache before clearing');
});

 test('controller separates real tick CPU and presentation submission CPU slices',()=>{
   const f=fixture(true),c=f.controller;
   const tick=c.session.tick.bind(c.session),draw=c.draw.bind(c);
   c.session.tick=(dt:number)=>{tick(dt);f.advanceTime(3);};
   c.draw=()=>{draw();f.advanceTime(7);};
   c.update(.016);f.advanceTime(6);c.update(.016);
   const m=c.performance.snapshot().frames;
   assert.equal(m.coreMs,3);assert.equal(m.presentationMs,7);assert.equal(m.elapsedMs,16);
 });
