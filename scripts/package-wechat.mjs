import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'build', 'wechat');
const maxBytes = 4 * 1024 * 1024;
const files = ['package.json', 'settings', 'assets'];

process.chdir(root);
execFileSync(process.execPath, ['scripts/sync-cocos-core.mjs'], { stdio: 'inherit' });
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of files) await cp(join(root, entry), join(output, entry), { recursive: true });

async function totalSize(path) {
  const info = await stat(path);
  if (info.isFile()) return info.size;
  let sum = 0;
  for (const child of await readdir(path)) sum += await totalSize(join(path, child));
  return sum;
}

const bytes = await totalSize(output);
if (bytes >= maxBytes) {
  throw new Error(`WeChat source package is ${(bytes / 1024 / 1024).toFixed(2)} MB; limit is 4 MB`);
}
const packageJson = JSON.parse(await readFile(join(output, 'package.json'), 'utf8'));
console.log(`Prepared ${relative(root, output)} (${(bytes / 1024).toFixed(1)} KB) for Cocos WeChat build.`);
console.log(`Creator ${packageJson.creator?.version ?? 'unknown'} project; open this directory in Creator/DevTools.`);
