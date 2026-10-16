import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../test-support/cocos-fixture.js';

// Controlled spatial fixtures run real CombatSystem -> incremental session ->
// controller -> platform boundary. This is NOT a Creator/device acceptance test.
function cross(c:any,count=1){
  c.session.battle.endDeployment();
  for(let i=0;i<count;i++)c.session.battle.units.spawn('normal_zombie',{x:540+i*30,y:1200},'B');
}

for(const kind of ['absent','noncallable','throw','reject'] as const)test(`real controller progresses with ${kind} platform`,async()=>{
  const platform=kind==='absent'?undefined:kind==='noncallable'?{vibrateShort:1}:{vibrateShort(){if(kind==='throw')throw Error('native');return Promise.reject(Error('native async'));}};
  const f=fixture(true,platform),c=f.controller;
  cross(c);assert.doesNotThrow(()=>c.update(.05));
  await new Promise(resolve=>setImmediate(resolve));
  const before=c.session.snapshot.time_s;c.update(.05);assert.ok(c.session.snapshot.time_s>before);
  c.onDestroy();
});

test('real controller consumes new breaches once, never snapshot/history/render repeats',()=>{
  let calls=0;const f=fixture(true,{vibrateShort(){calls++;}}),c=f.controller;
  c.session.battle.getEvents=()=>{throw Error('history must not be read');};
  c.draw();c.update(0);assert.equal(calls,0,'no startup/history feedback');
  cross(c,3);c.update(.05);assert.equal(calls,1,'coalesce real event batch');
  f.advanceTime(2000);c.draw();c.draw();c.update(.05);assert.equal(calls,1,'historical breachedRoutes cannot vibrate');
  cross(c);c.update(.05);assert.equal(calls,2,'new event after cooldown');
  c.onDestroy();
});

test('real session clears batches on pause/hide and restart resets cooldown without replay',()=>{
  let calls=0;const f=fixture(true,{vibrateShort(){calls++;}}),c=f.controller;
  cross(c);c.update(.05);assert.equal(calls,1);
  f.button(0,'start');f.button(0,'end');f.advanceTime(2000);c.update(.05);assert.equal(calls,1);
  f.button(0,'start');f.button(0,'end');c.update(.05);assert.equal(calls,1);
  c.hide();f.advanceTime(2000);c.update(.05);assert.equal(calls,1);
  f.button(0,'start');f.button(0,'end');c.update(.05);assert.equal(calls,1);
  cross(c);c.update(.05);assert.equal(calls,2);
  c.restart();c.update(0);c.draw();assert.equal(calls,2);
  cross(c);c.update(.05);assert.equal(calls,3,'fresh battle resets cooldown even at same wall time');
  c.onDestroy();
});

test('wx async fail callback is provided and harmless to real simulation',async()=>{
  let fail:any;const f=fixture(true,{vibrateShort(options:any){fail=options.fail;}}),c=f.controller;
  cross(c);c.update(.05);assert.equal(typeof fail,'function');
  await Promise.resolve();assert.doesNotThrow(()=>fail({errMsg:'not supported'}));
  const before=c.session.snapshot.time_s;c.update(.05);assert.ok(c.session.snapshot.time_s>before);
  c.onDestroy();
});

test('terminal breach is discarded and never replayed after restart',()=>{
  let calls=0;const f=fixture(true,{vibrateShort(){calls++;}}),c=f.controller;
  cross(c);
  for(const u of c.session.battle.units.all())if(u.faction==='human')u.hp=0;
  c.update(.05);assert.equal(c.session.snapshot.result,'lose');assert.equal(calls,0);
  assert.ok(c.session.events.some((e:any)=>e.type==='route_breached'));
  f.advanceTime(2000);c.draw();c.update(.05);assert.equal(calls,0);
  c.restart();c.update(0);assert.equal(calls,0);
  cross(c);c.update(.05);assert.equal(calls,1);
  c.onDestroy();
});
