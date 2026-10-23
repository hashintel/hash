-- An entity UUID identifies an entity across all webs, not only within its web.
CREATE UNIQUE INDEX entity_ids_entity_uuid
    ON entity_ids (entity_uuid);
