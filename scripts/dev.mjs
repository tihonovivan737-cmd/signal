import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'server/index.mjs'], {
  stdio: 'inherit'
}), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  stdio: 'inherit'
})];
const stop = () => children.forEach(child => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => {
  stop();
  process.exitCode = code ?? 0;
}));
