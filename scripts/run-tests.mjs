import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
