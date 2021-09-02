-- FK from entity_versions --> entities
select create_fk_if_not_exists(
  'entity_versions_account_id_entity_id_fkey', --constraint_name
  'entity_versions',                           --from_table
  '(account_id, entity_id)',                   --from_columns
  'entities',                                  --to_table
  '(account_id, entity_id)'                    --to_columns
);

-- FK from outgoing_links --> entity_versions
select create_fk_if_not_exists(
  'outgoing_links_account_id_entity_version_id_fkey', --constraint_name
  'outgoing_links',                                   --from_table
  '(account_id, entity_version_id)',                  --from_columns
  'entity_versions',                                  --to_table
  '(account_id, entity_version_id)'                   --to_columns
);

-- FK from outgoing_links --> entity_versions on the parent entity. We cannot create this
-- if Citus is enabled because child_account_id is not a distribution column.
do $$ begin
  if not is_citus_enabled() then
    perform create_fk_if_not_exists(
      'outgoing_links_child_account_id_child_version_id_fkey', --constraint_name
      'outgoing_links',                                        --from_table
      '(child_account_id, child_version_id)',                  --from_columns
      'entity_versions',                                       --to_table
      '(account_id, entity_version_id)'                        --to_columns
    );
  end if;
end; $$;

-- FK from incoming_links --> entity_versions
select create_fk_if_not_exists(
  'incoming_links_account_id_entity_version_id_fkey', --constraint_name
  'incoming_links',                                   --from_table
  '(account_id, entity_version_id)',                  --from_columns
  'entity_versions',                                  --to_table
  '(account_id, entity_version_id)'                   --to_columns
);

-- FK from incoming_links --> entity_versions on the parent entity. We cannot create this
-- if Citus is enabled because parent_account_id is not a distribution column.
do $$ begin
  if not is_citus_enabled() then
    perform create_fk_if_not_exists(
      'incoming_links_parent_account_id_parent_version_id_fkey', --constraint_name
      'incoming_links',                                          --from_table
      '(parent_account_id, parent_version_id)',                  --from_columns
      'entity_versions',                                         --to_table
      '(account_id, entity_version_id)'                          --to_columns
    );
  end if;
end; $$;

-- FK from entity_account --> entity_versions. We cannot create this if Citus is enabled
-- because entity_account is a reference table and entity_versions is a distributed table.
do $$ begin
  if not is_citus_enabled() then
    perform create_fk_if_not_exists(
      'entity_account_account_id_entity_version_id_fkey', --constraint_name
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
      'verification_codes_account_id_user_id_fkey', --constraint_name
      'verification_codes',                         --from_table
      '(account_id, user_id)',                      --from_columns
      'entities',                                   --to_table
      '(account_id, entity_id)'                     --to_columns
    );
  end if;
end; $$;
