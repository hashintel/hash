UPDATE entity_editions
SET
    provenance = jsonb_set(
        provenance,
        '{actorType}',
        '"user"'::JSONB
    )
WHERE
    provenance ->> 'actorType' = 'human';

UPDATE ontology_temporal_metadata
SET
    provenance = jsonb_set(
        provenance,
        '{actorType}',
        '"user"'::JSONB
    )
WHERE
    provenance ->> 'actorType' = 'human';
