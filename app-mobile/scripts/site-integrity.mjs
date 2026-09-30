import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(app);
const snapshot = path.join(app, 'site-integrity.json');
function collect(dir, result = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (full === app || ['.git', 'node_modules'].includes(entry.name)) continue;
    if (entry.isDirectory()) collect(full, result);
    else if (entry.isFile())
      result[path.relative(root, full)] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(full))
        .digest('hex');
  }
  return result;
}
if (process.argv.includes('--capture')) {
  if (fs.existsSync(snapshot))
    throw new Error('Snapshot já existe. Não sobrescrever a referência.');
  const files = collect(root);
  fs.writeFileSync(snapshot, JSON.stringify(files, null, 2) + '\n');
  console.log(`${Object.keys(files).length} arquivos originais registrados.`);
} else {
  const before = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
  const after = collect(root);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (name) => before[name] !== after[name],
  );
  if (changed.length) {
    console.error('Arquivos externos alterados:', changed);
    process.exitCode = 1;
  } else console.log(`${Object.keys(before).length} arquivos originais intactos (SHA-256).`);
}
