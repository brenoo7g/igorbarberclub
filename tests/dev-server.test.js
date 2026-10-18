import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, utimes, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startDevServer } from '../scripts/dev-server.mjs';

test(
  'development monitor ignores access/dependency/data noise, reloads real sources and recovers after a crash',
  { timeout: 60000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'gradefy-dev-watch-'));
    const entry = join(root, 'server', 'index.js');
    const log = join(root, 'ready.log');
    let monitor;
    t.after(async () => {
      if (monitor) await monitor.stop();
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('gradefy-dev-watch-'))
        throw Error('Unexpected disposable watcher directory');
      await rm(root, { force: true, recursive: true });
    });
    await mkdir(join(root, 'server', 'migrations'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'example'), { recursive: true });
    await mkdir(join(root, 'data'));
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, '.env'), 'fixture=one');
    const code = (value) => `
    import {appendFileSync, readFileSync} from 'node:fs';
    appendFileSync(${JSON.stringify(log)}, JSON.stringify({pid:process.pid,value:${JSON.stringify(value)},env:readFileSync(${JSON.stringify(join(root, '.env'))},'utf8'),args:process.argv.slice(2)})+'\\n');
    setInterval(()=>{}, 1000);
  `;
    await writeFile(entry, code('one'));
    async function ready() {
      try {
        return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    }
    async function waitForCount(count) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const rows = await ready();
        if (rows.length >= count) {
          assert.equal(rows.length, count);
          return rows.at(-1);
        }
        await delay(50);
      }
      assert.fail(`Expected ${count} starts, received ${(await ready()).length}`);
    }
    monitor = startDevServer({ root, interval: 100, envPath: '', args: ['--guest-test-mode'] });
    const first = await waitForCount(1);
    assert.deepEqual(first.args, ['--guest-test-mode']);

    await t.test(
      'reading files, touching identical code and changing ignored files do not restart',
      async () => {
        const metadata = await stat(entry);
        await readFile(entry);
        await utimes(entry, new Date(), new Date(metadata.mtimeMs + 5000));
        await writeFile(join(root, 'node_modules', 'example', 'index.js'), 'changed dependency');
        await writeFile(join(root, 'data', 'barber.db'), 'disposable data');
        await writeFile(join(root, 'debug.log'), 'diagnostic');
        await delay(700);
        assert.equal((await ready()).length, 1);
      },
    );
    await t.test(
      'a real source edit restarts exactly once and preserves command arguments',
      async () => {
        await writeFile(entry, code('two'));
        const second = await waitForCount(2);
        assert.notEqual(first.pid, second.pid);
        assert.equal(second.value, 'two');
        assert.deepEqual(second.args, first.args);
        await delay(500);
        assert.equal((await ready()).length, 2);
      },
    );
    await t.test(
      'SQL creation and removal are detected without watching runtime data',
      async () => {
        const migration = join(root, 'server', 'migrations', 'fixture.sql');
        await writeFile(migration, 'SELECT 1;');
        await waitForCount(3);
        await rm(migration);
        await waitForCount(4);
      },
    );
    await t.test(
      'environment edits reload while a save of the same content is ignored',
      async () => {
        await writeFile(join(root, '.env'), 'fixture=two');
        assert.equal((await waitForCount(5)).env, 'fixture=two');
        await writeFile(join(root, '.env'), 'fixture=two');
        await delay(500);
        assert.equal((await ready()).length, 5);
      },
    );
    await t.test('a failed child waits for an edit instead of entering a crash loop', async () => {
      await writeFile(entry, "throw new Error('Controlled watcher fixture failure');");
      await delay(700);
      assert.equal((await ready()).length, 5);
      await writeFile(entry, code('recovered'));
      assert.equal((await waitForCount(6)).value, 'recovered');
    });
    await t.test('shutdown is idempotent and leaves no child running', async () => {
      const current = (await ready()).at(-1);
      await Promise.all([monitor.stop(), monitor.stop()]);
      assert.throws(() => process.kill(current.pid, 0), { code: 'ESRCH' });
      await writeFile(entry, code('after shutdown'));
      await delay(300);
      assert.equal((await ready()).length, 6);
    });
  },
);
