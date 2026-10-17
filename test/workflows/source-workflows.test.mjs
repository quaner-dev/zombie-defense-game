import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../..',import.meta.url));
function sourceCopy(prefix){
 const dir=mkdtempSync(join('/tmp',prefix));
 // Source copies have no .git: use the delivery exclusions directly, so these
 // regressions also run under a complete `npm test` in the copied source tree.
 const excluded=new Set(['.git','node_modules','dist','library','local','temp','build','profiles']);
 cpSync(root,dir,{recursive:true,filter:src=>{
  const name=relative(root,src).split('\\').join('/');
  return !name.split('/').some(part=>excluded.has(part))&&
    !['assets/scripts/generated/core.js','assets/scripts/generated/core.d.ts'].includes(name);
 }});
 assert.equal(existsSync(join(dir,'assets/scripts/generated/core.js')),false,'copy must exclude ignored generated artifact');
 return dir;
}
const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
function childProcessesAvailable(){
 const probe=spawnSync(process.execPath,['--version'],{encoding:'utf8',env:childEnv});
 return probe.error==null&&probe.status===0;
}
function run(dir,args){
 const r=spawnSync('npm',args,{cwd:dir,encoding:'utf8',timeout:180000,env:childEnv});
 assert.equal(r.status,0,`${dir}: npm ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
 return r.stdout;
}
test('fresh source: npm ci then documented npm test and adapter commands generate current core',(t)=>{
 if(!childProcessesAvailable()) return t.skip('sandbox denies nested child processes (EPERM)');
 const dir=sourceCopy('zombie-fresh-');
 try{
  run(dir,['ci','--no-audit','--no-fund']);
  run(dir,['test','--','test/adapter/runtime-bindings.test.ts']);
  assert.ok(existsSync(join(dir,'assets/scripts/generated/core.js')));
  // An existing stale/corrupt artifact must be replaced before adapter tests start.
  writeFileSync(join(dir,'assets/scripts/generated/core.js'),'throw new Error("STALE GENERATED CORE");');
  run(dir,['run','test:adapter']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('space path: generation from another cwd, both typechecks and bundle checks use filesystem paths',(t)=>{
 if(!childProcessesAvailable()) return t.skip('sandbox denies nested child processes (EPERM)');
 const dir=sourceCopy('zombie source space ');
 try{
  run(dir,['ci','--no-audit','--no-fund']);
  const result=spawnSync(process.execPath,[resolve(dir,'scripts/sync-cocos-core.mjs')],{cwd:process.env.TMPDIR??'/root',encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  run(dir,['run','typecheck']);run(dir,['run','typecheck:cocos']);run(dir,['run','check:cocos-bundle']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
