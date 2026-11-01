// The Postgres image every DB-backed test runs on (ADR 0001). The only place in
// the repo that writes this tag.
export const POSTGRES_IMAGE = 'pgvector/pgvector:0.8.7-pg18-trixie';
