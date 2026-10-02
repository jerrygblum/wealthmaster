# Backup and Restore

A persistent Docker volume is not a backup.

Planned production approach:
1. Scheduled `pg_dump` to a NAS backup directory.
2. Back up that directory to a second destination using the NAS backup strategy.
3. Keep application configuration needed for reconstruction.
4. Periodically restore into a disposable environment and verify the application starts and data is correct.

## Restore drill

Before V1, document and execute a full restore after intentionally removing a disposable database instance.

Record:
- backup timestamp;
- restore timestamp;
- commands/process used;
- validation performed;
- issues found.
