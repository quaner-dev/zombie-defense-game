import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const npmCommand = process.env.npm_execpath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
const outputIndex = process.argv.indexOf('--output');
const report = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : 'docs/testing/mvp-test-report.json');
const checks = [
  ['sync:core', ['run', 'sync:core']],
  ['acceptance report', ['run', 'acceptance:report', '--', '--output', report]],
  ['full test suite', ['test']],
  ['core typecheck', ['run', 'typecheck']],
  ['Cocos adapter typecheck', ['run', 'typecheck:cocos']],
  ['Cocos bundle contract', ['run', 'check:cocos-bundle']],
];

const results = [];
for (const [name, args] of checks) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(npmCommand, [...npmPrefix,...args], { stdio: 'inherit', env: process.env });
  const code = result.error ? 1 : result.status ?? 1;
  results.push({ name, code });
  if (result.error) console.error(`${name} could not start: ${result.error.message}`);
}

console.log('\n=== MVP verification summary ===');
for (const result of results) console.log(`${result.code === 0 ? 'PASS' : 'FAIL'}\t${result.name} (${result.code})`);
console.log(`Report: ${report}`);
process.exitCode = results.some(result => result.code !== 0) ? 1 : 0;
