# Security

## Personal data is never committed

This repository holds code, docs and synthetic test fixtures only. The Athlete's Garmin data, the Garmin Personal API key and the Running Books never enter git (ADR 0002, `docs/adr/0002-synthetic-test-data-real-data-stays-local.md`). They live here instead:

| What | Where it lives | Why it stays out |
|---|---|---|
| Garmin Personal API key | `.env` (local only) | A credential for the Athlete's Garmin account |
| Real Garmin samples (JSON, FIT ZIPs, `expected.json`) | `.garmin-samples/` (local only) | FIT Files hold full GPS tracks and 1 Hz heart rate |
| Synced Garmin data (raw JSON, FIT ZIPs, Derived Metrics) | The Postgres volume of the Docker Compose stack | Personal training and Wellness Data |
| Running Books (PDFs) | `./books` (local only) | Copyrighted material |

The only PDF in the repository is the invented Docling fixture in `docling-sidecar/fixtures/`.

## Guards

- `.gitignore` excludes `.env`, `.garmin-samples/`, `books/`, `*.fit`, `*.zip` and `*.pdf` (except the Docling fixture).
- The `ci` workflow runs [gitleaks](https://github.com/gitleaks/gitleaks) over the full history and a forbidden-path check on `git ls-files` (`npm run check:paths`). It uses no repository secrets.
- GitHub secret scanning and push protection are on.

Before pushing, run the same checks locally:

```bash
gitleaks git --redact .
npm run check:paths
```

## Reporting a leak

If you find personal data, a credential or book content in this repository or its history, **do not open a public issue**. Report it privately to the repository owner: through GitHub's [private vulnerability reporting](../../security/advisories/new) when it is enabled for this repository, otherwise by a direct message to the owner on GitHub.

What happens next:

1. A leaked Garmin key is revoked and a new one is issued in Garmin Connect first, before any clean-up.
2. The data is removed from the tip, and then from history (`git filter-repo`), followed by a force-push and a request to GitHub to purge cached views.
