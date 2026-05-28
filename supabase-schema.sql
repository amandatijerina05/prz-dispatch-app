create extension if not exists "pgcrypto";

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  username text unique not null,
  role text not null check (role in ('admin', 'dispatcher', 'driver', 'invoicing', 'maintenance')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  name text not null,
  phone text not null,
  equipment_types text[] not null default '{}',
  assigned_equipment_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('Crane', 'Truck', 'Trailer', 'Support', 'Tractor', 'Flatbed', 'Drop Deck', 'Lowboy', 'Eagle II', 'Stepdeck', '379', 'W900', 'CASCADIA 125', 'FB STEPDECK', 'T660', 'CASCADIA', '579', '387')),
  status text not null default 'Available' check (status in ('Available', 'Assigned', 'Maintenance', 'Out of Service')),
  certification_due date,
  next_service_due date,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  billing_terms text,
  default_site text,
  instructions text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists work_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null,
  customer_id uuid not null references customers(id),
  driver_id uuid references drivers(id),
  equipment_id uuid references equipment(id),
  job_date date not null,
  job_site text not null,
  service_type text not null,
  priority text not null check (priority in ('Standard', 'High', 'Emergency')),
  scheduled_start time not null,
  estimated_hours numeric(8,2) not null check (estimated_hours > 0),
  base_rate numeric(10,2) not null check (base_rate >= 0),
  mileage numeric(10,2) not null default 0 check (mileage >= 0),
  fuel_surcharge numeric(10,2) not null default 0 check (fuel_surcharge >= 0),
  minimum_charge numeric(10,2) not null default 0 check (minimum_charge >= 0),
  overtime_hours numeric(8,2) not null default 0 check (overtime_hours >= 0),
  work_instructions text not null,
  status text not null default 'Sent' check (status in ('Sent', 'Accepted', 'In Progress', 'Completed', 'Invoiced', 'Canceled')),
  actual_start time,
  actual_end time,
  driver_notes text,
  signer_name text,
  customer_signature_path text,
  completed_at timestamptz,
  invoiced_at timestamptz,
  canceled_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references work_tickets(id) on delete cascade,
  uploaded_by uuid references app_users(id),
  file_name text not null,
  file_path text not null,
  file_type text not null default 'dispatch',
  created_at timestamptz not null default now()
);

create table if not exists ticket_status_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references work_tickets(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references app_users(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists maintenance_records (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  task text not null,
  due_date date not null,
  status text not null default 'Scheduled' check (status in ('Scheduled', 'Due Soon', 'Overdue', 'Complete')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_users_updated_at on app_users;
create trigger set_app_users_updated_at
before update on app_users
for each row execute function set_updated_at();

drop trigger if exists set_work_tickets_updated_at on work_tickets;
create trigger set_work_tickets_updated_at
before update on work_tickets
for each row execute function set_updated_at();

alter table app_users enable row level security;
alter table drivers enable row level security;
alter table equipment enable row level security;
alter table customers enable row level security;
alter table work_tickets enable row level security;
alter table ticket_attachments enable row level security;
alter table ticket_status_history enable row level security;
alter table maintenance_records enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

create or replace function current_app_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from app_users where auth_user_id = auth.uid() and active = true limit 1;
$$;

create policy "authenticated users can read active app users"
on app_users for select
to authenticated
using (active = true);

create policy "admins can manage app users"
on app_users for all
to authenticated
using (current_app_role() = 'admin')
with check (current_app_role() = 'admin');

create policy "operations users can read drivers"
on drivers for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing'));

create policy "admins can manage drivers"
on drivers for all
to authenticated
using (current_app_role() = 'admin')
with check (current_app_role() = 'admin');

create policy "allowed roles can read equipment"
on equipment for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing', 'maintenance'));

create policy "admin and maintenance can manage equipment"
on equipment for all
to authenticated
using (current_app_role() in ('admin', 'maintenance'))
with check (current_app_role() in ('admin', 'maintenance'));

create policy "office users can read customers"
on customers for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing'));

create policy "admin and dispatcher can manage customers"
on customers for all
to authenticated
using (current_app_role() in ('admin', 'dispatcher'))
with check (current_app_role() in ('admin', 'dispatcher'));

create policy "role based ticket read"
on work_tickets for select
to authenticated
using (
  current_app_role() in ('admin', 'dispatcher', 'invoicing')
  or (
    current_app_role() = 'driver'
    and driver_id in (select id from drivers where user_id in (select id from app_users where auth_user_id = auth.uid()))
  )
);

create policy "dispatch can create tickets"
on work_tickets for insert
to authenticated
with check (current_app_role() in ('admin', 'dispatcher'));

create policy "role based ticket updates"
on work_tickets for update
to authenticated
using (
  current_app_role() in ('admin', 'dispatcher', 'invoicing')
  or (
    current_app_role() = 'driver'
    and driver_id in (select id from drivers where user_id in (select id from app_users where auth_user_id = auth.uid()))
  )
)
with check (
  current_app_role() in ('admin', 'dispatcher', 'invoicing')
  or (
    current_app_role() = 'driver'
    and driver_id in (select id from drivers where user_id in (select id from app_users where auth_user_id = auth.uid()))
  )
);

create policy "authenticated users can read ticket files"
on ticket_attachments for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing'));

create policy "authenticated users can add ticket files"
on ticket_attachments for insert
to authenticated
with check (current_app_role() in ('admin', 'dispatcher', 'driver'));

create policy "authenticated users can read status history"
on ticket_status_history for select
to authenticated
using (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing'));

create policy "authenticated users can add status history"
on ticket_status_history for insert
to authenticated
with check (current_app_role() in ('admin', 'dispatcher', 'driver', 'invoicing'));

create policy "maintenance users can read records"
on maintenance_records for select
to authenticated
using (current_app_role() in ('admin', 'maintenance'));

create policy "maintenance users can manage records"
on maintenance_records for all
to authenticated
using (current_app_role() in ('admin', 'maintenance'))
with check (current_app_role() in ('admin', 'maintenance'));

create policy "users can read notifications"
on notifications for select
to authenticated
using (current_app_role() is not null);

create policy "admins and dispatch can manage notifications"
on notifications for all
to authenticated
using (current_app_role() in ('admin', 'dispatcher'))
with check (current_app_role() in ('admin', 'dispatcher'));

create policy "admins can read audit logs"
on audit_logs for select
to authenticated
using (current_app_role() = 'admin');

create index if not exists work_tickets_status_idx on work_tickets(status);
create index if not exists work_tickets_driver_id_idx on work_tickets(driver_id);
create index if not exists work_tickets_customer_id_idx on work_tickets(customer_id);
create index if not exists ticket_attachments_ticket_id_idx on ticket_attachments(ticket_id);
create index if not exists maintenance_records_equipment_id_idx on maintenance_records(equipment_id);
