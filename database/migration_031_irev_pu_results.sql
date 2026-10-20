-- IReV-transcribed polling-unit results (third-party transcription of public
-- INEC EC8A scans). Adds a provenance column to election_pu_party_votes so
-- imported tallies are never mistaken for NPF field uploads, and a per-PU
-- metadata table holding the scan link, INEC code, anomaly flag and stat fields.
BEGIN;

ALTER TABLE election_pu_party_votes
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'field';

CREATE TABLE IF NOT EXISTS election_pu_result_meta (
  election_id UUID NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  polling_unit_id INT NOT NULL REFERENCES geo_polling_units (id) ON DELETE CASCADE,
  source VARCHAR(16) NOT NULL,
  inec_code VARCHAR(20),
  ec8a_url TEXT,
  anomaly BOOLEAN NOT NULL DEFAULT false,
  registered_voters INT CHECK (registered_voters >= 0),
  accredited_voters INT CHECK (accredited_voters >= 0),
  valid_votes INT CHECK (valid_votes >= 0),
  rejected_votes INT CHECK (rejected_votes >= 0),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (election_id, polling_unit_id, source)
);

COMMIT;
