# Committed tests use synthetic data only; real Garmin data stays local

The repository may be public. Its test suite therefore runs only on synthetic data: FIT Files generated in memory with the `@garmin/fitsdk` encoder from the shapes of a few real Activities, Garmin JSON built from the OpenAPI types, and a seeded Synthetic Athlete history. Every value is deliberately different from the Athlete's real results, dates, ids and HR Zones. The real samples in `.garmin-samples/` feed a separate local-only suite whose expected values also live in that gitignored folder. We gave up the fidelity of testing on the Athlete's own files in CI because, once personal data (GPS tracks, HR, race results) is in git history, removing it means rewriting history. A hermetic suite also runs on any clean clone.

## Consequences

- Expected values come from oracles that are independent of the code: shapes designed so the answer can be computed by hand, constants computed once outside the codebase, and the device's own lap totals. They never come from the implementation.
- Synthetic FIT Files carry no position or altitude fields. No MVP metric uses GPS.
- Leak guards run in CI: a fixture scan, gitleaks, and a forbidden-path check on `git ls-files`. Locally, the fixture scan also compares against the real index.
- Bugs that only real files trigger are caught by the local suite, not by CI. A new quirk found in a real file is reproduced as a synthetic shape before it is fixed.
