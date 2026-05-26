insert into drivers (name, phone)
select 'Ramon Alvarez', '432-555-0198'
where not exists (select 1 from drivers where name = 'Ramon Alvarez');

insert into drivers (name, phone)
select 'Caleb Stone', '432-555-0144'
where not exists (select 1 from drivers where name = 'Caleb Stone');

insert into drivers (name, phone)
select 'Mia Torres', '432-555-0137'
where not exists (select 1 from drivers where name = 'Mia Torres');

insert into equipment (name, type, status, certification_due, next_service_due)
select '110 Ton Crane', 'Crane', 'Available', '2026-11-12', '2026-06-10'
where not exists (select 1 from equipment where name = '110 Ton Crane');

insert into equipment (name, type, status, certification_due, next_service_due)
select 'Peterbilt Winch Truck', 'Truck', 'Available', '2026-09-30', '2026-06-02'
where not exists (select 1 from equipment where name = 'Peterbilt Winch Truck');

insert into equipment (name, type, status, certification_due, next_service_due)
select 'Lowboy Trailer', 'Trailer', 'Available', '2026-12-15', '2026-07-01'
where not exists (select 1 from equipment where name = 'Lowboy Trailer');

insert into customers (name, contact, billing_terms, default_site, instructions)
select
  'Black Mesa Services',
  'Jared | 432-555-0108',
  'Net 30',
  'County Road 118 lease pad',
  'Call before entering gate. H2S briefing required.'
where not exists (select 1 from customers where name = 'Black Mesa Services');

insert into customers (name, contact, billing_terms, default_site, instructions)
select
  'Red Rock Energy',
  'Elena | 432-555-0161',
  'Net 15',
  'South yard',
  'PO required on every ticket.'
where not exists (select 1 from customers where name = 'Red Rock Energy');

insert into maintenance_records (equipment_id, task, due_date, status)
select id, 'Annual crane inspection', '2026-06-15', 'Scheduled'
from equipment
where name = '110 Ton Crane'
  and not exists (
    select 1 from maintenance_records
    where task = 'Annual crane inspection'
      and equipment_id = equipment.id
  );

insert into maintenance_records (equipment_id, task, due_date, status)
select id, 'DOT service and oil change', '2026-05-22', 'Due Soon'
from equipment
where name = 'Peterbilt Winch Truck'
  and not exists (
    select 1 from maintenance_records
    where task = 'DOT service and oil change'
      and equipment_id = equipment.id
  );
