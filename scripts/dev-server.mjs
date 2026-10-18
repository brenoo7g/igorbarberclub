import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.sql']);

// Poll metadata first: Windows can report a native fs.watch event just for access.
// Hash only changed files so reading/importing code never feeds a restart loop.
export function sourceSnapshot(
  root,
  previous = new Map(),
  envPath = process.env.DOTENV_CONFIG_PATH,
) {
  const files = [];
  function walk(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory() && !['node_modules', 'data', '.git'].includes(entry.name)) walk(path);
      else if (entry.isFile() && sourceExtensions.has(extname(path))) files.push(path);
    }
  }
  walk(join(root, 'server'));
  files.push(resolve(root, envPath || '.env'));
  const current = new Map();
  for (const file of files) {
    try {
      const stat = statSync(file);
      if (!stat.isFile()) continue;
      const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
      const old = previous.get(file);
      current.set(
        file,
        old?.stamp === stamp
          ? old
          : {
              stamp,
              hash: createHash('sha256').update(readFileSync(file)).digest('hex'),
            },
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

export function changedSources(previous, current) {
  return [...new Set([...previous.keys(), ...current.keys()])].filter(
    (file) => previous.get(file)?.hash !== current.get(file)?.hash,
  );
}

export function startDevServer({
  root = process.cwd(),
  args = process.argv.slice(2),
  interval = 750,
  envPath = process.env.DOTENV_CONFIG_PATH,
} = {}) {
  let snapshot = sourceSnapshot(root, undefined, envPath);
  let child;
  let stopping = false;
  let restarting = false;
  const pending = new Set();
  let stopPromise;

  function start() {
    child = spawn(process.execPath, [join(root, 'server', 'index.js'), ...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', (error) =>
      console.error('[dev] Não foi possível iniciar a API:', error.message),
    );
    child.on('exit', (code, signal) => {
      if (!stopping && !restarting)
        console.log(`[dev] API encerrada (${signal || code}). Aguardando alteração no backend.`);
    });
  }
  async function stopChild() {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const running = child;
    await new Promise((done) => {
      const timer = setTimeout(() => running.kill('SIGKILL'), 5000);
      running.once('exit', () => {
        clearTimeout(timer);
        done();
      });
      running.kill('SIGTERM');
    });
  }
  async function restart(files) {
    for (const file of files) pending.add(file);
    if (restarting || stopping) return;
    restarting = true;
    try {
      while (pending.size && !stopping) {
        const changed = [...pending];
        pending.clear();
        console.log(
          `[dev] Backend alterado: ${changed.map((file) => relative(root, file)).join(', ')}. Reiniciando API.`,
        );
        await stopChild();
        if (!stopping) start();
      }
    } finally {
      restarting = false;
    }
  }
  console.log('[dev] Monitorando mudanças de conteúdo no backend e na configuração local.');
  start();
  const timer = setInterval(() => {
    try {
      const current = sourceSnapshot(root, snapshot, envPath);
      const changed = changedSources(snapshot, current);
      snapshot = current;
      if (changed.length) void restart(changed);
    } catch (error) {
      console.error('[dev] Não foi possível verificar os arquivos:', error.message);
    }
  }, interval);
  function stop() {
    if (!stopPromise) {
      stopping = true;
      clearInterval(timer);
      stopPromise = stopChild();
    }
    return stopPromise;
  }
  return { stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = startDevServer();
  const shutdown = () => void server.stop().then(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('disconnect', shutdown);
}
