# Scout — Jayden's internship discovery board

The static site is published from this repository with GitHub Pages:

**https://jaydensalman-jpg.github.io/opportunity-feed/**

The site reads `listings.json`, which is refreshed every 15 minutes from these
community-maintained repositories. Scout uses Vansh's structured source file
when present and otherwise parses its README table; it parses the Zapply
README tables directly:

- [zapplyjobs/underclassmen-internships](https://github.com/zapplyjobs/underclassmen-internships)
- [vanshb03/Summer2027-Internships](https://github.com/vanshb03/Summer2027-Internships)

`sync-listings.mjs` checks the GitHub commit history for each source file first. If
the SHA is unchanged, it skips downloading and parsing the table. When a README
changes, it parses the GitHub compare patch and merges only changed rows. A
bootstrap or incomplete compare response triggers a full snapshot. Listings
are deduplicated by normalized company and role, assigned stable IDs, tagged
from their source text, and moved to `listings-archive.json` when removed or
marked closed upstream. `github-state.json` stores source SHAs and source-row
state for incremental syncs.

The dashboard ranks opportunities against Jayden's UW Informatics, class of
2028 profile. Applied and dismissed states, theme, and preferences persist in
the browser. The source repositories do not always provide application URLs;
when they don't, Scout shows that the link is missing instead of inventing a
destination.

GitHub Actions runs the sync and site deployment every 15 minutes. The first
Pages deployment requires GitHub Pages to be enabled for this repository with
the **GitHub Actions** deployment source in Settings → Pages.
