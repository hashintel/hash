ALTER TABLE entity_editions
    ADD COLUMN edition_archived_by_id UUID references accounts;
