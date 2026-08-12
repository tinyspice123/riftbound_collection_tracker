# Recovery runbook

This runbook covers the most likely production failures. It assumes repository
access and permission to run GitHub Actions deployments.

## Put the site into maintenance mode

1. Open **GitHub → Actions → Toggle maintenance mode → Run workflow**.
2. Select `enable` and run it from `main`.
3. Verify the Pages URL and a direct tracker URL show the maintenance screen.

Run the same workflow with `disable` to restore the site. A successful normal
deployment also replaces maintenance mode.

## Roll back a bad release

1. Find the last known-good commit in **Actions → Tests / Security / Deploy**.
2. Revert the bad commit with a new commit; do not rewrite or force-push `main`.
3. Push the revert and wait for site, browser, and SonarQube checks to pass.
4. Confirm the deployment smoke test, home page, and one tracker page.

If the normal pipeline cannot run, enable maintenance mode while diagnosing it.

## Restore collection data

Supabase is the live source. Versioned CSV recovery snapshots are stored under
`backups/<set-id>.csv` by the daily **Backup Supabase collection** workflow.

1. Identify the last good CSV with Git history and download that revision.
2. Restore its rows into Supabase's `public.riftbound_card_main` table with the Table
   Editor, CSV import, or reviewed SQL. Preserve its `set_id`.
3. Run **Backup Supabase collection** manually.
4. Confirm validation passes and check the restored set on the site.

Never import one set's CSV under a different `set_id`.

## Respond to a Supabase outage

1. Open the [Supabase dashboard](SERVICES.md) and check project status and API
   logs.
2. The deployed tracker automatically reads its matching CSV snapshot and is
   read-only while Supabase is unavailable.
3. Do not edit fallback CSVs as a substitute for the database. Apply changes
   after recovery, then run **Backup Supabase collection**.
4. Confirm live data and the signed-in quantity controls work before closing the
   incident.

## Repair missing or incorrect images

1. Check the Card, Number, and Variant text against
   `public/img/<set-id>/manifest.txt`.
2. Correct the Supabase `image_url`, then run:

   ```bash
   python scripts/backup_supabase.py
   python scripts/download_card_images.py <set-id>
   ```

3. Run `python scripts/validate_data.py`, commit the image and manifest changes,
   and verify the affected card after deployment.

## Clear a stale browser release

Close tracker tabs and reopen the site. If needed, remove that site's stored
data/service worker in browser developer tools and reload. This is limited to
the affected browser; it is not a server-side rollback.

## Final recovery checks

- The home page, tracker, manifest, and service worker return successfully.
- A configured Supabase set loads and progress totals appear.
- One exact promo or variant override displays its local image.
- Missing, owned, and spares exports work.
- The latest deployment, production canary, and scheduled backup are green.
