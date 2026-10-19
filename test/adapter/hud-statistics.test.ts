import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../test-support/cocos-fixture.js';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const types=['rifleman','flamethrower','sniper','shield','engineer'];
const colors=['#63D68F','#F04438','#55C5F4','#B9D7E8','#F59E0B'];

function enterScene(index=0,viewport?:Parameters<typeof fixture>[3],globals?:Record<string,unknown>){
  const f=fixture(true,undefined,{console:undefined,globals},viewport,true),c=f.controller;
  f.button(1,'start');f.button(1,'end');
  f.button(index,'start');f.button(index,'end');
  if(c.session.screen==='roster')f.confirm();
  assert.equal(c.session.screen,'battle');return f;
}

function controlledCounts(c:any){
  const base=c.session.snapshot;
  let human=13,zombie=26,result='running';
  c.session.battle.getSnapshot=()=>({...base,aliveHumans:human,aliveZombies:zombie,result,
    stats:{byUnitType:Object.fromEntries(types.map(type=>[type,{...base.stats.byUnitType[type],aliveAtEnd:type==='rifleman'?human:0}]))}});
  c.hud.reset();c.draw();
  return (h:number,z:number,dt=0,end='running')=>{human=h;zombie=z;result=end;c.hud.render(dt);};
}

function track(hud:any){return hud.g.calls.find((v:any)=>v.kind==='roundRect'&&v.color.hex==='#9F8BE8');}
function division(hud:any){return hud.g.calls.find((v:any)=>v.kind==='roundRect'&&v.color.hex==='#F2F2F7');}
function checkRenderedRatio(hud:any,ratio:number){
  near(hud.diagnosticState().balance.ratio,ratio);
  const bar=track(hud),line=division(hud);
  assert.ok(bar);
  if(ratio>0&&ratio<1){
    assert.ok(line);near(line.args[0]+line.args[2]/2,bar.args[0]+bar.args[2]*ratio);
  }else assert.equal(line,undefined);
  if(ratio>0){
    const calls=hud.g.calls,start=calls.indexOf(bar),end=line?calls.indexOf(line)-1:calls.length;
    const greenPoints=calls.slice(start+1,end).filter((v:any)=>v.kind==='lineTo');
    near(Math.max(...greenPoints.map((v:any)=>v.args[0])),bar.args[0]+bar.args[2]*ratio);
  }
}

test('all scenes publish their fresh roster before the first frame and render matching colored counts',()=>{
  for(let scene=0;scene<3;scene++){
    const f=enterScene(scene),c=f.controller,s=c.session.snapshot;
    try{
      assert.equal(c.hud.sceneTitle.string,c.session.activeScene.title);
      assert.equal(c.hud.humanTotal.string,`士兵  ${s.aliveHumans}`);
      assert.equal(types.reduce((sum,type)=>sum+s.stats.byUnitType[type].aliveAtEnd,0),s.aliveHumans);
      for(let i=0;i<types.length;i++){
        const type=types[i],label=c.hud.unitCountLabels[type],stat=s.stats.byUnitType[type];
        assert.equal(label.node.active,stat.spawned>0);
        assert.equal(label.color.hex,colors[i]);
        if(stat.spawned>0)assert.ok(label.string.endsWith(` ${stat.aliveAtEnd}`));
      }
      if(scene>0)assert.match(c.hud.sceneMeta.string,/持续防守/);
      else assert.match(c.hud.sceneMeta.string,/波/);
      assert.equal(c.hud.status.node.active,scene===2);
    }finally{c.onDestroy();}
  }
});

test('losses retain the zero-count type and its row position; replay immediately resets the roster',()=>{
  const f=enterScene(),c=f.controller,s=c.session;
  try{
    const positions=types.map(type=>({...c.hud.unitCountLabels[type].node.position}));
    const units=s.battle.getUnits().filter((unit:any)=>unit.unitType==='sniper');
    assert.ok(units.length);
    for(const unit of units)s.battle.units.kill(unit.id);
    s.tick(3.05);c.draw();
    assert.equal(c.hud.unitCountLabels.sniper.string,'狙击兵 0');
    assert.equal(c.hud.unitCountLabels.sniper.node.active,true);
    types.forEach((type,index)=>assert.deepEqual(c.hud.unitCountLabels[type].node.position,positions[index]));
    const snapshot=s.snapshot;
    assert.equal(types.reduce((sum,type)=>sum+snapshot.stats.byUnitType[type].aliveAtEnd,0),snapshot.aliveHumans);
    c.restart();
    if(s.screen==='roster')f.confirm();
    const fresh=s.snapshot;
    assert.ok(fresh.stats.byUnitType.sniper.aliveAtEnd>0);
    assert.equal(c.hud.unitCountLabels.sniper.string,`狙击兵 ${fresh.stats.byUnitType.sniper.aliveAtEnd}`);
    assert.equal(c.hud.diagnosticState().balance.ratio,1);
  }finally{c.onDestroy();}
});

test('chosen formations show the actual counts and hide types omitted from the next battle',()=>{
  const f=enterScene(),c=f.controller,s=c.session;
  try{
    c.restart();s.roster={rifleman:7,flamethrower:3,sniper:1,shield:2,engineer:2};f.confirm();
    assert.equal(c.hud.humanTotal.string,'士兵  15');
    for(const type of types){
      assert.equal(c.hud.unitCountLabels[type].node.active,true);
      assert.ok(c.hud.unitCountLabels[type].string.endsWith(` ${s.roster[type]}`));
    }
    c.restart();s.roster={rifleman:15,flamethrower:0,sniper:0,shield:0,engineer:0};f.confirm();
    assert.equal(c.hud.unitCountLabels.rifleman.string,'枪兵 15');
    assert.equal(c.hud.unitCountLabels.rifleman.node.active,true);
    for(const type of types.slice(1))assert.equal(c.hud.unitCountLabels[type].node.active,false);
    checkRenderedRatio(c.hud,1);
  }finally{c.onDestroy();}
});

test('green fill and division share the exact ratio, including minority and zero states',()=>{
  const f=enterScene(),c=f.controller,set=controlledCounts(c);
  try{
    for(const [h,z] of [[13,26],[13,13],[13,3],[4,26],[1,999],[13,0],[0,26]]){
      c.hud.reset();set(h,z);
      assert.equal(c.hud.humanTotal.string,`士兵  ${h}`);
      assert.equal(c.hud.zombieTotal.string,`僵尸  ${z}`);
      checkRenderedRatio(c.hud,h/(h+z));
    }
    set(0,0);
    assert.equal(c.hud.countHint.string,'暂无存活单位');
    assert.equal(track(c.hud),undefined);assert.equal(division(c.hud),undefined);
    assert.ok(c.hud.g.calls.some((v:any)=>v.kind==='roundRect'&&v.color.hex==='#272E3B'));
  }finally{c.onDestroy();}
});

test('ratio transitions retarget from their current position, freeze paused, and settle at the final result',()=>{
  const f=enterScene(),c=f.controller,set=controlledCounts(c);
  try{
    checkRenderedRatio(c.hud,1/3);
    set(13,3);
    assert.equal(c.hud.zombieTotal.string,'僵尸  3','numbers update without animation');
    checkRenderedRatio(c.hud,1/3);
    c.hud.render(.11);
    const middle=c.hud.diagnosticState().balance.ratio;
    assert.ok(middle>1/3&&middle<13/16);checkRenderedRatio(c.hud,middle);
    c.session.paused=true;c.hud.render(1);checkRenderedRatio(c.hud,middle);
    c.session.paused=false;set(4,26);checkRenderedRatio(c.hud,middle);
    c.hud.render(.22);checkRenderedRatio(c.hud,4/30);
    set(4,0,0,'win');checkRenderedRatio(c.hud,1);
  }finally{c.onDestroy();}
});

test('system reduced-motion preference applies live proportions without tweening',()=>{
  const f=enterScene(0,undefined,{matchMedia:()=>({matches:true})}),c=f.controller,set=controlledCounts(c);
  try{set(13,3);checkRenderedRatio(c.hud,13/16);}finally{c.onDestroy();}
});

for(const safe of [{x:0,y:0,width:1080,height:2400},{x:40,y:80,width:1000,height:2200},
  {x:0,y:0,width:2400,height:1080},{x:0,y:0,width:320,height:692}]){
  test(`field, task header, stats and controls stay separate in safe area ${safe.width}x${safe.height}`,()=>{
    for(const scene of [0,2]){
      const f=enterScene(scene,{origin:{x:0,y:0},size:{width:safe.width,height:safe.height},safe}),c=f.controller;
      try{
        const {battlefield:field,statistics:stats,header}=c.hud.diagnosticState(),frame=c.frame;
        assert.ok(stats.y+stats.height<field.y);
        assert.ok(field.y+field.height<=header.y+1e-7,'header stays above the full field');
        assert.ok(frame.x>=field.x&&frame.y>=field.y);
        assert.ok(frame.x+frame.width*frame.scale<=field.x+field.width+1e-7);
        assert.ok(frame.y+frame.height*frame.scale<=field.y+field.height+1e-7);
        for(const box of c.hud.boxes){
          assert.ok(box.x>=safe.x&&box.y>=safe.y);
          assert.ok(box.x+box.width<=safe.x+safe.width&&box.y+box.height<=stats.y);
        }
        for(const region of [stats,header])assert.equal(c.hud.excludes({x:region.x+region.width/2,y:region.y+region.height/2}),true);
        assert.equal(c.hud.excludes({x:field.x+field.width/2,y:field.y+field.height/2}),false);
        for(const label of [c.hud.sceneTitle,c.hud.sceneMeta,...(scene===2?[c.hud.status]:[])]){
          const bounds=label.node.components[0],scale=label.node.scale;
          assert.ok(label.node.position.y-bounds.height*scale.y/2>=header.y);
          assert.ok(label.node.position.y+bounds.height*scale.y/2<=safe.y+safe.height);
        }
        const row=types.map(type=>c.hud.unitCountLabels[type]).filter(label=>label.node.active);
        assert.ok(row.length>=3);
        for(const label of row){
          assert.ok(label.node.position.y<field.y&&label.node.position.y>stats.y);
          const bounds=label.node.components[0],half=bounds.width*label.node.scale.x/2;
          assert.ok(label.node.position.x-half>=stats.x);
          assert.ok(label.node.position.x+half<=stats.x+stats.width+1e-7);
        }
      }finally{c.onDestroy();}
    }
  });
}
