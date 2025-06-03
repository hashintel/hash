ALTER TABLE policy RENAME TO policy_edition;

CREATE TABLE policy (
    id UUID PRIMARY KEY
);
INSERT INTO policy (id) SELECT DISTINCT policy_edition.id FROM policy_edition;

ALTER TABLE policy_action
ADD COLUMN transaction_time TSTZRANGE;

UPDATE policy_action
SET transaction_time = tstzrange(now(), NULL, '[)');

ALTER TABLE policy_action
ALTER COLUMN transaction_time SET NOT NULL,
ADD EXCLUDE USING gist (policy_id WITH =, action_name WITH =, transaction_time WITH &&),
DROP CONSTRAINT policy_action_pkey,
DROP CONSTRAINT policy_action_policy_id_fkey,
ADD CONSTRAINT policy_action_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policy (id) ON DELETE CASCADE;


DROP INDEX policy_unique_name_per_principal_idx;
ALTER TABLE policy_edition ADD COLUMN transaction_time TSTZRANGE;

UPDATE policy_edition
SET transaction_time = tstzrange(now(), NULL, '[)');

ALTER TABLE policy_edition
ADD CONSTRAINT policy_edition_id_fkey FOREIGN KEY (id) REFERENCES policy (id) ON DELETE CASCADE,
DROP CONSTRAINT policy_pkey,
ALTER COLUMN transaction_time SET NOT NULL,
ADD EXCLUDE USING gist (id WITH =, transaction_time WITH &&);
