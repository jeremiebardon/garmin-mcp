# One shared Postgres, with raw Garmin responses as the source of truth

Athlete data and the Knowledge Base live in one `pgvector/pgvector:pg18` database, in separate `garmin` and `kb` schemas. SQLite was rejected because the Knowledge Base already needs Postgres (pgvector plus full-text search fused with RRF), so SQLite would add a second engine instead of removing one.

Every Garmin response is stored verbatim: JSON as `jsonb`, and the FIT ZIP as a blob in the database rather than on a volume. The normalised tables and the per-Activity Derived Metrics are a projection that can be rebuilt from that raw layer at any time. The whole history is small (about 16 MB of FIT), and the Garmin API exposes no modification timestamps. Keeping the raw layer means a better understanding of a field, or a change to an analytics formula, is applied by re-projecting locally instead of re-downloading from Garmin.

## Consequences

- Per-second streams are not persisted. They are re-decoded from the stored FIT File when a tool needs them (about 20 ms per file).
- Derived Metrics carry the analytics version and the inputs they were computed with (HR Zone configuration, FIT profile gender). When any of these changes, every Activity is recomputed from its stored FIT File.
- Backups cover a single database.
