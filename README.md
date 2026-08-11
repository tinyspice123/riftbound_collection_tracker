# Riftbound Collection Tracker

A static, mobile-friendly Riftbound TCG collection checklist for GitHub Pages.
It reuses the proven filtering, quantity tracking, exports, and offline support
from the Pokémon tracker while keeping its data and deployment separate.

## Current status

The application includes separate pages for Origins, Spiritforged, Unleashed,
and Vendetta. Each page reads its matching tab from the published Google Sheet;
an empty local CSV remains as an outage fallback until real backups are added.

## Run locally

```bash
npm ci
npm test
npx http-server public
```

## Connect the card sheet

The published document URL and all four tab IDs are configured in
`public/sets.js`. Add card rows beneath the existing headers in Google Sheets;
the deployed tracker will pick up changes without a code deployment. Run
`npm test` after changing the registry itself.

Supported columns are Group, Card, Number, Variant / Stamp, Source, Status,
Price, Have, and Image URL. Images may be supplied directly in the sheet.

## Local card images

Download the official-gallery image URLs stored in the latest sheet backups as
compressed 600px WebP files and create runtime manifests with:

```bash
python scripts/download_card_images.py
```

The tracker prefers these committed local images and retains each sheet image
URL as a network fallback. Re-running the command skips existing valid files.
Run it for selected sets by appending their IDs, for example:

```bash
python scripts/download_card_images.py origins vendetta
```

Run `python scripts/backup_sheets.py` first whenever image URLs or card rows
have changed in Google Sheets.

## Daily collection backups

`.github/workflows/backup.yml` downloads and validates all four published tabs
daily at 09:00 UTC. Changed CSVs are committed under `backups/` and mirrored to
`public/data/` as deployed outage fallbacks. A changed backup explicitly starts
the normal test-and-deploy workflow because GitHub does not recursively trigger
workflows from commits made with its built-in token.

The main pipeline mirrors the Pokémon tracker: static and JavaScript coverage,
Python validation and coverage, desktop/mobile browser tests, SonarQube Quality
Gate, Pages packaging, deployment smoke tests, maintenance mode, and a weekly
production dependency canary.

Run the same operation locally with:

```bash
python scripts/backup_sheets.py
```

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests pushes to `main` and
deploys `public/`. In repository **Settings → Pages**, choose **GitHub Actions**
as the source. The resulting URL is:

`https://tinyspice123.github.io/riftbound_collection_tracker/`

This is a fan-made tool and is not affiliated with Riot Games.
