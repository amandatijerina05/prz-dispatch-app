-- Run this in Supabase SQL Editor to add dispatch Sales Person and Ordered By fields.

alter table work_tickets
  add column if not exists sales_person text not null default '',
  add column if not exists ordered_by text not null default '';
