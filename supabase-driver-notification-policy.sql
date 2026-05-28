-- Run this in Supabase SQL Editor to restrict driver notification rows.
-- Drivers can read general driver notifications and notifications addressed to their driver id or name.

drop policy if exists "users can read notifications" on notifications;

create policy "role based notification read"
on notifications for select
to authenticated
using (
  current_app_role() in ('admin', 'dispatcher', 'invoicing')
  or (
    current_app_role() = 'driver'
    and (
      audience = 'driver'
      or audience in (
        select id::text
        from drivers
        where user_id in (
          select id
          from app_users
          where auth_user_id = auth.uid()
        )
      )
      or audience in (
        select name
        from drivers
        where user_id in (
          select id
          from app_users
          where auth_user_id = auth.uid()
        )
      )
    )
  )
);
