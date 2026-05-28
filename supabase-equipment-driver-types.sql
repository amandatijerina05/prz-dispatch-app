-- Run this in Supabase SQL Editor to support driver unit assignments.
-- Equipment types are managed in the app, so the database should not keep
-- an old fixed allow-list that blocks newly added types like Gooseneck FB.

alter table drivers
add column if not exists equipment_types text[] not null default '{}';

alter table drivers
add column if not exists assigned_equipment_ids uuid[] not null default '{}';

alter table equipment
drop constraint if exists equipment_type_check;
