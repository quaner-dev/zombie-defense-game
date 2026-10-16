import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { mapToScreen } from '../../assets/scripts/adapter/contracts.js';

test('actual InputManager preserves moving identities throughout a one-second drag',()=>{
 const f=fixture(true),c=f.controller,s=c.session;
 const humans=s.battle.getUnits().filter((u:any)=>u.faction==='human'&&u.routeId==='A');
 const center=(us:any[])=>({x:us.reduce((n,u)=>n+u.position.x,0)/us.length,y:us.reduce((n,u)=>n+u.position.y,0)/us.length});
 const first=center(humans);assert.equal(s.move(first.x,first.y,180,2100),true);
 for(let i=0;i<8;i++){c.update(.05);f.advanceTime(50);}
 const group=s.battle.getUnits().filter((u:any)=>humans.some((h:any)=>h.id===u.id));
 const press=mapToScreen(center(group),c.frame);
 f.touch('start',1,press.x,press.y);assert.ok(f.controls.drag.preview);
 // A secondary press must not replace captured IDs.
 f.touch('start',2,800,1000);
 for(let i=0;i<20;i++){c.update(.05);f.advanceTime(50);}
 const moved=s.battle.getUnits().filter((u:any)=>humans.some((h:any)=>h.id===u.id));
 assert.ok(center(moved).y-center(group).y>100);
 const rings=c.units.g.calls.filter((call:any)=>call.kind==='circle'&&call.args[2]===11);
 assert.equal(rings.length,humans.length,'selection rings follow original living identities');
 const release=mapToScreen({x:800,y:1800},c.frame);f.touch('end',1,release.x,release.y);
 const commands=s.battle.getEvents().filter((e:any)=>e.type==='group_command');
 assert.equal(commands.length,2);assert.deepEqual([...commands[1].data.unitIds].sort(),Array.from(humans,(u:any)=>u.id).sort());
 assert.deepEqual({...commands[1].data.target},{x:800,y:1800});
});
