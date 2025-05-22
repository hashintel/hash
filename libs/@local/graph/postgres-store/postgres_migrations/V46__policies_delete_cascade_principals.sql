ALTER TABLE policy
DROP CONSTRAINT policy_principal_id_principal_type_fkey;

ALTER TABLE policy
ADD CONSTRAINT policy_principal_id_principal_type_fkey
FOREIGN KEY (principal_id, principal_type) REFERENCES principal (id, principal_type) ON DELETE CASCADE;
