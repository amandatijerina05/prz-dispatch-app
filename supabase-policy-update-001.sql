drop policy if exists "allowed roles can read equipment" on equipment;
create policy "allowed roles can read equipment"
on equipment for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing', 'maintenance'));

drop policy if exists "office users can read customers" on customers;
create policy "office users can read customers"
on customers for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing'));
