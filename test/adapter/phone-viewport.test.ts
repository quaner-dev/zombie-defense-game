import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';
import { mapToScreen } from '../../assets/scripts/adapter/contracts.js';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('393x852: drawn field, camera frustum and HUD agree with actual touch commands',()=>{
  const f=fixture(true),c=f.controller;
  const cameraNode=c.root.getChildByName('UICamera'),camera=cameraNode.components[0];
  // Cocos orthoHeight is HALF the vertical frustum, not its full height.
  near(camera.orthoHeight,1200);
  const canvas=c.root.components.find((v:any)=>'cameraComponent' in v);
  assert.equal(canvas.cameraComponent,camera);assert.equal(canvas.alignCanvasWithScreen,true);
  const pixelsPerDesignUnit=Math.min(393/1080,852/2400);
  const marginX=(393-1080*pixelsPerDesignUnit)/2,marginY=(852-2400*pixelsPerDesignUnit)/2;
  const toUI=(x:number,y:number)=>{
    // Project world through Cocos's orthographic frustum into the real phone,
    // then apply getUILocation's SHOW_ALL viewport/scale conversion.
    const px=393/2+(x-cameraNode.position.x)*852/(2*camera.orthoHeight);
    const py=852/2+(y-cameraNode.position.y)*852/(2*camera.orthoHeight);
    return {x:(px-marginX)/pixelsPerDesignUnit,y:(py-marginY)/pixelsPerDesignUnit};
  };
  const drawn=(p:{x:number;y:number})=>toUI(c.root.position.x+c.field.position.x+p.x*c.field.scale.x,
    c.root.position.y+c.field.position.y-p.y*c.field.scale.y);
  for(const p of [{x:0,y:0},{x:1080,y:2400},{x:540,y:1200}]){
    const actual=drawn(p),expected=mapToScreen(p,c.frame);near(actual.x,expected.x);near(actual.y,expected.y);
    assert.ok(actual.x>=0&&actual.x<=1080&&actual.y>=0&&actual.y<=2400);
  }
  const human=c.session.battle.getUnits().find((u:any)=>u.faction==='human');
  const start=drawn(human.position),target={x:human.position.x+100,y:human.position.y-100},end=drawn(target);
  let accepted:any;const moveGroup=c.session.moveGroup.bind(c.session);
  c.session.moveGroup=(ids:string[],x:number,y:number)=>{accepted={ids,x,y};return moveGroup(ids,x,y);};
  f.touch('start',1,start.x,start.y);assert.ok(f.controls.drag.preview,'touch on rendered group selects it');
  f.touch('move',1,end.x,end.y);near(f.controls.drag.preview.target.x,target.x);near(f.controls.drag.preview.target.y,target.y);
  const ids=[...f.controls.drag.preview.unitIds];f.touch('end',1,end.x,end.y);
  const moved=c.session.battle.getUnits().filter((u:any)=>ids.includes(u.id));
  near(accepted.x,target.x);near(accepted.y,target.y);
  assert.ok(moved.every((u:any)=>u.state==='Moving'));
  const hud=c.root.getChildByName('HUD'),b=f.hud.boxes[0];
  const renderedButton=toUI(c.root.position.x+hud.position.x+b.x+130,c.root.position.y+hud.position.y+b.y+50);
  near(renderedButton.x,b.x+130);near(renderedButton.y,b.y+50);
  f.touch('start',2,renderedButton.x,renderedButton.y);c.update(.016);f.touch('end',2,renderedButton.x,renderedButton.y);
  assert.equal(c.session.paused,true);
  // The display radius is doubled while screen-to-map input coordinates remain unchanged.
  near(c.units.g.calls.find((call:any)=>call.kind==='circle').args[2],21);
  near(14*c.field.scale.x*pixelsPerDesignUnit,14*(2030/2400)*(852/2400));
});

for(const safe of [{x:40,y:80,width:1000,height:2200},{x:0,y:0,width:0,height:0}])
  test(`actual controller layout preserves mapping with safe rect ${JSON.stringify(safe)}`,()=>{
    const f=fixture(true,undefined,{console:undefined},{origin:{x:0,y:0},size:{width:1080,height:2400},safe}),c=f.controller;
    for(const p of [{x:0,y:0},{x:1080,y:2400}]){
      const expected=mapToScreen(p,c.frame);
      near(c.field.position.x+p.x*c.field.scale.x+540,expected.x);
      near(c.field.position.y-p.y*c.field.scale.y+1200,expected.y);
    }
    const p=c.session.battle.getUnits().find((u:any)=>u.faction==='human').position,start=mapToScreen(p,c.frame);
    f.touch('start',1,start.x,start.y);assert.ok(f.controls.drag.preview);
    c.layout();assert.equal(f.controls.drag.preview,null,'resize cancels old-frame gesture');
  });
