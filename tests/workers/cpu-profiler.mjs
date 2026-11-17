import WebSocket from 'ws';

// Local workerd/DevTools sampling is indicative; Cloudflare's production CPU metric is authoritative.
export async function connectCpuProfiler(port) {
  let target;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const entries = await response.json();
      target = entries.find((entry) => entry.webSocketDebuggerUrl);
      if (target) break;
    } catch {
      // Wrangler may start its inspector after the HTTP listener.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!target) throw new Error('Inspector local do Worker indisponível.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const pending = new Map();
  let nextId = 1;
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  socket.on('close', () => {
    for (const { reject } of pending.values()) reject(new Error('Inspector desconectado.'));
    pending.clear();
  });
  function command(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  await command('Profiler.enable');
  await command('Profiler.setSamplingInterval', { interval: 1000 });
  return {
    async measure(label, operation) {
      await command('Profiler.start');
      const start = performance.now();
      let result;
      let failure;
      try {
        result = await operation();
      } catch (error) {
        failure = error;
      }
      const wallMs = performance.now() - start;
      const { profile } = await command('Profiler.stop');
      const idleIds = new Set(
        profile.nodes
          .filter((node) => node.callFrame.functionName === '(idle)')
          .map((node) => node.id),
      );
      const functions = new Map(
        profile.nodes.map((node) => [node.id, node.callFrame.functionName]),
      );
      const frequency = new Map();
      for (const sample of profile.samples || []) {
        const name = functions.get(sample) || '(unknown)';
        frequency.set(name, (frequency.get(name) || 0) + 1);
      }
      const activeSamples = (profile.samples || []).filter((sample) => !idleIds.has(sample)).length;
      if (failure) throw failure;
      return {
        result,
        sample: {
          label,
          wallMs: Math.round(wallMs),
          activeSamples,
          approxCpuMs: activeSamples,
          topFrames: [...frequency]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 6)
            .map(([functionName, samples]) => ({ functionName, samples })),
        },
      };
    },
    close() {
      socket.close();
    },
  };
}
