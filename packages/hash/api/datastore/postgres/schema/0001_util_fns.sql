/** Checks if Citus is enabled on the database */
create or replace function is_citus_enabled() returns boolean
as $$ begin
  perform 1 from pg_extension where extname='citus';
  return found;
end $$ language plpgsql;


/** Checks if a table is a Citus reference table **/
create or replace function is_citus_reference_table(table_name text) returns boolean
as $$ begin
  perform 1 from citus_tables where
    citus_tables.table_name = $1::regclass
    and citus_table_type = 'reference';
  return found;
end $$ language plpgsql;


/** Checks if a table is a Citus cistributed table **/
create or replace function is_citus_distributed_table(table_name text) returns boolean
as $$ begin
  perform 1 from citus_tables where
    citus_tables.table_name = $1::regclass
    and citus_table_type = 'distributed';
  return found;
end $$ language plpgsql;


/** Create a foreign key reference if it does not already exist **/
create or replace function create_fk_if_not_exists(
  constraint_name text,
  from_table text,
  from_columns text,
  to_table text,
  to_columns text
) returns void
as $$ begin
  perform 1 from pg_constraint where conname = constraint_name;
  if not found then
    execute format('alter table %s add constraint %s foreign key %s references %s %s deferrable', from_table, constraint_name, from_columns, to_table, to_columns);
  end if;
end $$ language plpgsql;
