// Restores a pg_dump -Fc file into the garmin or phoenix database.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';

const [db, file] = process.argv.slice(2);

if (!['garmin', 'phoenix'].includes(db) || !file || !existsSync(file)) {
  console.error('Usage: npm run db:restore -- <garmin|phoenix> <file>  (the file must exist)');
  process.exit(1);
}

const child = spawn(
  'docker',
  ['compose', 'exec', '-T', 'postgres', 'pg_restore', '-U', 'garmin', '--clean', '--if-exists', '-d', db],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);
createReadStream(file).pipe(child.stdin);
child.on('error', (err) => {
  console.error(err.message);
  process.exit(1);
});
child.on('close', (code) => process.exit(code ?? 1));
