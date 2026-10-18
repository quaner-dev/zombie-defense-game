import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { mapToScreen } from '../../assets/scripts/adapter/contracts.js';

const entry = () => fixture(true, undefined, {console:undefined}, undefined, true);
function click(f:ReturnType<typeof fixture>,index:number){f.button(index,'start');f.controller.update(.016);f.button(index,'end');}

test('production entry opens mode selection and waits for a story button release', () => {
  const f=entry(),c=f.controller,s=c.session;
  assert.equal(s.screen,'menu');assert.equal(c.field.active,false);
  assert.match(c.hud.menuTitle.string,/选择出发方式/);
  for(let i=0;i<100;i++)c.update(.05);
  assert.equal(s.deploymentRemaining,3);assert.equal(s.snapshot.waveIndex,0);
  f.touch('start',1,400,600);f.touch('end',1,500,600);
  assert.equal(f.controls.drag.preview,null);assert.equal(s.screen,'menu');
  f.button(0,'start');c.update(.05);assert.equal(s.screen,'menu');
  f.button(0,'end');assert.equal(s.screen,'battle');assert.equal(s.mode,'story');
  assert.equal(s.activeScene.id,'cabin');assert.equal(s.deploymentRemaining,3);
  assert.equal(c.field.active,true);assert.match(c.hud.status.string,/故事.*大屋守卫/);
  c.update(.05);assert.ok(s.deploymentRemaining<3);c.onDestroy();
});

test('scene selection draws matching geometry and resets transient effects on replay and return', () => {
  const f=entry(),c=f.controller,s=c.session;click(f,1);
  assert.equal(s.screen,'scenes');assert.equal(s.deploymentRemaining,3);
  click(f,1);assert.equal(s.activeScene.id,'courtyard');assert.equal(s.mode,'practice');
  const rectangles=c.map.base.calls.filter((call:any)=>call.kind==='rect');
  for(const b of [[160,-1080,240,620],[680,-1080,240,620],[160,-1960,240,480],[680,-1960,240,480]]) {
    assert.ok(rectangles.some((call:any)=>call.args.join(',')===b.join(',')),`building ${b} is rendered`);
  }
  assert.ok(!rectangles.some((call:any)=>call.args.join(',')==='416,-950,24,270'),'cabin wall removed');
  const unit=s.battle.getUnits().find((unit:any)=>unit.faction==='human');
  const p=mapToScreen(unit.position,c.frame);f.touch('start',1,p.x,p.y);
  assert.ok(f.controls.drag.preview,'touch on second scene selects its soldiers');
  f.touch('end',1,p.x+80,p.y);c.update(.05);
  assert.ok(s.battle.getEvents().some((event:any)=>event.type==='group_command'));
  s.tick(3);c.draw();click(f,1);
  assert.equal(s.activeScene.id,'courtyard');assert.equal(s.snapshot.waveIndex,0);assert.equal(s.deploymentRemaining,3);
  assert.equal(c.projectiles.counts.active,0);assert.equal(c.units.retainedDeaths,0);
  assert.equal(c.controls.selectedUnitIds.length,0);assert.equal(c.controls.drag.preview,null);
  assert.equal(c.hud.waveBanner.node.active,false);assert.equal(s.events.length,0);
  click(f,2);assert.equal(s.screen,'menu');assert.equal(c.field.active,false);
  click(f,1);click(f,0);assert.equal(s.activeScene.id,'cabin');
  assert.ok(c.map.base.calls.some((call:any)=>call.kind==='rect'&&call.args.join(',')==='100,-2064,24,1384'));
  assert.ok(!c.map.base.calls.some((call:any)=>call.kind==='rect'&&call.args[2]===240&&call.args[3]===620));
  c.onDestroy();
});

test('victory button advances story using the same controller and shows final completion', () => {
  const f=entry(),c=f.controller,s=c.session;click(f,0);
  assert.equal(c.hud.boxes.length,3,'next chapter is unavailable before victory');
  const snapshot=s.battle.getSnapshot.bind(s.battle);
  s.battle.getSnapshot=()=>({...snapshot(),result:'win'});c.draw();
  assert.equal(c.hud.boxes.length,4);assert.match(c.hud.next.string,/大楼楼下/);
  const nodes=c.root.children.length;
  // Complete the same touch while the next battle restores the real snapshot.
  f.button(3,'start');c.update(.016);
  const b=c.hud.boxes[3];
  f.touch('end',1,b.x+b.width/2,b.y+b.height/2);
  s.battle.getSnapshot=snapshot;c.draw();
  assert.equal(s.activeScene.id,'courtyard');assert.equal(s.deploymentRemaining,3);
  assert.equal(c.root.children.length,nodes);assert.equal(c.projectiles.counts.active,0);
  s.battle.getSnapshot=()=>({...snapshot(),result:'win'});c.draw();
  assert.match(c.hud.result.string,/故事通关/);assert.equal(c.hud.boxes.length,3);
  s.battle.getSnapshot=snapshot;c.onDestroy();
});

test('input reads selection radius and target bounds from the active map', () => {
  const f=entry(),c=f.controller,s=c.session;click(f,1);click(f,1);
  const map=s.map,unit=s.battle.getUnits().find((unit:any)=>unit.faction==='human');
  map.unit_selection_radius=1;
  const press=mapToScreen({x:unit.position.x+5,y:unit.position.y},c.frame);
  f.touch('start',1,press.x,press.y);
  assert.equal(c.controls.drag.preview.unitIds.length,0,'active map radius excludes a soldier five pixels away');
  f.touch('cancel',1,press.x,press.y);
  map.unit_selection_radius=20;
  map.battle_bounds.left=400;map.battle_bounds.right=680;
  const start=mapToScreen(unit.position,c.frame),end=mapToScreen({x:950,y:1280},c.frame);
  f.touch('start',1,start.x,start.y);assert.ok(c.controls.drag.preview.unitIds.includes(unit.id));
  f.touch('move',1,end.x,end.y);
  assert.equal(c.controls.drag.preview.target.x,680,'preview clamps against the active bounds');
  assert.equal(c.controls.selectionPreview.radius,20);
  f.touch('end',1,end.x,end.y);
  const command=s.battle.getEvents().find((event:any)=>event.type==='group_command');
  assert.equal(command.data.target.x,680);c.onDestroy();
});

for(const safe of [{x:40,y:80,width:1000,height:2200},{x:0,y:0,width:2400,height:1080}]) {
  test(`menu and scene buttons stay within safe area ${safe.width}x${safe.height}`,()=>{
    const f=fixture(true,undefined,{console:undefined},{origin:{x:0,y:0},size:{width:safe.width,height:safe.height},safe},true);
    for(const screen of ['menu','scenes']) {
      if(screen==='scenes')click(f,1);
      for(const b of f.hud.boxes){
        assert.ok(b.x>=safe.x&&b.y>=safe.y);
        assert.ok(b.x+b.width<=safe.x+safe.width&&b.y+b.height<=safe.y+safe.height);
      }
    }
    f.controller.onDestroy();
  });
}
