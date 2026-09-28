import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Never install hooks in a parent or unrelated checkout.
if (existsSync('.git') && !process.env.CI) {
  const result = spawnSync('pnpm', ['exec', 'husky'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
