// Only imported by disposable test servers/suites. Never selected through environment variables.
export function testSiteStorage() {
  const objects = new Map();
  let failPut = false,
    failRemove = false;
  return {
    objects,
    set failPut(v) {
      failPut = v;
    },
    set failRemove(v) {
      failRemove = v;
    },
    async put(key, buffer) {
      if (failPut) throw Object.assign(new Error('storage test failure'), { status: 503 });
      objects.set(key, Buffer.from(buffer));
    },
    async read(key) {
      if (!objects.has(key)) throw Object.assign(new Error('image missing'), { status: 404 });
      return Buffer.from(objects.get(key));
    },
    async remove(key) {
      if (failRemove) throw new Error('cleanup test failure');
      objects.delete(key);
    },
  };
}
