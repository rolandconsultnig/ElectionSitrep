-- Collated votes per party per polling unit (uploaded from field; aggregated for IGP dashboards)
BEGIN;

CREATE TABLE IF NOT EXISTS election_pu_party_votes (
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  polling_unit_id INT NOT NULL REFERENCES geo_polling_units (id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES political_parties (id) ON DELETE CASCADE,
  votes INT NOT NULL CHECK (votes >= 0),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (election_id, polling_unit_id, party_id)
);

CREATE INDEX IF NOT EXISTS idx_eppv_election ON election_pu_party_votes (election_id);
CREATE INDEX IF NOT EXISTS idx_eppv_updated ON election_pu_party_votes (election_id, updated_at DESC);

COMMIT;
