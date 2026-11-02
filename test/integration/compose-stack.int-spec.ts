import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file: string) => readFileSync(file, 'utf8');
const lines = (file: string) =>
  read(file)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

type Service = {
  image?: string;
  ports?: string[];
  env_file?: unknown;
  environment?: string[];
  restart?: string;
  logging?: { driver?: string };
};
const compose = parse(read('compose.yaml')) as {
  services: Record<string, Service>;
  volumes: Record<string, { name: string; external: boolean }>;
};
const services = Object.entries(compose.services);

describe('compose stack', () => {
  it('has exactly the services mcp, postgres and phoenix', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['mcp', 'phoenix', 'postgres']);
  });

  it('publishes every port on 127.0.0.1 only', () => {
    for (const [, s] of services) {
      for (const port of s.ports ?? []) expect(port.startsWith('127.0.0.1:')).toBe(true);
    }
  });

  it('uses no env_file', () => {
    for (const [, s] of services) expect(s.env_file).toBeUndefined();
  });

  it('gives GARMIN_PERSONAL_API_KEY to mcp only', () => {
    for (const [name, s] of services) {
      const has = (s.environment ?? []).some((e) => e.startsWith('GARMIN_PERSONAL_API_KEY='));
      expect(has).toBe(name === 'mcp');
    }
  });

  it('pins every image to a full tag', () => {
    for (const [, s] of services) {
      if (!s.image) continue;
      expect(s.image).toMatch(/:.*\d+\.\d+/);
      expect(s.image).not.toMatch(/:(latest|pg18)$/);
    }
  });

  it('declares pgdata as the external garmin-mcp-pgdata volume', () => {
    expect(compose.volumes.pgdata).toEqual({ name: 'garmin-mcp-pgdata', external: true });
  });

  it('restarts and logs the same way on every service', () => {
    for (const [, s] of services) {
      expect(s.restart).toBe('unless-stopped');
      expect(s.logging?.driver).toBe('json-file');
    }
  });
});

describe('personal-data guards', () => {
  it('lists every entry in .dockerignore', () => {
    const entries = lines('.dockerignore');
    for (const e of ['.env*', '.garmin-samples/', 'books/', '.books/', 'spikes/', 'backups/', 'node_modules/', 'dist/', '.git/', '*.fit', '*.FIT', '*.zip']) {
      expect(entries).toContain(e);
    }
  });

  it('keeps .env.example free of values', () => {
    for (const line of lines('.env.example')) expect(line).toMatch(/^[A-Z_]+=$/);
  });

  it('gitignores backups/', () => {
    expect(lines('.gitignore')).toContain('backups/');
  });
});
