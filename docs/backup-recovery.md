# Encrypted backups and recovery

The production database image includes pinned PostgreSQL 17 and pgBackRest 2.59.1. PostgreSQL archives completed WAL segments continuously; a 60-second archive timeout bounds idle segment rotation when writes occur. Weekly full and daily differential backups use an encrypted repository with a 30-day recovery window. pgBackRest may retain an older full backup needed to cover that window, so 30 days is not an exact maximum erasure date. Avoid an independent object-store expiry policy that deletes required WAL or backup chains. These mechanisms follow the [pgBackRest guide](https://pgbackrest.org/user-guide.html) and [retention configuration](https://pgbackrest.org/configuration.html#section-repository/option-repo-retention-full-type).

## Provision a new environment

Build with `pnpm backup:build`, publish the resulting image to the operator's registry, and set `POSTGRES_IMAGE` to its immutable release digest. This image is based on Debian Bookworm. Create new staging/production databases with it; an existing Alpine database needs a separately reviewed collation/migration procedure before changing the runtime beneath its volume. The application migration history is unchanged by this image.

Create a dedicated off-host S3-compatible bucket and separate prefix for each environment. Copy `infrastructure/postgres/pgbackrest.conf.example` to the private `SECRETS_DIR/pgbackrest.conf`, mode 0600, and replace every placeholder with approved bucket, endpoint, region, access credentials and a generated encryption passphrase. The bucket must already exist. Keep a protected recovery copy of the encryption key separate from the repository and lost-host scenario. Replacing the passphrase does not re-encrypt an existing repository; preserve the keys needed to read historical backups. Never commit this configuration or print resolved Compose settings.

The image refuses to start without the private config mount and copies it to a postgres-owned 0600 file. The ordinary application images receive no backup credentials. Start the database, run application migrations, then initialize and verify the repository **before opening production writes**:

```sh
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml up -d postgres
docker compose --env-file /srv/3bont/release.env -f infrastructure/production.compose.yml --profile operations run --rm migrate
node scripts/backup-operations.mjs init /srv/3bont/release.env
node scripts/backup-operations.mjs check /srv/3bont/release.env
node scripts/backup-operations.mjs full /srv/3bont/release.env
node scripts/backup-operations.mjs status /srv/3bont/release.env
```

Stop on any failure. `status` forces an archive check before inspecting backup evidence. It exits nonzero for invalid/unhealthy/unencrypted repositories, a missing full backup, future metadata or no backup within 26 hours. It does not contact API-Football. Verify TLS and least-privilege repository access using the actual service before accepting the deployment.

## Scheduling and monitoring

The checked-in systemd templates assume the reviewed checkout at `/srv/3bont/current`, non-secret release settings at `/srv/3bont/release.env` and Node 24 at `/usr/bin/node`. Adjust those exact paths for the selected host before installation. The full timer runs Sunday at 01:00 UTC; differential backups run Monday–Saturday at 01:00 UTC. Both catch up after downtime. The status timer runs every five minutes. pgBackRest protects overlapping operations with its own repository locks; investigate failed units rather than deleting those locks.

Install the reviewed units on the named host and enable `3bont-backup-full.timer`, `3bont-backup-diff.timer` and `3bont-backup-status.timer`. Connect failed units and missing check-ins to the operator's external alert system. A timer running on the database host cannot notify you if that host disappears. Archive failures preserve unarchived WAL, which can fill the disk: external disk/host monitoring and a tested alert destination remain deployment requirements. No alert recipient or paid backup service is assumed by these files.

`verify` checks repository contents; `expire-preview` shows retention candidates without deleting them. Successful backups perform normal pgBackRest expiry. Record repository usage and retention evidence. Operator privacy terms must account for the full recovery window and the full backup retained to anchor it.

## Lost-host or point-in-time restoration

1. Isolate a replacement host and keep web, workers, mail and provider automation stopped. Recover the recorded release images, repository credentials and matching encryption key through the operator's recovery process.
2. Create a new empty database volume and make its directory owned by the image's postgres user. Mount the reviewed private pgBackRest config and repository access. Do not initialize a new PostgreSQL cluster in the restore destination and do not overwrite a running database volume.
3. Inspect `pgbackrest --stanza=fantasy --output=json info`, select the backup and target, and record both in the incident. Run the same image with `pgbackrest --stanza=fantasy --set=BACKUP_LABEL --type=time --target=UTC_INSTANT --target-action=promote --archive-mode=off restore`. For latest recoverable state, use the documented default recovery mode after verifying the intended repository timeline. Do not guess a time after missing WAL.
4. Start the restored database on an isolated network. Verify recovery reached its target and `pg_is_in_recovery()` is false. The application readiness check now rejects read-only/recovering databases even when migration tables are readable. A wrong key, missing archive or unfinished target must not lead to an empty application or an initialized replacement database.
5. Validate migration checksums, participant snapshots, entry/result totals and retained correction/award history against the chosen target. Run the compatible worker image's `dist/provider-restore-pause.js` before starting any provider worker. Reconcile actual provider usage because the backup can predate already-spent requests. Review queued mail and external prize fulfillment before resuming effects.
6. Configure a reviewed backup destination for the restored primary, re-enable archiving, take and check a fresh backup, restore monitoring, then reopen application writes. Retain incident evidence and compatible previous images. Never delete ledger/audit history to make an older release run.

The [official restore workflow](https://pgbackrest.org/user-guide.html#restore) describes named/time targets and backup selection. A concrete host-specific restore command must use its confirmed volume, secret directory, repository and release; this document intentionally cannot supply those missing deployment identifiers.

## Executable local rehearsal

Run `pnpm backup:build` then `pnpm test:recovery`. The runner creates labelled, disposable volumes and credentials without loading `.env.local`, migrates the complete schema and seeds published synthetic competition results. It backs up to a separate encrypted volume, writes a WAL-only transaction and a named recovery point, then writes an excluded later transaction. After removing the original database volume, it rejects a wrong key and a repository missing target WAL, then restores the selected target into an empty volume. It verifies exact result checksums, migration readiness and provider pause, then removes its resources. The source-bound outcome is recorded in `artifacts/verification/recovery-proof.json`.

This tests encryption, archive recovery and application consistency locally. It does not prove off-host credentials/network access, target-host failure alerting, production dataset recovery time, or the 15-minute RPO/4-hour RTO under the selected hardware. R07/R08/R10 stay open until those dated environment-specific drills pass.
