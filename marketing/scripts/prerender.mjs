import { readFile, writeFile } from 'node:fs/promises';
import { render } from '../.prerender/render.js';

// Build-time only: the published output is static HTML, CSS, JS and public assets.
const output = new URL('../dist/index.html', import.meta.url);
const html = await readFile(output, 'utf8');
const marker = '<div id="root"></div>';
if (!html.includes(marker)) throw new Error('Prerender root not found.');
await writeFile(output, html.replace(marker, `<div id="root">${render()}</div>`));
console.log('Static marketing HTML generated; no runtime backend required.');
