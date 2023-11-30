ALTER TABLE "entity_editions" ADD COLUMN "draft" BOOLEAN;
UPDATE "entity_editions" SET "draft" = FALSE WHERE TRUE;
ALTER TABLE "entity_editions" ALTER COLUMN "draft" SET NOT NULL;
