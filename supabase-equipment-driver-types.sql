-- Run this once in Supabase SQL Editor before adding the new equipment models.
-- It adds driver equipment-type assignments and updates the equipment type list.

alter table drivers
add column if not exists equipment_types text[] not null default '{}';

alter table drivers
add column if not exists assigned_equipment_ids uuid[] not null default '{}';

alter table equipment
drop constraint if exists equipment_type_check;

alter table equipment
add constraint equipment_type_check
check (type in (
  'Crane',
  'Truck',
  'Trailer',
  'Support',
  'Tractor',
  'Flatbed',
  'Drop Deck',
  'Lowboy',
  'Eagle II',
  'Stepdeck',
  '379',
  'W900',
  'CASCADIA 125',
  'FB STEPDECK',
  'T660',
  'CASCADIA',
  '579',
  '387'
));
