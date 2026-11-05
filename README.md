# Riftbound Collection Tracker

A static, mobile-friendly Riftbound TCG collection tracker backed by Supabase.
The home page lists Origins, Spiritforged, Unleashed, and
Vendetta, and Radiance; each set opens the shared tracker with filtering, quantities,
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
checked-in files under `public/`. Playwright mocks the Supabase REST and Auth
endpoints for browser tests.

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

## Sets and Supabase

Presentation configuration lives in `public/sets.js`. Card rows and quantities
live in `public.riftbound_card_main`; quantity changes are audited in
`public.riftbound_card_quantity_history`.

The five configured sets are:

| ID | Name | Code |
| --- | --- | --- |
| `origins` | Origins | OGN |
| `spiritforged` | Spiritforged | SFD |
| `unleashed` | Unleashed | UNL |
| `vendetta` | Vendetta | VEN |
| `radiance` | Radiance | RAD |

The import and backup scripts preserve these CSV columns:

| Column | Purpose |
| --- | --- |
| Group | Section heading and filter value |
| Card | Displayed card name |
| Number | Collector number |
| Variant / Stamp | Finish, promo source, stamp, or other distinction |
| Source & Distribution | Optional product or source note |
| Status | Optional checklist status |
| Have | Owned quantity, `x`, or `TRUE` |
| Image | Exact official-gallery image URL |
| Price Estimate | Estimated value of one copy |

Apply the consolidated migration under `supabase/migrations/`, then import the
checked-in snapshots with `python scripts/import_supabase_cards.py` using
`SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

### Importing card and foil rows

The importer creates separate foil checklist rows for base Common and
Uncommon cards. Base Rare and Epic cards are already foil in their standard
printing, so they are not duplicated.

In PowerShell, use the Supabase **API URL**, not the dashboard URL. Find the
secret key under **Project Settings → API Keys** (or use the legacy
`service_role` key):

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_..."
python scripts/import_supabase_cards.py
Remove-Item Env:SUPABASE_SECRET_KEY
```

For example, project `ekyngjwtoxvkqfalxebm` uses:
`https://ekyngjwtoxvkqfalxebm.supabase.co`.

Never commit or paste the secret key into browser code, Git, or support chats.

## Adding sets, cards, and logos

### Add a new set

1. Choose a permanent lowercase ID, such as `radiance`. Add its name, code,
   `homeGroup: "core"`, and subtitle to `public/sets.js`, following an existing
   entry. This creates its home-page link and shared tracker page automatically.
2. Create `backups/<set-id>.csv` using the header in `docs/template.csv` (or an
   existing backup). Add verified official-gallery card names, collector numbers,
   variants, rarity/type source notes, image URLs, and zero `Have` quantities.
   A group heading goes on its own row with only the `Group` column populated;
   the following card rows have an empty `Group`. Keep numbers as text.
3. Include each printing once. Common/Uncommon Regular cards can have separate
   Foil entries; the migration generator adds missing foil rows automatically.
   Standard Rare/Epic cards do not need duplicate foil rows. Include generated
   foil rows in the CSV too so the offline checklist matches the database.
4. Add the ID to `SETS` in both `scripts/download_card_images.py` and
   `scripts/validate_data.py`. Add its code and verified base-card total/token
   numbers to `expected` and `expectedNumbers` in
   `tests/site/riftbound_checks.mjs`. Update the home-page set count in
   `tests/e2e/tracker.spec.mjs` and the set table in this README.
5. Save the official transparent PNG logo as
   `public/assets/logos/<set-id>.png`. Use an actual PNG, not a renamed WebP/SVG.
   No logo registry or HTML edit is necessary: both home and tracker look up
   this exact path. Use official publisher/retailer marketing assets.
6. Download scans, create the manifest, and generate a **new** SQL migration:

   ```bash
   python scripts/download_card_images.py radiance
   python scripts/generate_card_migration.py radiance supabase/migrations/202611060001_add_radiance_cards.sql
   ```

   Replace `radiance` with the new set ID and use a fresh numeric timestamp in
   the filename. The example is a command pattern; Radiance is already seeded.
   The generator refuses to overwrite a file, adds missing identities with zero
   quantity, and appends their sort positions without modifying existing cards.
7. Review the CSV, PNG, image manifest, and SQL. Run:

   ```bash
   python scripts/validate_data.py
   npm run test:site
   npm run test:python
   ```

8. Commit the registry, backup, logo, scans/manifest, scripts/tests, and new SQL
   together. Push to `main`. CI applies migrations before deploying Pages, then
   creates a semantic release after a successful deployment. The
   `supabase-production` environment must already have `SUPABASE_DATABASE_URL`
   set to its **Session pooler** PostgreSQL URI.

Do not run `backup_supabase.py` between preparing new CSV rows and applying the
migration: the database export would replace your unimported additions.

### Add cards to an existing set

First run `python scripts/backup_supabase.py` to refresh the current snapshot.
Append the new verified printings to `backups/<set-id>.csv`, with zero quantities
and the correct group heading. Run the image downloader and migration generator
above, using that set ID and a fresh migration filename. The generator can read
the entire snapshot: existing card IDs are skipped, so owned quantities remain
unchanged. Validate, commit, and push the backup, new scans/manifest, and SQL.

Card identity is based on set ID, card name, number, and variant. Changing one
of those creates a different identity; renames, corrections, deletions, and
changes to existing metadata require a deliberate new SQL migration. Never edit
an applied migration. The general `import_supabase_cards.py` tool is intended
for initial imports/restores and **overwrites quantities from the snapshots**;
use the insert-only migration generator for routine catalogue additions.

### Add or replace a logo only

Replace `public/assets/logos/<set-id>.png` with the official PNG, run
`npm run test:site`, then commit and push. No database migration or card import
is needed. The next deployment updates the site and its service-worker version.

## Logos and local card images

Set logos are committed under `public/assets/logos/`. The tracker looks for a
local `<set-id>.png` first and falls back to the set name if no valid image is
available. Radiance?s standalone wordmark is sourced from the
[Red Riot Games set listing](https://redriotgames.ca/pages/riftbound-singles).

Card artwork is committed under `public/img/<set-id>/`. Each directory has a
`manifest.txt` mapping exact sheet identities to local filenames:

```text
Card|Number|Variant / Stamp|filename.webp
```

Refresh the sheet backups first, then download missing official-gallery images:

```bash
python scripts/backup_supabase.py
python scripts/download_card_images.py
```

Limit the downloader to selected sets by appending their IDs:

```bash
python scripts/download_card_images.py origins vendetta
```

Images are stored as compressed 600px WebP files when the source CDN supports
conversion; valid JPEG and PNG responses are retained otherwise. Existing valid
files are skipped. At runtime, a matching local manifest image is preferred and
the sheet's Image URL remains available as a network fallback.

## Backups and outage behavior

Run the backup operation manually with:

```bash
python scripts/backup_supabase.py
python scripts/download_card_images.py
python scripts/validate_data.py
```

`backup_supabase.py` exports every configured set and writes the latest
snapshots to the single canonical `backups/` directory. Refresh the local
images and manifests after an export, then run the validator; it checks exact
CSV-to-manifest mappings and local image files.

The scheduled **Backup Supabase collection** workflow runs daily at 09:00 UTC and
commits changed snapshots and local image fallbacks. When data changes, it dispatches the normal
test-and-deploy pipeline.

At runtime the tracker requests Supabase first. If it is unreachable or returns
no data, the tracker requests `backups/<set-id>.csv` from the deployed site and
displays a read-only warning. Backup CSVs and local image fallbacks are committed; during
deployment CI copies those files into generated `public/backups/`. There is no
committed duplicate `public/data/` directory, and older snapshots remain
recoverable through Git history.

## Tests, CI, and deployment

The test layers are:

- `npm run test:site`: ESLint and static repository checks
- `npm run test:coverage`: JavaScript unit coverage
- `npm run test:python`: maintenance-script unit tests
- `npm run test:e2e`: desktop and mobile Playwright checks

On pushes to `main`, the lean deployment workflow runs lint, static checks,
JavaScript and Python unit tests, and backup/image validation, applies pending
Riftbound migrations, then publishes GitHub Pages. Pull requests run checks only.
There is no SonarQube gate or browser-test installation on the deployment path.
After a successful push deployment, `release.yml` automatically creates a GitHub
release with generated notes and a semantic version tag, starting at `v1.0.0`.
Commits since the latest semantic tag determine the bump: `feat:` or
`feat(scope):` bumps minor; `type!:` or a `BREAKING CHANGE:` footer bumps major;
other commits bump patch. Existing `deploy-*` releases remain in place.
Reruns and delayed deployments of older commits do not create extra releases.
Failed deployments never create releases.

### Automatic Supabase migrations

In this repository, create the GitHub Actions environment `supabase-production`
and add its secret `SUPABASE_DATABASE_URL`: the Supabase Postgres connection URI
from **Connect** (use the session pooler for GitHub-hosted runners). This is a
database password connection, not the public API URL or service-role key.
Secrets from the Pokemon repository are not automatically shared here.

`scripts/migrate_supabase.py` uses `psql` (available on Ubuntu runners), a single
transaction, an advisory lock, and checksums to apply each SQL file once before
Pages deployment. A failed migration rolls back and blocks deployment. Applied
files are immutable; add a new timestamped SQL file for subsequent changes.

Both trackers share Supabase, and their original migration version numbers
collide. Riftbound therefore tracks its own files in the private
`riftbound_migrations.applied` ledger, leaving Pokemon's CLI history untouched.
The existing idempotent Riftbound schema is applied once to establish this
ledger; it requires the shared `is_collection_editor()` function already used
by the live tracker. The Radiance migration inserts missing rows with zero
quantity and leaves existing card quantities unchanged.

Radiance includes 219 entries from the [official gallery](https://playriftbound.com/en-us/card-gallery/)
plus 94 separate Common/Uncommon foil entries (313 checklist rows). Its backup
and local image manifest support the same read-only outage fallback as other sets.
A set name appears as a fallback if its logo cannot be loaded.

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
