-- Run this in Supabase SQL Editor to add the Approver role and invoice approval statuses.

alter table app_users
drop constraint if exists app_users_role_check;

update app_users
set role = case lower(trim(role))
  when 'adminrole' then 'admin'
  when 'dispatcherrole' then 'dispatcher'
  when 'driverrole' then 'driver'
  when 'approverrole' then 'approver'
  when 'invoicingrole' then 'invoicing'
  when 'maintenancerole' then 'maintenance'
  else lower(trim(role))
end;

alter table app_users
add constraint app_users_role_check
check (role in ('admin', 'dispatcher', 'driver', 'approver', 'invoicing', 'maintenance'));

alter table work_tickets
drop constraint if exists work_tickets_status_check;

alter table work_tickets
add constraint work_tickets_status_check
check (status in (
  'Sent',
  'Accepted',
  'In Progress',
  'Completed',
  'Out for Signature',
  'PO Stamp',
  'Final Submitted',
  'Paid',
  'Final Approved',
  'Invoiced',
  'Canceled'
));

drop policy if exists "dispatch and billing can read customers" on customers;
drop policy if exists "office users can read customers" on customers;
create policy "dispatch and billing can read customers"
on customers for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'approver', 'invoicing'));

drop policy if exists "operations users can read drivers" on drivers;
create policy "operations users can read drivers"
on drivers for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'approver', 'invoicing'));

drop policy if exists "allowed roles can read equipment" on equipment;
create policy "allowed roles can read equipment"
on equipment for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'approver', 'invoicing', 'maintenance'));

drop policy if exists "role based ticket read" on work_tickets;
create policy "role based ticket read"
on work_tickets for select
to authenticated
using (
  current_app_role() in ('admin', 'dispatcher', 'approver', 'invoicing')
  or (
    current_app_role() = 'driver'
    and driver_id in (select id from drivers where user_id in (select id from app_users where auth_user_id = auth.uid()))
  )
);

drop policy if exists "role based ticket updates" on work_tickets;
create policy "role based ticket updates"
on work_tickets for update
to authenticated
using (
  current_app_role() in ('admin', 'dispatcher', 'approver', 'invoicing')
  or (
    current_app_role() = 'driver'
    and driver_id in (select id from drivers where user_id in (select id from app_users where auth_user_id = auth.uid()))
  )
)
with check (
  current_app_role() in ('admin', 'dispatcher', 'approver', 'invoicing')
  or (
    current_app_role() = 'driver'
    and driver_id in (select id from drivers where user_id in (select id from app_users where auth_user_id = auth.uid()))
  )
);

drop policy if exists "allowed roles can read attachments" on ticket_attachments;
drop policy if exists "authenticated users can read ticket files" on ticket_attachments;
create policy "allowed roles can read attachments"
on ticket_attachments for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'approver', 'invoicing'));

drop policy if exists "authenticated users can read status history" on ticket_status_history;
create policy "authenticated users can read status history"
on ticket_status_history for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'approver', 'invoicing'));

drop policy if exists "authenticated users can add status history" on ticket_status_history;
create policy "authenticated users can add status history"
on ticket_status_history for insert
to authenticated
with check (current_app_role() in ('admin', 'dispatcher', 'driver', 'approver', 'invoicing'));
