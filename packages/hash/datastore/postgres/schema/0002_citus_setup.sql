do $$
begin
  if is_citus_enabled() then

    if not is_citus_reference_table('entity_types') then
      perform create_reference_table('entity_types');
    end if;

    if not is_citus_reference_table('entity_type_versions') then
      perform create_reference_table('entity_type_versions');
    end if;

    if not is_citus_reference_table('entity_account') then
      perform create_reference_table('entity_account');
    end if;

    if not is_citus_reference_table('accounts') then
      perform create_reference_table('accounts');
    end if;

    if not is_citus_distributed_table('entities') then
      perform create_distributed_table('entities', 'account_id');
    end if;

    if not is_citus_distributed_table('entity_versions') then
      perform create_distributed_table('entity_versions', 'account_id');
    end if;

    if not is_citus_distributed_table('links') then
      perform create_distributed_table('links', 'source_account_id');
    end if;

    if not is_citus_distributed_table('incoming_links') then
      perform create_distributed_table('incoming_links', 'destination_account_id');
    end if;

  end if;
end$$;
