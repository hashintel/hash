CREATE EXTENSION
  IF NOT EXISTS "btree_gist";

CREATE EXTENSION
  citus;

CREATE TABLE IF NOT EXISTS
  "accounts" ("account_id" UUID PRIMARY KEY);

CREATE
OR REPLACE FUNCTION is_citus_enabled () RETURNS BOOLEAN AS $$ begin
  perform 1 from pg_extension where extname='citus';
  return found;
end $$ LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION is_citus_reference_table (table_name TEXT) RETURNS BOOLEAN AS $$ begin
  perform 1 from citus_tables where
    citus_tables.table_name = $1::regclass
    and citus_table_type = 'reference';
  return found;
end $$ LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION is_citus_distributed_table (table_name TEXT) RETURNS BOOLEAN AS $$ begin
  perform 1 from citus_tables where
    citus_tables.table_name = $1::regclass
    and citus_table_type = 'distributed';
  return found;
end $$ LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION create_fk_if_not_exists (
  constraint_name TEXT,
  from_table TEXT,
  from_columns TEXT,
  to_table TEXT,
  to_columns TEXT
) RETURNS void AS $$ begin
  perform 1 from pg_constraint where conname = constraint_name;
  if not found then
    execute format('alter table %s add constraint %s foreign key %s references %s %s deferrable', from_table, constraint_name, from_columns, to_table, to_columns);
  end if;
end $$ LANGUAGE plpgsql;
