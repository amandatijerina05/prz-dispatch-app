-- Run this in Supabase SQL Editor to add dispatch work ticket line items.

alter table work_tickets
  add column if not exists line_items jsonb not null default '[]'::jsonb;
