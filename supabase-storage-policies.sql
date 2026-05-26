drop policy if exists "authenticated users can read PRZ storage objects" on storage.objects;
create policy "authenticated users can read PRZ storage objects"
on storage.objects for select
to authenticated
using (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures'));

drop policy if exists "authenticated users can upload PRZ storage objects" on storage.objects;
create policy "authenticated users can upload PRZ storage objects"
on storage.objects for insert
to authenticated
with check (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures'));

drop policy if exists "authenticated users can update PRZ storage objects" on storage.objects;
create policy "authenticated users can update PRZ storage objects"
on storage.objects for update
to authenticated
using (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures'))
with check (bucket_id in ('ticket-attachments', 'driver-attachments', 'signatures'));
