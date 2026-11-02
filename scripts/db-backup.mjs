// Dumps the garmin and phoenix databases into backups/ (personal data, gitignored).
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';

const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '');

function dump(db) {
  const file = `backups/${db}-${stamp}.dump`;
  return new Promise((resolve) => {
    const out = createWriteStream(file);
    const child = spawn(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'garmin', '-Fc', db],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    child.stdout.pipe(out);
    let failed = false;
    const done = (ok) => {
      if (failed) return;
      failed = !ok;
      out.end(() => {
        if (ok) {
          console.log(`Wrote ${file}`);
        } else {
          rmSync(file, { force: true });
          console.error(`Dump of ${db} failed`);
        }
        resolve(ok);
      });
    };
    child.on('error', () => done(false));
    child.on('close', (code) => done(code === 0));
  });
}

mkdirSync('backups', { recursive: true });
const results = [await dump('garmin'), await dump('phoenix')];
process.exit(results.every(Boolean) ? 0 : 1);
