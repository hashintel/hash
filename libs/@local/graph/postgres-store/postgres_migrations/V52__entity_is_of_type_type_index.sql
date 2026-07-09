-- Index for filtering entities by type. The leading `entity_type_ontology_id` lets an
-- equality predicate on the type drive an index scan; the existing
-- `unique_entity_is_of_type` leads with `entity_edition_id` and so only serves the reverse
-- "edition -> types" direction (cache builds, projections). The trailing
-- `entity_edition_id` makes the index covering for the join back to editions.
CREATE INDEX entity_is_of_type_type_lookup
    ON entity_is_of_type (entity_type_ontology_id, entity_edition_id);
