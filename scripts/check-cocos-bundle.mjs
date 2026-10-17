import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
execFileSync(process.execPath,['scripts/sync-cocos-core.mjs'],{stdio:'inherit'});
// Exercise the real self-contained browser artifact in a realm without Node APIs or clone global.
const code=await build({absWorkingDir:process.cwd(),entryPoints:['assets/scripts/generated/core.js'],bundle:true,platform:'browser',format:'iife',globalName:'Core',write:false,target:'es2018'});
const realm=vm.createContext({});vm.runInContext(code.outputFiles[0].text,realm);
const result=vm.runInContext(`(()=>{const s=new Core.BattleSession();s.restart();for(let i=0;i<3000&&s.snapshot.result==='running';i++)s.tick(.05);return s.snapshot})()`,realm);
assert.notEqual(result.result,'running');assert.equal(result.waveIndex,3);
// Parse/bundle all authored cc bindings, leaving only the genuine engine external.
await mkdir('dist/cocos-check',{recursive:true});
const binding=await build({absWorkingDir:process.cwd(),entryPoints:['assets/scripts/adapter/BattleSceneController.ts'],tsconfig:'tsconfig.cocos.json',bundle:true,platform:'browser',format:'esm',target:'es2018',external:['cc'],outfile:'dist/cocos-check/battle.js',metafile:true});
const imports=Object.values(binding.metafile.outputs).flatMap(o=>o.imports.map(i=>i.path));
assert.deepEqual([...new Set(imports)],['cc']);
const scene=JSON.parse(await readFile('assets/scenes/Battle.scene','utf8'));
function refs(v){if(!v||typeof v!=='object')return; if('__id__'in v)assert.ok(Number.isInteger(v.__id__)&&scene[v.__id__]);for(const child of Object.values(v))refs(child);}
refs(scene);
const meta=JSON.parse(await readFile('assets/scripts/adapter/BattleSceneController.ts.meta','utf8'));
const hex=meta.uuid.replaceAll('-',''),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const compressed=hex.slice(0,5)+Array.from({length:9},(_,i)=>{const n=parseInt(hex.slice(5+i*3,8+i*3),16);return alphabet[n>>6]+alphabet[n&63]}).join('');
assert.ok(scene.some(o=>o.__type__===compressed&&o.node?.__id__===2));
console.log(`Browser core executed to ${result.result} at ${result.time_s}s, wave ${result.waveIndex}; adapter bundle imports only cc; scene references/controller UUID consistent.`);
console.log('This is NOT an editor import, renderer test, or Cocos platform build.');
