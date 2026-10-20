-- INEC-declared results broken down by LGA for concluded elections.
-- election_lga_result_totals: per-LGA registered/accredited/valid/rejected/cast
--   plus the collation officer's incident summary (NULL where not published).
-- election_lga_party_results: one row per party per LGA per election.
-- Only parties whose per-LGA figures were publicly declared get rows; residual
-- minor-party votes are derived at read time as (valid_votes - declared party sum).
BEGIN;

CREATE TABLE IF NOT EXISTS election_lga_result_totals (
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  lga_id INT NOT NULL REFERENCES geo_lgas (id) ON DELETE CASCADE,
  registered_voters INT CHECK (registered_voters >= 0),
  accredited_voters INT CHECK (accredited_voters >= 0),
  valid_votes INT CHECK (valid_votes >= 0),
  rejected_votes INT CHECK (rejected_votes >= 0),
  votes_cast INT CHECK (votes_cast >= 0),
  incidents TEXT,
  PRIMARY KEY (election_id, lga_id)
);

CREATE TABLE IF NOT EXISTS election_lga_party_results (
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  lga_id INT NOT NULL REFERENCES geo_lgas (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES political_parties (id) ON DELETE CASCADE,
  votes INT NOT NULL CHECK (votes >= 0),
  PRIMARY KEY (election_id, lga_id, party_id)
);

COMMIT;
