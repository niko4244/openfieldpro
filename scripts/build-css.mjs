/**
 * scripts/build-css.mjs
 *
 * Minifies all 8 CSS partials in static/css/ using Lightning CSS.
 * Outputs .min.css files alongside the originals.
 *
 * Usage: node scripts/build-css.mjs
 *        npm run build:css
 */

import { transform, browserslistToTargets } from 'lightningcss';
import { readFileSync, writeFileSync } from 'fs';

import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname.replace(/\\/g, '/').replace(/\/scripts$/, '');

const files = [
  'core.css',
  'layout.css',
  'chat.css',
  'mobile.css',
  'modals.css',
  'components.css',
  'editor.css',
  'tools.css',
];

let totalBefore = 0;
let totalAfter = 0;

console.log('\n  CSS Minification — Lightning CSS');
console.log('  ' + '─'.repeat(45));

for (const file of files) {
  const src  = `${root}/static/css/${file}`;
  const dest = `${root}/static/css/${file.replace('.css', '.min.css')}`;

  const source = readFileSync(src, 'utf-8');
  const before = Buffer.byteLength(source, 'utf-8');

  const { code } = transform({
    filename: file,
    code: Buffer.from(source, 'utf-8'),
    minify: true,
    sourceMap: false,
  });

  const after = code.length;
  const saved = ((1 - after / before) * 100).toFixed(1);

  writeFileSync(dest, code);

  totalBefore += before;
  totalAfter  += after;

  const label = file.padEnd(20);
  console.log(`  ✓ ${label} ${(before / 1024).toFixed(1)}K → ${(after / 1024).toFixed(1)}K  (${saved}% ↓)`);
}

console.log('  ' + '─'.repeat(45));
const totalSaved = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
console.log(`  Total:        ${(totalBefore / 1024).toFixed(0)}K → ${(totalAfter / 1024).toFixed(0)}K  (${totalSaved}% ↓)`);
console.log();
