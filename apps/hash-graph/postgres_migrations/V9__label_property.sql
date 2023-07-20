ALTER TABLE
  entity_types
ADD COLUMN
  "label_property" TEXT REFERENCES "base_urls";
