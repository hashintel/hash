create extension citus;

create schema config;

create table config.hdev_config (
  key   text primary key,
  value jsonb
);

insert into config.hdev_config (key, value) values ('citus', '{"enabled": true}');
