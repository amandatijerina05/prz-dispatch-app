-- Run this in Supabase SQL Editor to add maintenance proof photos/documents.

insert into storage.buckets (id, name, public)
values ('maintenance-attachments', 'maintenance-attachments', false)
on conflict (id) do nothing;

alter table maintenance_records
  add column if not exists proof_files text[] not null default '{}';

drop policy if exists "authenticated users can read PRZ storage objects" on storage.objects;
create policy "authenticated users can read PRZ storage objects"
on storage.objects for select
to authenticated
using (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures', 'maintenance-attachments'));

drop policy if exists "authenticated users can upload PRZ storage objects" on storage.objects;
create policy "authenticated users can upload PRZ storage objects"
on storage.objects for insert
to authenticated
with check (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures', 'maintenance-attachments'));

drop policy if exists "authenticated users can update PRZ storage objects" on storage.objects;
create policy "authenticated users can update PRZ storage objects"
on storage.objects for update
to authenticated
using (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures', 'maintenance-attachments'))
with check (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures', 'maintenance-attachments'));
