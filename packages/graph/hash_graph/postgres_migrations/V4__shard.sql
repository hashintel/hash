DO
  $$
begin
  if is_citus_enabled() then
    -- Base
    if not is_citus_reference_table('accounts') then
      perform create_reference_table('accounts');
    end if;

    -- Ontology tables (reference tables)
    if not is_citus_reference_table('type_ids') then
      perform create_reference_table('type_ids');
    end if;

    if not is_citus_reference_table('data_types') then
      perform create_reference_table('data_types');
    end if;

    if not is_citus_reference_table('property_types') then
      perform create_reference_table('property_types');
    end if;

    if not is_citus_reference_table('entity_types') then
      perform create_reference_table('entity_types');
    end if;


    if not is_citus_reference_table('property_type_property_type_references') then
      perform create_reference_table('property_type_property_type_references');
    end if;

    if not is_citus_reference_table('property_type_data_type_references') then
      perform create_reference_table('property_type_data_type_references');
    end if;

    if not is_citus_reference_table('entity_type_property_type_references') then
      perform create_reference_table('entity_type_property_type_references');
    end if;

    if not is_citus_reference_table('entity_type_entity_type_references') then
      perform create_reference_table('entity_type_entity_type_references');
    end if;


    -- Knowledge tables
    if not is_citus_distributed_table('entity_ids') then
      perform create_distributed_table('entity_ids', 'owned_by_id');
    end if;

    if not is_citus_distributed_table('entity_editions') then
      perform create_distributed_table('entity_editions', 'owned_by_id');
    end if;

    if not is_citus_distributed_table('entity_versions') then
      perform create_distributed_table('entity_versions', 'owned_by_id');
    end if;

  end if;
end$$;

-- Add self-referential foreign keys
-- This is done after creating Citus distributed tables to avoid issues.
-- https://stackoverflow.com/questions/74658829/cannot-create-distributed-table-with-foreign-key-on-citus-11-1
-- ALTER TABLE
--   entity_ids
-- ADD
--   CONSTRAINT entity_ids_left_entity_uuid_fkey FOREIGN KEY (left_owned_by_id, left_entity_uuid) REFERENCES entity_ids;
-- ALTER TABLE
--   entity_ids
-- ADD
--   CONSTRAINT entity_ids_right_entity_uuid_fkey FOREIGN KEY (right_owned_by_id, right_entity_uuid) REFERENCES entity_ids;
