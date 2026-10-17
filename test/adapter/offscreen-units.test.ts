import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';

test('controller draw hides off-map spawns even when HUD reserve is physically visible',()=>{
  const f=fixture(true),c=f.controller;
  const sample=c.session.battle.getUnits()[0];
  const zombie={...sample,id:'offscreen',faction:'zombie',position:{x:300,y:-1},state:'Idle',targetId:null};
  const human={...sample,id:'watcher',position:{x:500,y:500},state:'Attacking',targetId:zombie.id};
  c.session.battle.getUnits=()=>[human,zombie];
  c.draw();
  const calls=c.units.g.calls;
  assert.equal(calls.filter((v:any)=>v.kind==='circle').length,2,'only visible human body/halo');
  assert.equal(calls.filter((v:any)=>v.kind==='moveTo').length,0,'no offscreen target crosshair');
  assert.ok(c.frame.y+(2400-zombie.position.y)*c.frame.scale<2400,'spawn would otherwise appear in phone top HUD reserve');
  zombie.position.y=0;c.draw();
  assert.equal(c.units.g.calls.filter((v:any)=>v.kind==='circle').length,4,'body appears when center enters map');
  assert.equal(c.units.g.calls.filter((v:any)=>v.kind==='moveTo').length,4);
  for(const position of [{x:-1,y:100},{x:1081,y:100},{x:100,y:2401}]){
    zombie.position=position;c.draw();assert.equal(c.units.g.calls.filter((v:any)=>v.kind==='circle').length,2);
  }
});
