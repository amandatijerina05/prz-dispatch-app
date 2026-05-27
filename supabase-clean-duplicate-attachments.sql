-- Run this once in Supabase SQL Editor to remove duplicate attachment records.
-- It keeps the oldest record for each ticket/file type/file name combination.

with duplicate_attachments as (
  select
    id,
    row_number() over (
      partition by ticket_id, file_type, file_name
      order by created_at asc, id asc
    ) as duplicate_number
  from ticket_attachments
)
delete from ticket_attachments
where id in (
  select id
  from duplicate_attachments
  where duplicate_number > 1
);
