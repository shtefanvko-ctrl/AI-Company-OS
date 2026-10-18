# Memory approval concurrency — 2026-10-16

## Context and priority

P2 verification gap, not a claimed runtime defect: sequential approval replays cannot prove concurrent ledger arbitration. Continue PR #11 from `acf58c8d67dc921f82467e3531bd6095585c18a4`, base PR #10 `8cf425287898fccfba840eafab4b073c12ddbd0a`. Main is `807ee7a694177cece9b833b27aa667e2524e4c7f`; its new commit changes AGENTS.md communication guidance only. PR #12 skill files are untouched.

ADR-001 and ADR-002 are accepted. Stage 0 audit exists at `docs/STAGE0_GAP_AUDIT_v8_17_to_v9.md`; manifest exists at `project_manifest_r3.json`. They describe a historical kernel baseline, not proof of current platform readiness. Production identity, managed secrets, background-job isolation and backup/restore remain open.

## Change and acceptance

The PostgreSQL HTTP test locks the private verification ledger in SHARE mode in the disposable CI database. Six authenticated requests (three per organization) must be observed waiting at the SQL boundary before release. Each tenant must return one new approval and two duplicates, all with its own memory ID and revision 2. The database must contain one verified evidence, one approval audit and one ledger row per memory. No runtime, migration, dependency or authorization contract is changed.

## Verification and limitations

Commands: `npm test`, `node --check platform/test/postgres-http.test.mjs`, `git diff --check`. PostgreSQL migration, tenant/Memory RLS and `npm run test:postgres` run only in GitHub Actions. Final SHA and CI results are recorded in the PR conversation after completion; pending checks mean UNVERIFIED.

Coverage/lint/browser E2E tooling is not configured; N/A for this test-only increment. Production PostgreSQL, deployments, merge and background-job runtime: NOT RUN. This scenario proves identical-key approval concurrency, not every conflict or concurrent authorization-revocation race.

## Risk, rollback and next step

Risk is limited to the test harness; the barrier has a bounded wait and is released in finally before requests are drained. Rollback: revert this test/documentation commit; no schema or data rollback. Next priority is human review of the open stack, followed by remaining Stage 1 identity/job/backup requirements.
