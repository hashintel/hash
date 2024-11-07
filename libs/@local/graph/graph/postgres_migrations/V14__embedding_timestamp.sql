ALTER TABLE "entity_embeddings"
    ADD COLUMN "updated_at_decision_time" TIMESTAMP WITH TIME ZONE NOT NULL,
    ADD COLUMN "updated_at_transaction_time" TIMESTAMP WITH TIME ZONE NOT NULL;

ALTER TABLE "entity_type_embeddings"
    ADD COLUMN "updated_at_transaction_time" TIMESTAMP WITH TIME ZONE NOT NULL;

ALTER TABLE "property_type_embeddings"
    ADD COLUMN "updated_at_transaction_time" TIMESTAMP WITH TIME ZONE NOT NULL;

ALTER TABLE "data_type_embeddings"
    ADD COLUMN "updated_at_transaction_time" TIMESTAMP WITH TIME ZONE NOT NULL;
