import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgets = { entry: 160, chunk: 210, total: 580 };
const files = readdirSync('dist/assets').filter((file) => file.endsWith('.js'));
let total = 0;
let failed = false;
for (const file of files) {
  const kb = gzipSync(readFileSync(`dist/assets/${file}`)).byteLength / 1024;
  total += kb;
  const limit = file.startsWith('index-') ? budgets.entry : budgets.chunk;
  if (kb > limit) {
    process.stderr.write(`${file}: ${kb.toFixed(1)} kB gzip exceeds ${limit} kB\n`);
    failed = true;
  }
}
if (total > budgets.total) {
  process.stderr.write(`Total JavaScript: ${total.toFixed(1)} kB exceeds ${budgets.total} kB\n`);
  failed = true;
}
process.stdout.write(`JavaScript gzip: ${total.toFixed(1)} kB across ${files.length} chunks.\n`);
process.exitCode = failed ? 1 : 0;
