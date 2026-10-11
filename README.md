# Kudos Tracker

A web version of the **Networking Group KPI Tracker** spreadsheet (`Networking_Group_KPI_Kudos_Tracker_v3.xlsx`). It uses the same roster, Points Key, scoring formulas, KPI Log, Leaderboard columns, and auto-badges. It starts with the spreadsheet's data, row for row.

## How it's built

- `index.html` is the whole app: plain HTML, CSS, and JavaScript, with no build step.
- `api/` holds Vercel functions that read and write the shared log in Supabase. The browser never talks to Supabase directly.
- `supabase/schema.sql` creates the tables and loads the spreadsheet's data.
- `networking_kpi_prototype_v1.html` redirects old links to the app.
- `vercel.json` runs `/api/keepalive` once a day. Supabase pauses free projects after about a week without activity, and the group meets every two weeks. The ping returns no data, so it skips the group passcode. If you set `CRON_SECRET` in Vercel, only Vercel's cron can call it.

If the database isn't reachable, the app still works, but entries are saved only in that person's browser, and a banner says so. Once the database is connected, the app offers to add those entries to the shared log.

## Design

The look matches the Network Effect landing page (`Blizzard-Branding/networkeffect`, live at networkeffectsac.com). The tracker uses the same color tokens on `:root`, Jost for headings and Inter for body text from Google Fonts, the same buttons, and the same animated network behind the dashboard hero. The animation stops under `prefers-reduced-motion` and when the tab is hidden. To change a brand color, update it in both repositories.

Following the landing page's house style, the copy uses no em dashes.

## Set up the shared database

1. In Supabase, open the project that's connected to Vercel, go to **SQL Editor**, paste the contents of `supabase/schema.sql`, and select **Run**. Running it again is safe: it never overwrites or duplicates existing data.
2. Optional: to require a group passcode, add a `GROUP_PASSCODE` environment variable in Vercel (**Settings > Environment Variables**). Everyone enters it once per device.
3. Redeploy in Vercel so the functions pick up any new environment variables.

The functions read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which the Vercel Supabase integration adds. They also accept `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

## Scoring

Scoring matches the spreadsheet:

- Each activity type has points and a role label for Person 1, 2, and 3 (**Points Key**).
- **Closed Business:** Closer points = ROUND((100 ÷ their Annual Goal) × Job Size Multiplier, 2). Referrer bonus = ROUND(Closer points × Referrer Bonus %, 2). A blank goal counts as 100, and a blank job size counts as 1x.
- **Leaderboard** columns and the four badges use the same rules as the spreadsheet's formulas. Months and quarters follow the viewer's local calendar.

## Differences from the spreadsheet

- When people tie for a badge, the badge lists all of them. The spreadsheet shows only the first one.
- Renaming a member or activity type also updates past KPI Log entries.
- An entry can't list the same person twice.
- Entries saved from the app's form use the Points Key's role labels. Four imported rows keep labels that were typed over the formula in the spreadsheet, so they display exactly as they did there until someone edits them.
