import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleSession } from '../../src/adapter/BattleSession.js';

function replay(cadence:number[], tactical:boolean) {
  const s=new BattleSession();s.restart();
  function elapsed(seconds:number){
    let remaining=seconds,i=0;
    while(remaining>1e-10&&s.snapshot.result==='running'){
      const dt=Math.min(remaining,cadence[i++%cadence.length]);s.tick(dt);remaining-=dt;
    }
  }
  elapsed(3);
  assert.equal(s.snapshot.time_s,0);
  if(tactical)for(const stage of [{time:0,y:1400}]){
    elapsed(stage.time-s.snapshot.time_s);
    for(const [i,route] of ['A','B','C'].entries()){
      const group=s.battle.getUnits().filter(u=>u.faction==='human'&&u.hp>0&&u.routeId===route);
      assert.equal(s.move(group.reduce((n,u)=>n+u.position.x,0)/group.length,group.reduce((n,u)=>n+u.position.y,0)/group.length,[450,540,630][i],stage.y),true);
    }
  }
  elapsed(120-s.snapshot.time_s);
  const result={snapshot:s.snapshot,units:s.battle.getUnits(),events:s.battle.getEvents()};
  s.tick(100);assert.deepEqual(s.snapshot,result.snapshot);assert.deepEqual(s.battle.getEvents(),result.events);
  assert.deepEqual(result.events.filter(e=>e.type==='wave_spawn').map(e=>e.time_s),[0,7,20]);
  if(tactical){
    const commands=result.events.filter(e=>e.type==='group_command');
    assert.deepEqual(commands.map(e=>e.time_s),[0,0,0]);
    assert.ok(commands.every(e=>(e.data as {unitIds:string[]}).unitIds.length===1));
  }
  return result;
}
for(const tactical of [false,true])test(`exact authoritative replay across single, 50ms, 60fps and jitter (${tactical?'micro-control':'idle'})`,()=>{
  const expected=replay([120],tactical);
  for(const cadence of [[.05],[1/60],[.007,.083,.019,.041]])assert.deepEqual(replay(cadence,tactical),expected);
  assert.equal(expected.snapshot.result,'win');
  if(tactical)assert.ok(expected.snapshot.aliveHumans>0);
});

test('partial elapsed time waits for an authoritative step and commands enter at the current completed tick',()=>{
 const s=new BattleSession();s.restart();s.tick(3);s.tick(.019);
 assert.equal(s.snapshot.time_s,0);s.move(180,1370,180,1600);
 assert.equal(s.battle.getEvents().find(e=>e.type==='group_command')?.time_s,0);
 s.tick(.031);assert.equal(s.snapshot.time_s,.05);
});
