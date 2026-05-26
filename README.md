# PRZ LLC Dispatch Prototype

This is a self-contained browser prototype for PRZ LLC dispatch operations.

## What It Includes

- Dispatcher work ticket entry
- Role-based access for admin, dispatcher, driver, invoicing, and maintenance users
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
