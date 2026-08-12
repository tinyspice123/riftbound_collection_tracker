# Service consoles

These management links are safe to bookmark; authentication is handled by each
service.

- [Supabase project dashboard](https://supabase.com/dashboard/project/ekyngjwtoxvkqfalxebm) — database, SQL Editor, Authentication users, logs, and settings.
- [GitHub repository](https://github.com/tinyspice123/riftbound_collection_tracker) — source, commits, backups, and pull requests.
- [GitHub Actions](https://github.com/tinyspice123/riftbound_collection_tracker/actions) — deploys, scheduled backups, maintenance mode, and canary checks.
- [Repository Actions secrets](https://github.com/tinyspice123/riftbound_collection_tracker/settings/secrets/actions) — deployment and analysis secrets. Never commit a Supabase secret key.
- [Renovate pull requests](https://github.com/tinyspice123/riftbound_collection_tracker/pulls?q=is%3Apr%20author%3Aapp%2Frenovate) — dependency and GitHub Action update proposals.
- [SonarCloud project](https://sonarcloud.io/project/overview?id=tinyspice123_riftbound_collection_tracker) — Quality Gate history and code-quality findings. If `SONAR_HOST_URL` points to a self-hosted server, use that server's project page instead.

## Routine checks

After a collection change, run **Backup Supabase collection** from GitHub
Actions and confirm that **Tests / Security / Deploy** succeeds. Review
Renovate pull requests individually; they are not deployed until merged.
