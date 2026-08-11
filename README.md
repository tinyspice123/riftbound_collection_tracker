# Riftbound Collection Tracker

A static, mobile-friendly Riftbound TCG collection tracker backed by published
Google Sheets. The home page lists Origins, Spiritforged, Unleashed, and
Vendetta; each set opens the shared tracker with filtering, quantities,
completion totals, exports, local card images, marketplace searches, and
offline caching.

The deployed site is:

<https://tinyspice123.github.io/riftbound_collection_tracker/>

This is a fan-made tool and is not affiliated with Riot Games.

## Quick start

Requirements:

- Node.js 24 for checks and browser tests
- Python 3.14 for maintenance scripts and their tests

Install dependencies and run the checked-in site:

```bash
npm ci
node tests/e2e/static-server.mjs public
```

Open <http://127.0.0.1:4173/>. The small development server exposes only the
checked-in files under `public/`. Playwright mocks the deployed backup endpoint
when testing the Google Sheets outage path.

Run all test layers from the repository root:

```bash
npm run test:site
npm run test:coverage
npm run test:e2e
npm run test:python
```

## Install on a phone

The tracker is a Progressive Web App named **Riftbound Tracker**. It has Ahri
launcher artwork at 192px, 512px, and Android maskable sizes, plus a service
worker for offline shell and image caching.

- Android Chrome: choose **Install app** or **Add to Home screen**.
- iPhone Safari: choose **Share → Add to Home Screen**.

Remove and reinstall an existing shortcut after an icon change so the phone
refreshes its cached launcher artwork.

## Sets and Google Sheets

Set configuration lives in `public/sets.js`. Each entry contains a display
name, set code, numeric Google Sheet tab ID, and optional presentation fields.
The shared published document URL is stored once in `SHEET_BASE_URL`.

The four configured sets are:

| ID | Name | Code |
| --- | --- | --- |
| `origins` | Origins | OGN |
| `spiritforged` | Spiritforged | SFD |
| `unleashed` | Unleashed | UNL |
| `vendetta` | Vendetta | VEN |

Import `docs/template.csv` when creating another tab. The tracker recognises
these columns:

| Column | Purpose |
| --- | --- |
| Group | Section heading and filter value |
| Card | Displayed card name |
| Number | Collector number |
| Variant / Stamp | Finish, promo source, stamp, or other distinction |
| Source | Optional product or source note |
| Status | Optional checklist status |
| Price | Estimated value of one copy |
| Have | Owned quantity, `x`, or `TRUE` |
| Image URL | Exact official-gallery image URL |

Publish the document with **File → Share → Publish to web**, select CSV output,
and store each tab's numeric `gid` in `public/sets.js`. Sheet edits appear on
the site without a code deployment.

## Logos and local card images

Set logos are committed under `public/assets/logos/`. The tracker looks for a
local `<set-id>.png` first and falls back to the set name if no valid image is
available.

Card artwork is committed under `public/img/<set-id>/`. Each directory has a
`manifest.txt` mapping exact sheet identities to local filenames:

```text
Card|Number|Variant / Stamp|filename.webp
```

Refresh the sheet backups first, then download missing official-gallery images:

```bash
python scripts/backup_sheets.py
python scripts/download_card_images.py
```

Limit the downloader to selected sets by appending their IDs:

```bash
python scripts/download_card_images.py origins vendetta
```

Images are stored as compressed 600px WebP files. Existing valid files are
skipped. At runtime, a matching local manifest image is preferred and the
sheet's Image URL remains available as a network fallback.

## Backups and outage behavior

Run the backup operation manually with:

```bash
python scripts/backup_sheets.py
python scripts/validate_data.py
```

`backup_sheets.py` downloads and validates every configured published tab and
writes the latest snapshots to the single canonical `backups/` directory. The
validator checks the CSVs, exact manifest mappings, and local image files.

The scheduled **Backup collection sheets** workflow runs daily at 09:00 UTC and
commits only changed snapshots. When data changes, it dispatches the normal
test-and-deploy pipeline.

At runtime the tracker requests Google Sheets first. If Sheets is unreachable
or returns invalid CSV, the tracker requests `backups/<set-id>.csv` from the
deployed site and displays a warning. Only root `backups/` is committed; during
deployment CI copies those files into generated `public/backups/`. There is no
committed duplicate `public/data/` directory, and older snapshots remain
recoverable through Git history.

## Tests, CI, and deployment

The test layers are:

- `npm run test:site`: ESLint and static repository checks
- `npm run test:coverage`: JavaScript unit coverage
- `npm run test:python`: maintenance-script unit tests
- `npm run test:e2e`: desktop and mobile Playwright checks

On pushes to `main` and pull requests, `.github/workflows/ci-quality-deploy.yml`
runs workflow linting, JavaScript and Python coverage, backup/image validation,
browser tests, and the SonarQube Quality Gate. For a deployable push, CI then:

1. Replaces the service worker's build-version placeholder with the commit SHA.
2. Copies `backups/*.csv` into generated `public/backups/`.
3. Uploads `public/` as the GitHub Pages artifact.
4. Deploys it and smoke-tests the home page, tracker, manifest, service worker,
   a backup CSV, and a local image manifest.

The weekly **Production dependency canary** verifies live published sheets,
committed backups, and local image manifests. **Toggle maintenance mode** can
temporarily publish the maintenance page or restore the live site. In repository
**Settings → Pages**, the source must be **GitHub Actions**.

## Project structure

```text
.
├── backups/                  # Canonical versioned Google Sheet snapshots
├── docs/template.csv         # Sheet template
├── public/                   # GitHub Pages site
│   ├── assets/               # Ahri PWA icons, fonts, and set logos
│   ├── backups/              # Generated only in the deployed artifact
│   ├── img/<set-id>/         # Local card images and manifests
│   ├── index.html/js/css     # Set-selection page
│   ├── tracker.html/js/css   # Shared collection tracker
│   ├── sets.js               # Set registry and published sheet IDs
│   ├── manifest.json         # PWA metadata
│   └── sw.js                 # Offline service worker
├── scripts/                  # Backup, validation, and image tools
├── tests/                    # Static, unit, Python, and browser tests
├── playwright.config.mjs
├── sonar-project.properties
└── package.json
```

## Troubleshooting

**A set is missing** — check its `public/sets.js` entry and run
`npm run test:site`.

**Live data fails** — confirm the document is published as CSV. The tracker
will display the latest deployed backup when Sheets cannot be reached.

**A card image is missing** — confirm the sheet Image URL, then run the backup
and image downloader. Check the exact entry in
`public/img/<set-id>/manifest.txt`.

**An installed app looks stale** — reload once while online. For a changed app
icon, remove the existing shortcut and install it again.
