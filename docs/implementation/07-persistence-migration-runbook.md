# Persistence migration adoption

The repository had no Prisma migration history when durable accounting runtime storage was introduced. The first migration, `20261014185343_accounting_runtime`, therefore creates the complete Prisma schema that exists today, including the application's pre-existing tables and the new runtime tables. It is a baseline for a fresh database, not a narrowly additive migration.

## Fresh database

For a new empty database, set `DATABASE_URL` to its SQLite `file:` URL and run:

```sh
bunx prisma migrate deploy
```

The runtime storage tests do this only inside a newly created temporary directory and remove that directory after each test.

## Existing database

Do not run the baseline migration against an existing application database without first checking its schema. It may try to create tables that already exist. Before adopting migrations for an existing installation:

1. Take and verify a restorable database backup.
2. Inspect the live database schema and compare it with `prisma/schema.prisma` and this baseline migration.
3. Resolve any schema drift before recording the baseline as applied.
4. Only when the existing schema is confirmed to match the baseline, mark this migration applied with `prisma migrate resolve --applied 20261014185343_accounting_runtime` using that database's configured URL.
5. Confirm Prisma migration status and exercise a fresh backup restore before deploying later migrations.

Never use `migrate reset` for an existing database. Do not mark the baseline applied merely to silence a migration error: the record is valid only after schema equivalence has been established. Future migrations should be additive and narrowly scoped.

No existing or production database was migrated while generating or testing this baseline.
