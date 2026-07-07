# opportunity-feed

Machine-maintained feed of internship and program opportunities, consumed by my
[Opportunity Tracker](../opportunity-tracker) dashboard.

- **`results.json`** — the live feed (JSON array). The tracker reads it via this repo's raw URL.
- **`archive.json`** — expired or dead entries, kept so they don't get re-added.
- **`state.json`** — sweep bookkeeping (`seen_urls`, `last_bucket`).
- **`SWEEP-AGENT.md`** — the prompt a scheduled Claude agent follows on each run. It is the
  only writer of the three JSON files; edit the prompt, not the data.

Each scheduled run ("sweep") searches one rotating source bucket, verifies every posting by
fetching it, merges new finds, prunes expired ones, validates the JSON, and pushes.
