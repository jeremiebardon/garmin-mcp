// Leak guard (ADR 0002): fails if git tracks or stages a file that must stay
// local. Runs in CI and before every push.
import { execFileSync } from 'node:child_process';

const forbidden = [
  { pattern: /(^|\/)\.env(\.[^/]*)?$/, allow: /(^|\/)\.env\.example$/, why: 'environment file (Garmin key)' },
  { pattern: /(^|\/)\.garmin-samples\//, why: 'real Garmin samples' },
  { pattern: /\.fit$/i, why: 'FIT File (GPS and HR)' },
  { pattern: /\.zip$/i, why: 'archive (Garmin FIT ZIP)' },
  { pattern: /(^|\/)\.?books\//, why: 'Running Books folder' },
  { pattern: /\.pdf$/i, allow: /^docling-sidecar\/fixtures\/[^/]+\.pdf$/, why: 'PDF outside the Docling fixture folder' },
];

const files = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const hits = files.flatMap((file) =>
  forbidden
    .filter(({ pattern, allow }) => pattern.test(file) && !allow?.test(file))
    .map(({ why }) => `${file}  (${why})`),
);

if (hits.length > 0) {
  console.error(`Forbidden paths are tracked by git:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log(`Forbidden-path check passed (${files.length} tracked files).`);
