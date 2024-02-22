DELETE FROM "entity_embeddings" WHERE TRUE;
DELETE FROM "entity_type_embeddings" WHERE TRUE;
DELETE FROM "property_type_embeddings" WHERE TRUE;
DELETE FROM "data_type_embeddings" WHERE TRUE;

ALTER TABLE "entity_embeddings" ALTER COLUMN embedding TYPE vector(3072);
ALTER TABLE "entity_type_embeddings" ALTER COLUMN embedding TYPE vector(3072);
ALTER TABLE "property_type_embeddings" ALTER COLUMN embedding TYPE vector(3072);
ALTER TABLE "data_type_embeddings" ALTER COLUMN embedding TYPE vector(3072);
