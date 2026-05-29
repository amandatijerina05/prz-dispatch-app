# PRZ LLC Dispatch Prototype

This is a self-contained browser prototype for PRZ LLC dispatch operations.

## What It Includes

- Dispatcher work ticket entry
- Role-based access for admin, dispatcher, driver, invoicing, and maintenance users
- Login-only signed-out screen with automatic inactivity sign-out
- Driver assignment and mobile-style driver queue
- Installable driver PWA with home-screen support and offline app shell
- Ticket status flow: Sent, Accepted, In Progress, Completed, Invoiced
- Driver completion packets with notes, attachments, and customer signature capture
- Customer/job database with billing terms, contacts, sites, and instructions
- Ticket attachments for dispatch and driver documents
- Time, rate, mileage, minimum charge, fuel surcharge, and overtime tracking
- Invoicing tracker for completed work tickets
- CSV export and text invoice packet download
- Equipment availability status
- Maintenance tracking for service, inspections, and certifications
- Dispatch calendar and map-style job site board
- Notification log for dispatch, driver, invoicing, and admin events
- Reports for customer revenue, equipment workload, and uninvoiced work
- Admin dashboard for adding and removing drivers and equipment
- Twilio SMS work ticket delivery through a Vercel serverless function
- PRZ LLC branding with the provided logo and red, black, and white styling
- Local browser storage so demo data stays in the browser until cleared

## Run Locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

Use **Load sample day** to populate a demo dispatch board.

## Driver Mobile App

When signed in as **Driver**, the interface switches to a driver-focused phone layout. The app also includes:

- `manifest.webmanifest` for installable home-screen behavior
- `service-worker.js` for offline shell caching
- Mobile ticket filters for current and completed work
- Signature, notes, and attachment capture in the driver workflow

## Supabase Setup Files

- `supabase-schema.sql` creates the production database tables and security policies.
- `supabase-seed.sql` adds starter PRZ drivers, equipment, customers, and maintenance records.
- `supabase-storage-policies.sql` enables ticket attachment, driver photo, and signature uploads.
- `supabase-clean-duplicate-attachments.sql` removes duplicate attachment records from earlier testing.
- `supabase-equipment-driver-types.sql` adds driver equipment-type assignments and PRZ equipment models.
- `supabase-driver-notification-policy.sql` restricts driver notification reads to their own messages.
- `supabase-ticket-order-fields.sql` adds Sales Person and Ordered By fields to work tickets.
- `supabase-maintenance-proof-files.sql` adds maintenance proof photo/document storage.
- `supabase-ticket-afv-equipment-exposure.sql` adds AFV/PO, multiple equipment, and exposure hour fields to work tickets.
- `supabase-ticket-line-items.sql` adds dispatch line item charges to work tickets.

## Production Environment Variables

Add these in Vercel under the project settings for production features:

```text
TWILIO_ACCOUNT_SID=your Twilio Account SID
TWILIO_AUTH_TOKEN=your Twilio Auth Token
TWILIO_FROM_NUMBER=your Twilio phone number, such as +14325551234
APP_BASE_URL=https://przdispatch.com
SUPABASE_URL=https://izhgssrghucowblrkfhw.supabase.co
SUPABASE_PUBLISHABLE_KEY=your Supabase publishable key
SUPABASE_SERVICE_ROLE_KEY=your Supabase service role key
```

`TWILIO_AUTH_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` must stay private and should only be stored in Vercel, never in browser JavaScript.
