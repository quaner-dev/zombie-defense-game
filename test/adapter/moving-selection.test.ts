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
 assert.ok(center(moved).y-center(group).y>35);
 const rings=c.units.g.calls.filter((call:any)=>call.kind==='circle'&&call.args[2]===11);
 assert.equal(rings.length,humans.length,'selection rings follow original living identities');
 const release=mapToScreen({x:800,y:1800},c.frame);f.touch('end',1,release.x,release.y);
 const commands=s.battle.getEvents().filter((e:any)=>e.type==='group_command');
 assert.equal(commands.length,2);assert.deepEqual([...commands[1].data.unitIds].sort(),Array.from(humans,(u:any)=>u.id).sort());
 assert.deepEqual({...commands[1].data.target},{x:800,y:1800});
});

test('every press selects only the fixed circle, even when touching a previously selected soldier',()=>{
 const f=fixture(true),c=f.controller,s=c.session;
 s.battle.units.clear();
 const a=s.battle.units.spawn('rifleman',{x:300,y:1400},'A');
 const boundary=s.battle.units.spawn('rifleman',{x:412,y:1400},'A');
 const outside=s.battle.units.spawn('rifleman',{x:413,y:1400},'A');
 const old=s.battle.units.spawn('rifleman',{x:800,y:1400},'A');
 f.controls.selectedUnitIds=[a.id,boundary.id,outside.id,old.id];
 const press=mapToScreen(a.position,c.frame),release=mapToScreen({x:700,y:1800},c.frame);
 f.touch('start',1,press.x,press.y);
 assert.deepEqual(Array.from(f.controls.drag.preview!.unitIds),[a.id,boundary.id]);
 assert.equal(f.controls.selectionPreview.radius,112);
 c.draw();
 assert.ok(c.preview.calls.some((call:any)=>call.kind==='circle'&&call.args[2]===112),'visible fixed selection radius');
 assert.ok(c.preview.calls.some((call:any)=>call.kind==='circle'&&call.args[2]===260),'individual soldier attack radius');
 f.touch('move',1,release.x,release.y);
 assert.equal(f.controls.selectionPreview.radius,112,'dragging does not enlarge selection');
 f.touch('end',1,release.x,release.y);
 const command=s.battle.getEvents().filter((event:any)=>event.type==='group_command').at(-1);
 assert.deepEqual(Array.from(command.data.unitIds),[a.id,boundary.id]);
 assert.equal(outside.state,'Idle');assert.equal(old.state,'Idle');
 assert.equal(f.controls.selectionPreview,null);
 // A second press on one member re-samples positions instead of restoring both.
 boundary.position.x=600;f.advanceTime(301);
 f.touch('start',1,press.x,press.y);
 assert.deepEqual(Array.from(f.controls.drag.preview!.unitIds),[a.id]);
 f.touch('cancel',1,press.x,press.y);assert.equal(f.controls.selectionPreview,null);
});

test('an empty-area drag cannot collect soldiers along its rectangle or path',()=>{
 const f=fixture(true),c=f.controller,s=c.session;
 const press=mapToScreen({x:70,y:1550},c.frame),release=mapToScreen({x:950,y:1200},c.frame);
 f.touch('start',1,press.x,press.y);
 assert.deepEqual(Array.from(f.controls.selectedUnitIds),[]);
 f.touch('move',1,release.x,release.y);f.touch('end',1,release.x,release.y);
 assert.deepEqual(Array.from(f.controls.selectedUnitIds),[]);
 assert.equal(s.battle.getEvents().filter((event:any)=>event.type==='group_command').length,0);
 assert.equal(f.controls.selectionPreview,null);
});

test('secondary touch releases and cancels cannot clear the primary fixed circle',()=>{
 const f=fixture(true),c=f.controller;
 const press=mapToScreen({x:540,y:1370},c.frame);
 f.touch('start',1,press.x,press.y);
 const preview=f.controls.selectionPreview;
 f.touch('end',2,press.x,press.y);assert.equal(f.controls.selectionPreview,preview);
 f.touch('cancel',2,press.x,press.y);assert.equal(f.controls.selectionPreview,preview);
 f.touch('cancel',1,press.x,press.y);assert.equal(f.controls.selectionPreview,null);
});

test('a press in the field margin measures the circle from the actual finger',()=>{
 const f=fixture(true),c=f.controller,s=c.session;
 s.battle.units.clear();s.battle.units.spawn('rifleman',{x:130,y:1400},'A');
 const press=mapToScreen({x:0,y:1400},c.frame);
 f.touch('start',1,press.x,press.y);
 assert.deepEqual(Array.from(f.controls.selectedUnitIds),[],'do not shift the circle to the x=60 battlefield edge');
 assert.ok(Math.abs(f.controls.selectionPreview.center.x)<1e-9);
 f.touch('cancel',1,press.x,press.y);
});
