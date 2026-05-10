-- Remove seeded 2026 Presidential / Senate demo rows (candidates cascade away)
BEGIN;

DELETE FROM elections
WHERE slug IN ('2026-presidential', '2026-senate');

COMMIT;
