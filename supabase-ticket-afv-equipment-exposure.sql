-- Run this in Supabase SQL Editor to add AFV/PO, multiple equipment, and exposure hour fields.

alter table work_tickets
  add column if not exists equipment_ids uuid[] not null default '{}',
  add column if not exists afv_po_number text not null default '',
  add column if not exists exposure_hours numeric(8,2);

update work_tickets
set equipment_ids = array[equipment_id]
where equipment_id is not null
  and cardinality(equipment_ids) = 0;
