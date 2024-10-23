-- The fields `icon` and `label_property` are moved from columns to the schema.
UPDATE entity_types
   SET schema = jsonb_set(schema, '{icon}', to_jsonb(icon))
   WHERE icon IS NOT NULL;
UPDATE entity_types
    SET schema = jsonb_set(schema, '{labelProperty}', to_jsonb(label_property))
    WHERE label_property IS NOT NULL;

ALTER TABLE entity_types
    DROP COLUMN icon,
    DROP COLUMN label_property;
