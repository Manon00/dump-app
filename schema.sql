-- schema.sql : création des tables (idempotent)

create table if not exists dumps (
  id bigserial primary key,
  text text not null,
  cat text not null,
  tags text[] not null default '{}',
  created_on date not null default current_date
);

create table if not exists categories (
  name text primary key,
  color text not null
);

create table if not exists tags (
  name text primary key
);

insert into categories (name, color) values
  ('book', '#f6b98a'),
  ('art', '#f4a9c0'),
  ('game', '#8fd6d9'),
  ('magazine', '#c9a18a')
on conflict (name) do nothing;

insert into tags (name) values
  ('funny'), ('political'), ('cute'), ('lovely'), ('girly'), ('art')
on conflict (name) do nothing;