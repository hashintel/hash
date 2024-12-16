CREATE INDEX entity_has_left_entity_target_idx
ON entity_has_left_entity (left_web_id, left_entity_uuid);
CREATE INDEX entity_has_right_entity_target_idx
ON entity_has_right_entity (right_web_id, right_entity_uuid);
