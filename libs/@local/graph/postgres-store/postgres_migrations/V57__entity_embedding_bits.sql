ALTER TABLE entity_embeddings
    ADD COLUMN embedding_bits bit(3072) NOT NULL
    GENERATED ALWAYS AS (binary_quantize(embedding)::bit(3072)) STORED;

ALTER TABLE entity_type_embeddings
    ADD COLUMN embedding_bits bit(3072) NOT NULL
    GENERATED ALWAYS AS (binary_quantize(embedding)::bit(3072)) STORED;

-- Only the combined per-entity embedding: the per-property rows are a different space.
CREATE INDEX entity_embeddings_hnsw ON entity_embeddings
    USING hnsw (embedding_bits bit_hamming_ops)
    WHERE property IS NULL;
