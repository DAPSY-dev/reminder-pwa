import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const assets = (await readdir('dist/assets')).map((file) => `/assets/${file}`);
const html = await readFile('dist/index.html', 'utf8');
const version = createHash('sha256')
  .update(html + assets.join(','))
  .digest('hex')
  .slice(0, 16);
const source = await readFile('public/sw.js', 'utf8');
const shell = [
  '/index.html',
  '/offline.html',
  '/icon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  ...assets,
];
await writeFile(
  'dist/sw.js',
  source
    .replace("'reminder-dev'", `'reminder-${version}'`)
    .replace(
      /const SHELL_ASSETS = \[[\s\S]*?\];/,
      `const SHELL_ASSETS = ${JSON.stringify(shell)};`,
    ),
);
