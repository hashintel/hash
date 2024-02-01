-- `entity_drafts` contains the draft id for each entity draft. It also acts as a foreign key for the
-- other tables that contain draft data.
CREATE TABLE entity_drafts (
    web_id           UUID NOT NULL,
    entity_uuid      UUID NOT NULL,
    draft_id         UUID PRIMARY KEY,
    FOREIGN KEY (web_id, entity_uuid) REFERENCES entity_ids
);

-- `entity_editions` contains the information if an entity is currently a draft. For these entities we create a new
-- draft id in `entity_drafts`.
INSERT INTO entity_drafts
SELECT web_id, entity_uuid, gen_random_uuid() AS draft_id
FROM entity_editions
NATURAL JOIN entity_temporal_metadata
WHERE draft = true
GROUP BY web_id, entity_uuid;


ALTER TABLE entity_temporal_metadata ADD COLUMN draft_id UUID REFERENCES entity_drafts (draft_id);
-- `entity_editions` is again used to update the `entity_temporal_metadata` with the newly generated draft-id in
-- `entity_drafts`.
UPDATE entity_temporal_metadata
SET draft_id = subquery.draft_id
FROM (
     SELECT entity_edition_id, entity_drafts.draft_id
     FROM entity_drafts
     JOIN entity_temporal_metadata USING (web_id, entity_uuid)
     JOIN entity_editions USING (entity_edition_id)
     WHERE draft = true
) AS subquery
WHERE entity_temporal_metadata.entity_edition_id = subquery.entity_edition_id;

-- The `draft` column in `entity_editions` is not needed anymore.
ALTER TABLE entity_editions DROP COLUMN draft;


ALTER TABLE entity_embeddings ADD COLUMN draft_id UUID REFERENCES entity_drafts (draft_id);
-- `entity_temporal_metadata` is used to update the `entity_embeddings` with the draft-id from `entity_drafts`.
UPDATE entity_embeddings
SET draft_id = subquery.draft_id
FROM (
     SELECT entity_temporal_metadata.web_id, entity_temporal_metadata.entity_uuid, entity_temporal_metadata.draft_id
     FROM entity_embeddings
     JOIN entity_temporal_metadata USING (web_id, entity_uuid)
     WHERE entity_temporal_metadata.transaction_time @> entity_embeddings.updated_at_transaction_time
       AND entity_temporal_metadata.decision_time @> entity_embeddings.updated_at_decision_time
       AND entity_temporal_metadata.draft_id IS NOT NULL
 ) AS subquery
WHERE entity_embeddings.web_id = subquery.web_id
  AND entity_embeddings.entity_uuid = subquery.entity_uuid;
