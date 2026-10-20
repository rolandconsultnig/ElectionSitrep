-- Official INEC-declared results storage for concluded elections.
-- election_official_party_results: one row per party per election (state-level declared totals).
-- elections.official_totals: registered/accredited/valid/rejected/cast + declaration metadata.
BEGIN;

CREATE TABLE IF NOT EXISTS election_official_party_results (
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES political_parties (id) ON DELETE CASCADE,
  votes INT NOT NULL CHECK (votes >= 0),
  PRIMARY KEY (election_id, party_id)
);

ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS official_totals JSONB;

COMMIT;
