import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';

const entry=(console:unknown=undefined,platform?:unknown,globals?:Record<string,unknown>)=>fixture(true,platform,{console,globals},undefined,true);
const logs=(f:ReturnType<typeof entry>)=>f.controller.diagnostics.dump().split('\n').map((line:string)=>JSON.parse(line));

test('practice selection records the entire touch, action, initialization and first draw chain',()=>{
  const f=entry(),c=f.controller;
  f.button(1,'start');c.update(.016);f.button(1,'end');
  assert.equal(c.session.screen,'scenes');
  f.button(0,'start');c.update(.016);f.button(0,'end');
  assert.equal(c.session.screen,'battle');assert.equal(c.session.activeScene.id,'cabin');
  const entries=logs(f);
  for(const id of ['mode.practice','scene.cabin']){
    assert.ok(entries.some(e=>e.event==='input.button-pressed'&&e.data.id===id));
    assert.ok(entries.some(e=>e.event==='input.button-action:start'&&e.data.id===id));
    assert.ok(entries.some(e=>e.event==='session.action:start'&&e.data.button===id));
    assert.ok(entries.some(e=>e.event==='input.button-action:state'&&e.data.id===id));
  }
  const scene=entries.find(e=>e.event==='scene.first-draw:complete'&&e.data.screen==='scenes');
  assert.deepEqual(scene.data.hud.buttons.map((b:any)=>b.id),['scene.cabin','scene.courtyard','scenes.back']);
  assert.ok(scene.data.hud.labels.every((label:any)=>label.active&&label.text.length>0));
  const begin=entries.findIndex(e=>e.event==='input.button-action:start'&&e.data.id==='scene.cabin');
  const tail=entries.slice(begin).map(e=>e.event);
  for(const event of ['session.action:complete','scene.transition:start','scene.map-set:complete','layout.geometry','scene.first-draw:complete','input.button-action:complete'])assert.ok(tail.includes(event),event);
  assert.equal(c.diagnostics.state().stage,'idle');
  c.onDestroy();
});

test('misses, release outside, cancellation and layout cancellation explain rejected buttons',()=>{
  const f=entry();
  f.touch('start',1,0,0);f.touch('end',1,0,0);
  f.button(1,'start');f.touch('end',1,0,0);
  f.button(1,'start');f.button(1,'cancel');
  f.button(1,'start');f.controller.layout();f.button(1,'end');
  assert.equal(f.controller.session.screen,'menu');
  const entries=logs(f);
  assert.ok(entries.some(e=>e.event==='input.ignored'&&e.data.reason==='hud-excluded-or-button-miss'));
  assert.ok(entries.some(e=>e.event==='input.button-cancelled'&&e.data.reason==='released-outside-button'));
  assert.ok(entries.some(e=>e.event==='input.button-cancelled'&&e.data.reason==='touch-cancel'));
  assert.ok(entries.some(e=>e.event==='input.cancelled'&&e.data.reason==='layout'&&e.data.button==='mode.practice'));
  f.controller.onDestroy();
});

test('menu heartbeat continues after the first three frames and captures slow raw dt',()=>{
  const f=entry(),c=f.controller;
  f.button(1,'start');f.button(1,'end');
  for(let i=0;i<10;i++)c.update(.016);
  const before=logs(f).filter(e=>e.event==='runtime.heartbeat').length;
  f.advanceTime(5001);c.update(1);
  const entries=logs(f),beats=entries.filter(e=>e.event==='runtime.heartbeat');
  assert.equal(beats.length,before+1);
  const last=beats.at(-1);assert.equal(last.data.state.screen,'scenes');assert.equal(last.data.state.paused,true);
  assert.equal(last.data.rawDt,1);assert.equal(last.data.appliedDt,.05);
  assert.equal(last.data.state.configuredFrameRate,60);assert.equal(last.data.state.frames,11);
  assert.equal(entries.filter(e=>e.event==='update').length,3);
  assert.ok(entries.some(e=>e.event==='frame.slow'&&e.data.rawDt===1));
  assert.equal(c.session.deploymentRemaining,3);c.onDestroy();
});

test('scene initialization errors retain the target button and stack without claiming success',()=>{
  const f=entry(),c=f.controller;
  f.button(1,'start');f.button(1,'end');
  c.session.startScene=()=>{throw new Error('scene initialization failed');};
  f.button(1,'start');assert.throws(()=>f.button(1,'end'),/scene initialization failed/);
  const failure=logs(f).find(e=>e.event==='input.button-action:failed');
  assert.equal(failure.data.context.id,'scene.courtyard');
  assert.equal(failure.data.state.screen,'scenes');
  assert.match(failure.data.error.stack,/scene initialization failed/);
  assert.ok(!logs(f).some(e=>e.event==='input.button-action:state'&&e.data.id==='scene.courtyard'));
  assert.equal(f.controls.diagnosticState().heldButton,null);c.onDestroy();
});

test('frame exceptions identify the failed renderer and throttle repeated failures',()=>{
  const f=entry(),c=f.controller;
  c.hud.render=()=>{throw new Error('label render failed');};
  for(let i=0;i<4;i++)assert.throws(()=>c.update(.016),/label render failed/);
  let failures=logs(f).filter(e=>e.event==='update.render.hud:failed');
  assert.equal(failures.length,1);assert.equal(failures[0].data.state.stage,'render.hud');
  assert.match(failures[0].data.error.stack,/label render failed/);
  f.advanceTime(5001);assert.throws(()=>c.update(.016),/label render failed/);
  failures=logs(f).filter(e=>e.event==='update.render.hud:failed');assert.equal(failures.length,2);
  c.onDestroy();
});

test('WeChat error and rejection hooks preserve existing listeners, expose exports, and detach',()=>{
  const errors=new Set<Function>(),rejections=new Set<Function>(),previous=()=>{};
  errors.add(previous);
  const platform={onError(fn:Function){assert.equal(this,platform);errors.add(fn);},offError(fn:Function){errors.delete(fn);},
    onUnhandledRejection(fn:Function){rejections.add(fn);},offUnhandledRejection(fn:Function){rejections.delete(fn);},
    getDeviceInfo(){return {platform:'devtools',model:'iPhone 16',SDKVersion:'3.17.4'};},
    getWindowInfo(){return {windowWidth:393,windowHeight:852,pixelRatio:3};}};
  const gameGlobal:Record<string,unknown>={};
  const f=entry(undefined,platform,{GameGlobal:gameGlobal}),d=f.controller.diagnostics;
  d.install();assert.equal(errors.size,2);assert.equal(rejections.size,1);
  for(const fn of errors)fn(new Error('wx exploded'));
  for(const fn of rejections)fn({reason:new Error('promise rejected')});
  const entries=logs(f);
  assert.match(entries.find(e=>e.event==='runtime.uncaught-error').data.error.stack,/wx exploded/);
  assert.match(entries.find(e=>e.event==='runtime.unhandled-rejection').data.error.reason.stack,/promise rejected/);
  const environment=entries.find(e=>e.event==='runtime.environment');assert.equal(environment.data.SDKVersion,'3.17.4');
  assert.equal(environment.data.windowWidth,393);
  assert.equal(f.runtime.__ZOMBIE_DEFENSE_DEBUG__,d);assert.equal(gameGlobal.__ZOMBIE_DEFENSE_DEBUG__,d);
  assert.equal(d.state().hud.buttons[1].id,'mode.practice');
  f.controller.onDestroy();assert.deepEqual([...errors],[previous]);assert.equal(rejections.size,0);
  assert.equal(gameGlobal.__ZOMBIE_DEFENSE_DEBUG__,undefined);assert.equal(f.runtime.__ZOMBIE_DEFENSE_DEBUG__,undefined);
});

test('browser error hooks capture errors and promise rejections without suppressing them',()=>{
  const handlers=new Map<string,Function>();
  const f=entry(undefined,undefined,{addEventListener:(type:string,fn:Function)=>handlers.set(type,fn),removeEventListener:(type:string)=>handlers.delete(type)});
  handlers.get('error')!({error:new Error('browser failure')});
  handlers.get('unhandledrejection')!({reason:new Error('browser rejection')});
  assert.match(logs(f).find(e=>e.event==='runtime.uncaught-error').data.error.stack,/browser failure/);
  assert.match(logs(f).find(e=>e.event==='runtime.unhandled-rejection').data.error.stack,/browser rejection/);
  f.controller.onDestroy();assert.equal(handlers.size,0);
});

test('watchdog detects a stopped update, suppresses background warnings, and cleans up',()=>{
  let timer:Function|undefined,cleared=false;
  const f=entry(undefined,undefined,{setInterval:(fn:Function)=>{timer=fn;return 42;},clearInterval:(id:number)=>{assert.equal(id,42);cleared=true;}});
  f.advanceTime(6000);timer!();assert.equal(logs(f).filter(e=>e.event==='runtime.update-stalled').length,1);
  f.emitGame('hide');f.advanceTime(6000);timer!();assert.equal(logs(f).filter(e=>e.event==='runtime.update-stalled').length,1);
  f.emitGame('show');timer!();assert.equal(logs(f).filter(e=>e.event==='runtime.update-stalled').length,1);
  f.advanceTime(6000);timer!();assert.equal(logs(f).filter(e=>e.event==='runtime.update-stalled').length,2);
  assert.ok(logs(f).some(e=>e.event==='lifecycle.hide'));assert.ok(logs(f).some(e=>e.event==='lifecycle.show'));
  f.controller.onDestroy();assert.equal(cleared,true);
  const count=logs(f).length;f.emitGame('show');assert.equal(logs(f).length,count);
});

for(const [name,consoleValue] of [
  ['non-callable',{log:1,warn:'no',error:{}}],
  ['throwing',{log(){throw new Error('console unavailable');},warn(){throw new Error('console unavailable');},error(){throw new Error('console unavailable');}}],
] as const)test(`${name} console cannot stop a scene transition or lose buffered logs`,()=>{
  const f=entry(consoleValue);
  f.button(1,'start');f.button(1,'end');f.button(1,'start');f.button(1,'end');f.controller.update(.05);
  assert.equal(f.controller.session.activeScene.id,'courtyard');assert.equal(f.controller.session.screen,'battle');
  assert.ok(logs(f).some(e=>e.event==='scene.first-draw:complete'&&e.data.screen==='battle'));
  f.controller.onDestroy();
});

test('history is bounded, ordered, detached from live objects and handles cycles and errors',()=>{
  const f=entry(),d=f.controller.diagnostics;
  const value:any={count:0,error:new Error('snapshot error')};value.self=value;
  for(let i=0;i<350;i++){value.count=i;d.info('buffer-test',value);}
  value.count=999;
  const entries=logs(f);assert.equal(entries.length,300);assert.equal(entries[0].data.count,50);
  assert.equal(entries.at(-1).data.count,349);assert.equal(entries.at(-1).data.self,'[Circular]');
  assert.match(entries.at(-1).data.error.stack,/snapshot error/);
  for(let i=1;i<entries.length;i++)assert.equal(entries[i].sequence,entries[i-1].sequence+1);
  const copy=d.entries();copy[0].data.count=10000;assert.equal(logs(f)[0].data.count,50);
  f.controller.onDestroy();
});
