-- FK from entity_versions --> entities
select create_fk_if_not_exists(
  'entity_versions_account_id_entity_id_fk',   --constraint_name
  'entity_versions',                           --from_table
  '(account_id, entity_id)',                   --from_columns
  'entities',                                  --to_table
  '(account_id, entity_id)'                    --to_columns
);

-- FK from incoming_links --> entity_versions
select create_fk_if_not_exists(
  'incoming_links_destination_account_id_destination_entity_id_fk',   --constraint_name
  'incoming_links',                                                   --from_table
  '(destination_account_id, destination_entity_id)',                  --from_columns
  'entities',                                                         --to_table
  '(account_id, entity_id)'                                           --to_columns
);

-- FK from incoming_links --> links on the parent entity. We cannot create this
-- if Citus is enabled because parent_account_id is not a distribution column.
do $$ begin
  if not is_citus_enabled() then
    perform create_fk_if_not_exists(
      'incoming_links_source_account_id_link_id_fk',    --constraint_name
      'incoming_links',                                 --from_table
      '(source_account_id, link_id)',                   --from_columns
      'links',                                          --to_table
      '(source_account_id, link_id)'                    --to_columns
    );
  end if;
end; $$;

-- FK from entity_account --> entity_versions. We cannot create this if Citus is enabled
-- because entity_account is a reference table and entity_versions is a distributed table.
do $$ begin
  if not is_citus_enabled() then
    perform create_fk_if_not_exists(
      'entity_account_account_id_entity_version_id_fk',   --constraint_name
      'entity_account',                                   --from_table
      '(account_id, entity_version_id)',                  --from_columns
      'entity_versions',                                  --to_table
      '(account_id, entity_version_id)'                   --to_columns
    );
  end if;
end; $$;

-- FK from verification_codes --> entities. We cannot create this if Citus is enabled
-- because verification_codes is local and entities is distributed.
do $$ begin
  if not is_citus_enabled() then
    perform create_fk_if_not_exists(
      'verification_codes_account_id_user_id_fk',   --constraint_name
      'verification_codes',                         --from_table
      '(account_id, user_id)',                      --from_columns
      'entities',                                   --to_table
      '(account_id, entity_id)'                     --to_columns
    );
  end if;
end; $$;
