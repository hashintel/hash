CREATE INDEX entity_has_left_entity_source_idx
    ON entity_has_left_entity(web_id, entity_uuid);
CREATE INDEX entity_has_right_entity_source_idx
    ON entity_has_right_entity(web_id, entity_uuid);
