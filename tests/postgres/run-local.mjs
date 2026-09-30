import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import pg from 'pg';

// Never uses DATABASE_URL, POSTGRES_URL, .env, a Windows service or an existing cluster.
const root = fileURLToPath(new URL('../../', import.meta.url));
const binArg = process.argv.indexOf('--bin');
if (binArg < 0 || !process.argv[binArg + 1])
  throw new Error('Usage: node tests/postgres/run-local.mjs --bin <PostgreSQL bin directory>');
const bin = resolve(process.argv[binArg + 1]);
const exe = (name) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
for (const name of ['postgres', 'initdb', 'pg_ctl']) await access(exe(name));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL)$/i.test(
      key,
    ),
  ),
);
const work = await mkdtemp(join(tmpdir(), 'gradefy-pg-validation-'));
const cluster = join(work, 'cluster');
const reportDir = join(root, 'test-results', 'postgres-validation');
await mkdir(reportDir, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  method: 'portable-local',
  host: '127.0.0.1',
  productionAccess: false,
};
let startAttempted = false;
let exitCode = 1;
function command(name, args) {
  const result = spawnSync(exe(name), args, {
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
    // Windows background postgres processes can inherit pipe handles and keep spawnSync waiting.
    stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
  });
  if (result.error || result.status !== 0)
    throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout?.trim() || '';
}
try {
  report.binaryVersion = command('postgres', ['--version']);
  const password = randomBytes(24).toString('hex');
  const passwordFile = join(work, 'password.txt');
  await writeFile(passwordFile, password + '\n', { mode: 0o600 });
  command('initdb', [
    '-D',
    cluster,
    '-U',
    'gradefy_validation',
    '--auth=scram-sha-256',
    '--encoding=UTF8',
    '--locale=C',
    `--pwfile=${passwordFile}`,
  ]);
  await rm(passwordFile);
  const port = await new Promise((done, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => done(port));
    });
  });
  report.port = port;
  startAttempted = true;
  command('pg_ctl', [
    '-D',
    cluster,
    '-l',
    join(work, 'postgres.log'),
    '-w',
    '-t',
    '30',
    '-o',
    `-h 127.0.0.1 -p ${port} -c timezone=UTC -c max_connections=30`,
    'start',
  ]);
  const base = `postgresql://gradefy_validation:${password}@127.0.0.1:${port}/`;
  const runId = randomBytes(8).toString('hex');
  const database = `gradefy_validation_control_${runId}`;
  const token = randomBytes(32).toString('hex');
  const admin = new pg.Client({
    connectionString: base + 'postgres',
    connectionTimeoutMillis: 5000,
    ssl: false,
  });
  try {
    await admin.connect();
    report.serverVersion = (await admin.query('SELECT version() AS version')).rows[0].version;
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
  const url = base + database;
  const control = new pg.Client({ connectionString: url, ssl: false });
  try {
    await control.connect();
    await control.query('CREATE TABLE gradefy_validation_guard (token TEXT NOT NULL)');
    await control.query('INSERT INTO gradefy_validation_guard VALUES ($1)', [token]);
  } finally {
    await control.end();
  }
  console.log(`Testing ${report.binaryVersion} on 127.0.0.1:${port}; new disposable cluster.`);
  let output = '';
  exitCode = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      ['--test', '--test-reporter=spec', 'tests/postgres/foundation.test.js'],
      {
        cwd: root,
        windowsHide: true,
        env: {
          ...env,
          NODE_ENV: 'test',
          DEMO_MODE: 'false',
          DATABASE_URL: '',
          POSTGRES_URL: '',
          DOTENV_CONFIG_PATH: join(work, 'no-environment-file'),
          GRADEFY_PG_TEST_URL: url,
          GRADEFY_PG_TEST_TOKEN: token,
          GRADEFY_PG_TEST_CLUSTER: cluster,
          GRADEFY_PG_TEST_RUN_ID: runId,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => {
        const text = data
          .toString()
          .replaceAll(password, '[redacted]')
          .replaceAll(token, '[redacted]');
        output += text;
        process.stdout.write(text);
      });
    child.once('error', reject);
    child.once('exit', (code) => done(code ?? 1));
  });
  await writeFile(join(reportDir, 'output.txt'), output);
  report.testExitCode = exitCode;
} catch (error) {
  console.error(error.message);
  report.error = 'Validation infrastructure failed; see terminal output.';
} finally {
  let stopped = !startAttempted;
  if (startAttempted) {
    try {
      command('pg_ctl', ['-D', cluster, '-w', '-t', '30', '-m', 'fast', 'stop']);
      stopped = true;
    } catch (error) {
      console.error(error.message);
      exitCode = 1;
    }
  }
  report.clusterStopped = stopped;
  try {
    await writeFile(join(reportDir, 'postgres.log'), await readFile(join(work, 'postgres.log')));
  } catch {
    /* initdb may have failed */
  }
  // Only delete the mkdtemp directory from this run after the server has stopped.
  const target = relative(resolve(tmpdir()), resolve(work));
  if (
    stopped &&
    !isAbsolute(target) &&
    !target.startsWith('..') &&
    /^gradefy-pg-validation-[^\\/]+$/.test(target)
  ) {
    await rm(work, { recursive: true, force: true });
    report.clusterRemoved = true;
  } else report.clusterRemoved = false;
  report.finishedAt = new Date().toISOString();
  await writeFile(join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
process.exitCode = exitCode;
