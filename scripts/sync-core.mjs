// The church engine lives in flockwise-api/src/core and is copied here so the demo mode
// runs exactly the same code as the server. Run after changing it: npm run sync-core
import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const from = resolve(process.argv[2] ?? '../flockwise-api/src/core');
const to = resolve('src/core');
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`Copied ${from} -> ${to}`);
