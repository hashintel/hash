 -- Create a new table to hold all possible owners
-- This will either be an account or an account group
CREATE TABLE
  "owners" ("owner_id" UUID PRIMARY KEY);

CREATE TABLE
  account_groups (
    account_group_id UUID PRIMARY KEY REFERENCES owners (owner_id)
  );

-- Add existing accounts to the owners table
INSERT INTO
  "owners" ("owner_id")
SELECT
  account_id
FROM
  accounts;

ALTER TABLE
  accounts
ADD
  FOREIGN KEY (account_id) REFERENCES owners (owner_id);

-- Replace the foreign key on `entity_ids` with a foreign key on `owners`
ALTER TABLE
  entity_ids
DROP
  CONSTRAINT entity_ids_owned_by_id_fkey;

ALTER TABLE
  entity_ids
ADD
  FOREIGN KEY (owned_by_id) REFERENCES owners (owner_id);

-- Replace the foreign key on `ontology_owned_metadata` with a foreign key on `owners`
ALTER TABLE
  ontology_owned_metadata
DROP
  CONSTRAINT ontology_owned_metadata_owned_by_id_fkey;

ALTER TABLE
  ontology_owned_metadata
ADD
  FOREIGN KEY (owned_by_id) REFERENCES owners (owner_id);
