import { spawn } from 'node:child_process';

const children = ['dev:server', 'dev:client'].map((script) =>
    spawn('npm', ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' }));
let stopping = false;
function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill('SIGTERM');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of children) {
    child.on('error', (error) => { console.error(error); stop(1); });
    child.on('exit', (code) => stop(code ?? 1));
}
