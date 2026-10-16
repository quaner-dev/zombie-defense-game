import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VibrationAdapter, optionalWeChatVibration } from '../../assets/scripts/adapter/VibrationAdapter.js';
const breach=(unitId:string)=>({type:'route_breached',time_s:1,data:{unitId,routeId:'A'}});

test('supported wx boundary vibrates once for a breach batch',()=>{
  let count=0;const platform={vibrateShort(){assert.equal(this,platform);count++;}};
  const v=new VibrationAdapter(platform,()=>1000);
  v.consume([breach('z1'),breach('z2')],true,false);assert.equal(count,1);
});

test('unsupported platform is a safe no-op',()=>{
  assert.equal(optionalWeChatVibration(),undefined);
  for(const platform of [undefined,{}, {vibrateShort:1} as any]){
    const v=new VibrationAdapter(platform,()=>1000);
    assert.doesNotThrow(()=>v.consume([breach('z1')],true,false));
  }
});

test('sync throw and async rejection do not escape the adapter or bypass cooldown',async()=>{
  for(const reject of [false,true]){
    let calls=0;const v=new VibrationAdapter({vibrateShort:()=>{calls++;if(reject)return Promise.reject(new Error('async'));throw Error('sync');}},()=>1000);
    assert.doesNotThrow(()=>v.consume([breach('z1')],true,false));
    v.consume([breach('z2')],true,false);assert.equal(calls,1);
    await new Promise(resolve=>setImmediate(resolve));
  }
});

test('unrelated events ignored; consecutive batches use >=1000ms wall clock, not event time',()=>{
  let now=2000;let count=0;const v=new VibrationAdapter({vibrateShort:()=>{count++;}},()=>now);
  v.consume([{type:'wave_spawn'}],true,false);assert.equal(count,0);
  v.consume([breach('z1')],true,false);v.consume([breach('z2')],true,false);
  now=2999;v.consume([breach('z3')],true,false);assert.equal(count,1);
  now=3000;v.consume([breach('z4')],true,false);assert.equal(count,2);
});

test('inactive and terminal batches are dropped rather than queued',()=>{
  let count=0;const v=new VibrationAdapter({vibrateShort:()=>{count++;}},()=>1000);
  v.consume([breach('paused')],false,false);v.consume([breach('terminal')],true,true);
  v.consume([],true,false);assert.equal(count,0);
  v.consume([breach('fresh')],true,false);assert.equal(count,1);
});
