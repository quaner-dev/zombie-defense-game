import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';

for(const scenario of ['pause','hide','terminal'] as const) test(`${scenario}: HUD release survives intervening controller frames`,()=>{
  const f=fixture(),s=f.controller.session;
  if(scenario==='pause'){f.button(0,'start');f.button(0,'end');assert.equal(s.paused,true);}
  if(scenario==='hide')f.controller.hide();
  if(scenario==='terminal'){for(let i=0;i<1200&&s.snapshot.result==='running';i++)s.tick(.1);assert.notEqual(s.snapshot.result,'running');}
  f.button(scenario==='terminal'?1:0,'start');
  f.controller.update(.016);f.controller.update(.016);
  f.button(scenario==='terminal'?1:0,'end');
  if(scenario==='terminal'){assert.equal(s.screen,'roster');f.confirm();}
  assert.equal(s.paused,false);
  assert.equal(s.snapshot.result,'running');
  if(scenario==='terminal')assert.equal(s.deploymentRemaining,3);
});

test('secondary HUD touch cannot steal primary map drag or fire pause',()=>{
  const f=fixture(),p=f.group();f.touch('start',1,p.x,p.y);assert.ok(f.controls.drag.preview);
  f.button(0,'start',2);assert.ok(f.controls.drag.preview);
  f.button(0,'end',2);assert.equal(f.controller.session.paused,false);
  f.touch('move',1,p.x+100,p.y);f.touch('end',1,p.x+100,p.y);
  assert.ok(f.controller.session.battle.getUnits().some((u:any)=>u.state==='Moving'));
});

test('restart clears previous command cooldown but ordinary cancellation retains it',()=>{
  const f=fixture(),p=f.group();
  f.touch('start',1,p.x,p.y);f.touch('end',1,p.x+100,p.y);
  f.controls.cancel();f.setTime(1001);f.touch('start',1,p.x,p.y);assert.equal(f.controls.drag.preview,null);
  f.button(1,'start');f.controller.update(.016);f.button(1,'end');f.confirm();
  const fresh=f.group();f.touch('start',1,fresh.x,fresh.y);assert.ok(f.controls.drag.preview);
});

test('hide cancels a held HUD press and destroy detaches input',()=>{
  const f=fixture();f.button(0,'start');f.controller.hide();f.button(0,'end');assert.equal(f.controller.session.paused,true);
  f.controls.destroy();f.button(0,'start');f.button(0,'end');assert.equal(f.controller.session.paused,true);
});

test('terminal HUD dims entire design viewport before drawing result card',()=>{
  const f=fixture(),s=f.controller.session;
  for(let i=0;i<1200&&s.snapshot.result==='running';i++)s.tick(.1);
  f.hud.render();const calls=f.hud.g.calls;
  const dim=calls.findIndex((c:any)=>c.kind==='rect'&&c.args.join(',')==='0,0,1080,2400'&&c.color.a>0&&c.color.a<255);
  assert.ok(dim>=0,'full viewport dim rectangle missing');
  assert.ok(calls.findIndex((c:any)=>c.kind==='roundRect'&&c.args[2]===1000)>dim);
  f.viewport.origin={x:-600,y:0};f.viewport.size={width:2280,height:2400};f.hud.render();
  assert.ok(f.hud.g.calls.some((c:any)=>c.kind==='rect'&&c.args.join(',')==='-600,0,2280,2400'),'wide visible margins also dim');
});

test('wave banner animates on wave change, freezes paused, and resets on restart',()=>{
  const f=fixture(),s=f.controller.session;s.tick(3);f.hud.render();
  const banner=f.root.getChildByName('WaveBanner');assert.ok(banner,'wave banner label missing');
  assert.equal(banner.active,true);assert.match((f.hud.waveBanner as any).string,/1/);
  const initial=banner.scale.x;s.tick(.1);f.hud.render();assert.notEqual(banner.scale.x,initial);
  const scale=banner.scale.x;s.paused=true;s.tick(1);f.hud.render();assert.equal(banner.scale.x,scale);
  s.paused=false;s.tick(1);f.hud.render();assert.equal(banner.active,false);
  f.controller.restart();assert.equal(banner.active,false);f.confirm();s.tick(3);f.hud.render();assert.equal(banner.active,true);
});

test('AI crosshair marks deduplicated living core targets, never invents a target',()=>{
  const f=fixture(),s=f.controller.session;
  const human=s.battle.getUnits().find((u:any)=>u.faction==='human');
  const a={...human,id:'a',state:'Attacking',targetId:'z'},b={...a,id:'b'};
  const z={...human,id:'z',faction:'zombie',position:{x:300,y:400},targetId:null};
  f.unitView.render([a,b,z],null,0);
  assert.equal(f.unitView.g.calls.filter((c:any)=>c.kind==='moveTo').length,4,'one crosshair, four short arms');
  z.hp=0;f.unitView.render([a,b,z],null,0);
  assert.equal(f.unitView.g.calls.filter((c:any)=>c.kind==='moveTo').length,0);
  z.hp=10;a.targetId=null;b.targetId=null;f.unitView.render([a,b,z],null,0);
  assert.equal(f.unitView.g.calls.filter((c:any)=>c.kind==='moveTo').length,0);
});
