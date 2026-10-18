import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectileTracks} from '../../assets/scripts/adapter/contracts.js';
import {fixture} from '../../test-support/cocos-fixture.js';

const spawn=(id='p',time=1,projectileKind:'bullet'|'flame'='bullet')=>({type:'projectile_spawned',time_s:time,
  data:{id,origin:{x:100,y:200},destination:{x:280,y:200},projectileKind,speed_px_per_s:projectileKind==='flame'?520:900}});
const impact=(type='projectile_hit',x=280)=>({type,time_s:1.1,
  data:{projectileId:'p',position:{x,y:200}}});
const expired={type:'projectile_expired',time_s:1.1,data:{projectileId:'p'}};

test('completed trails survive a same-batch spawn/hit, retire once and expire with muzzle flashes',()=>{
  const t=new ProjectileTracks();
  t.consume([spawn(),impact(),expired,impact()]);
  assert.deepEqual(t.positions(1.11,900),[]);
  assert.deepEqual(t.counts,{active:0,hits:1});
  assert.deepEqual(t.trails,[{origin:{x:100,y:200},position:{x:280,y:200},time:1.1}]);
  assert.equal(t.muzzles.length,0);
  t.positions(1.23,900);
  assert.equal(t.trails.length,0);
  assert.equal(t.hits.length,0);
  t.consume([spawn('next',2)]);t.positions(2.02,900);
  assert.equal(t.muzzles.length,1);
  t.clear();
  assert.deepEqual(t.counts,{active:0,hits:0});
  assert.equal(t.trails.length,0);assert.equal(t.muzzles.length,0);
});

test('flying bullets draw a traveled line, bright 44px tail, head and muzzle flash',()=>{
  const {controller}=fixture(true),pool=controller.projectiles;
  pool.render([spawn()],1.05);
  const calls=pool.g.calls;
  const moves=calls.filter((c:any)=>c.kind==='moveTo');
  const ends=calls.filter((c:any)=>c.kind==='lineTo');
  assert.equal(moves.length,2);assert.equal(ends.length,2);
  assert.deepEqual([...moves[0].args],[100,-200]);
  assert.ok(Math.abs(ends[0].args[0]-145)<1e-8);
  assert.ok(Math.abs(moves[1].args[0]-101)<1e-8);
  assert.ok(ends.every((c:any)=>c.args[0]<=145+1e-8),'no line drawn ahead of the bullet');
  assert.ok(calls.some((c:any)=>c.kind==='stroke'&&c.width===4));
  assert.ok(calls.some((c:any)=>c.kind==='circle'&&c.fill.hex==='#FFD477'));
  assert.ok(calls.some((c:any)=>c.kind==='circle'&&c.fill.hex==='#FFFFFF'));
  controller.onDestroy();
});

test('flame tracks preserve their kind and render a red and orange fire trail',()=>{
  const tracks=new ProjectileTracks();tracks.consume([spawn('fire',1,'flame')]);
  assert.equal(tracks.positions(1.05,900)[0].kind,'flame');
  const {controller}=fixture(true),pool=controller.projectiles;
  pool.render([spawn('fire',1,'flame')],1.05);
  const calls=pool.g.calls;
  assert.ok(calls.some((call:any)=>call.kind==='stroke'&&call.color.hex==='#F04438'));
  assert.ok(calls.some((call:any)=>call.kind==='stroke'&&call.color.hex==='#FFB340'));
  assert.ok(calls.some((call:any)=>call.kind==='circle'&&call.fill.hex==='#F04438'));
  controller.onDestroy();
});

for(const [type,x] of [['projectile_hit',280],['projectile_blocked',190]] as const){
  test(`${type} renders a brief completed trajectory ending at the actual contact point`,()=>{
    const {controller}=fixture(true),pool=controller.projectiles;
    pool.render([spawn(),impact(type,x),expired],1.11);
    const calls=pool.g.calls;
    const lineEnds=calls.filter((c:any)=>c.kind==='lineTo');
    assert.equal(lineEnds.length,1);
    assert.deepEqual([...lineEnds[0].args],[x,-200]);
    assert.deepEqual([...calls.find((c:any)=>c.kind==='moveTo').args],[100,-200]);
    assert.ok(calls.some((c:any)=>c.kind==='circle'&&c.fill.hex===(type==='projectile_blocked'?'#FFC46B':'#FFFFFF')));
    pool.render([],1.23);assert.equal(pool.g.calls.length,0);
    pool.render([spawn('restart',2)],2.02);assert.ok(pool.g.calls.length>0);
    pool.clear();pool.render([],2.03);assert.equal(pool.g.calls.length,0);
    controller.onDestroy();
  });
}
