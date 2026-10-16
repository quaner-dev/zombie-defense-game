import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FpsMonitor } from '../../assets/scripts/adapter/FpsMonitor.js';
import { PerfBudget } from '../../assets/scripts/adapter/PerfBudget.js';

test('rolling windows evict old slow frames and bound high frequency samples',()=>{
 const m=new FpsMonitor();m.frame(0,0,0);m.frame(250,3,5);
 assert.equal(m.snapshot().slowFrames,1);assert.equal(m.snapshot().coreMs,3);assert.equal(m.snapshot().presentationMs,5);
 for(let t=266;t<=2000;t+=16)m.frame(t,2,4);
 assert.equal(m.snapshot().slowFrames,0);assert.equal(m.snapshot().coreMs,2);
 for(let t=2001;t<5000;t++)m.frame(t,2,4);
 assert.ok(m.snapshot().sampleCount<=240);
 m.suspend();m.frame(100000,0,0);assert.ok(m.snapshot().maxFrameMs<200);
 m.reset();assert.equal(m.snapshot().fps,null);
});

test('budget warnings are development opt-in, rate limited, and commands/snapshots bounded and isolated',()=>{
 let now=0;const warnings:string[]=[];
 const p=new PerfBudget(()=>now,message=>warnings.push(message));p.warningsEnabled=true;
 p.frame(1,2);now=250;p.frame(3,4);assert.equal(warnings.length,1);
 now=500;p.frame(1,1);assert.equal(warnings.length,1);
 now=6000;p.frame(1,1);assert.equal(warnings.length,2);
 p.warningsEnabled=false;now=12000;p.frame(1,1);assert.equal(warnings.length,2);
 for(let i=0;i<500;i++){p.command(now,now+1);now+=2;p.feedback();}
 assert.equal(p.snapshot().commands.length,120);
 assert.equal(p.snapshot().commands[119].responseMs,2);
 p.snapshot().commands.length=0;assert.equal(p.snapshot().commands.length,120);
 p.suspend();now+=100000;p.frame(0,0);assert.ok(p.snapshot().frames.sampleCount<=240);
 p.reset();assert.equal(p.snapshot().commands.length,0);
});
