-- Kudos Tracker database setup.
-- Run this once in Supabase: open your project, go to SQL Editor, paste this whole file, and select Run.
-- It's safe to run again: it never overwrites or duplicates data that's already there.

-- One row holding the roster, Points Key, and Closed Business settings.
create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- The KPI Log: one row per activity. Names are stored as text, like the spreadsheet.
create table if not exists public.activities (
  id text primary key default gen_random_uuid()::text,
  position bigint generated always as identity,
  date date,
  type text not null,
  p1 text not null,
  p2 text,
  p3 text,
  r1 text, -- r1–r3: role labels that were typed over the formula in the spreadsheet
  r2 text,
  r3 text,
  job_size text,
  notes text,
  value text,
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists activities_position_idx on public.activities (position);

-- Lock the tables to browsers. The app's /api functions use the service role key, which bypasses this.
alter table public.config enable row level security;
alter table public.activities enable row level security;
-- Some projects don't expose new tables to the API automatically, so grant the server key access explicitly.
grant all on public.config, public.activities to service_role;

-- Starting data: Networking_Group_KPI_Kudos_Tracker_v3.xlsx.
insert into public.config (id, data) values (1, '{"members": [{"name": "Aubrey Straub", "goal": 24}, {"name": "Leo Blizzard", "goal": 24}, {"name": "Brian Arao", "goal": 24}, {"name": "Amy Menendez", "goal": 24}, {"name": "Abby Little", "goal": 24}, {"name": "Arend S", "goal": 24}, {"name": "Maurissa", "goal": 24}, {"name": "Kay", "goal": 24}, {"name": "Mischa", "goal": 24}], "key": [{"type": "Referral Given", "p1": 5, "role1": "Referrer", "p2": 0, "role2": "Recipient", "p3": 0, "role3": "", "description": "Passed a referral to another member — logs who it went to."}, {"type": "One-on-One Meeting", "p1": 3, "role1": "Attendee", "p2": 3, "role2": "Attendee", "p3": 0, "role3": "", "description": "Both people get credit for a completed 1:1."}, {"type": "Meeting Attendance", "p1": 2, "role1": "Attendee", "p2": 2, "role2": "Attendee", "p3": 2, "role3": "Attendee", "description": "Attended the group''s regular meeting — log up to 3 people on one row."}, {"type": "Visitor Brought", "p1": 8, "role1": "Inviter", "p2": 8, "role2": "Co-Inviter", "p3": 0, "role3": "", "description": "Brought a guest/prospective member to a meeting."}, {"type": "Testimonial Given", "p1": 4, "role1": "Giver", "p2": 0, "role2": "Recipient", "p3": 0, "role3": "", "description": "Gave a testimonial for another member''s business."}, {"type": "Closed Business", "p1": "Goal-based", "role1": "Closer", "p2": "% of Closer, see below", "role2": "Referrer (bonus)", "p3": 0, "role3": "", "description": "A referral turned into real business. Points are personalized: see the Closed Business Settings below — Closer earns points off THEIR annual goal x job size; Referrer gets a % bonus of that."}, {"type": "Social Shoutout", "p1": 2, "role1": "Giver", "p2": 0, "role2": "Recipient", "p3": 0, "role3": "", "description": "Public shoutout/mention on social media or LinkedIn."}, {"type": "Connector Bonus", "p1": 4, "role1": "Connector", "p2": 0, "role2": "Connected: Person A", "p3": 0, "role3": "Connected: Person B", "description": "Introduced two members to each other."}, {"type": "Multi-Referral Streak", "p1": 6, "role1": "Member", "p2": 0, "role2": "", "p3": 0, "role3": "", "description": "Gave referrals to 3+ different members in a single month."}, {"type": "Recruited a New Member", "p1": 10, "role1": "Recruiter", "p2": 0, "role2": "New Member", "p3": 0, "role3": "", "description": "Brought in an actual new paying/joining member (not just a visitor)."}, {"type": "New Member Mentor", "p1": 4, "role1": "Mentor", "p2": 0, "role2": "New Member", "p3": 0, "role3": "", "description": "Onboarded or showed the ropes to a newer member."}, {"type": "Review Left", "p1": 3, "role1": "Reviewer", "p2": 0, "role2": "Reviewed", "p3": 0, "role3": "", "description": "Wrote a review for a teammate''s business."}, {"type": "Cross-Promotion", "p1": 3, "role1": "Promoter", "p2": 0, "role2": "Featured Member", "p3": 0, "role3": "", "description": "Featured another member on your own social media, newsletter, or email list."}, {"type": "Feedback Given", "p1": 2, "role1": "Giver", "p2": 0, "role2": "Recipient", "p3": 0, "role3": "", "description": "Gave real, useful feedback on someone''s pitch, website, or marketing."}, {"type": "Perfect Attendance Streak", "p1": 5, "role1": "Member", "p2": 0, "role2": "", "p3": 0, "role3": "", "description": "No missed meetings across a full quarter."}, {"type": "Meeting Role Volunteer", "p1": 2, "role1": "Volunteer", "p2": 2, "role2": "Co-Volunteer", "p3": 0, "role3": "", "description": "Served as greeter, timekeeper, or ran a meeting segment."}, {"type": "Hosted an Event", "p1": 8, "role1": "Host", "p2": 8, "role2": "Co-Host", "p3": 0, "role3": "", "description": "Opened up their business for a mixer, lunch-and-learn, or open house."}, {"type": "Big Ask Fulfilled", "p1": 3, "role1": "Helper", "p2": 0, "role2": "Requester", "p3": 0, "role3": "", "description": "Answered someone''s help request posted to the group."}, {"type": "Spotlight/Presenter", "p1": 5, "role1": "Presenter", "p2": 0, "role2": "", "p3": 0, "role3": "", "description": "Gave a deeper presentation on their own business to the group."}, {"type": "Content Collab", "p1": 5, "role1": "Collaborator A", "p2": 5, "role2": "Collaborator B", "p3": 5, "role3": "Collaborator C", "description": "Co-hosted a webinar or created content together."}, {"type": "Story Share", "p1": 3, "role1": "Sharer", "p2": 0, "role2": "Featured Member", "p3": 0, "role3": "", "description": "Shared a case study or success story that came from a group referral."}, {"type": "Kudos", "p1": 0, "role1": "Giver (no points)", "p2": 1, "role2": "Receiver (gets the star)", "p3": 0, "role3": "", "description": "Quick peer recognition — replaces the old Kudos Matrix tab."}], "multipliers": {"Small": 0.5, "Medium": 1, "Large": 2}, "refBonus": 0.5}'::jsonb)
on conflict (id) do nothing;

insert into public.activities (id, date, type, p1, p2, p3, r1, r2, r3, job_size, notes, value, seeded) values
  ('seed-2', '2026-08-24', 'Referral Given', 'Aubrey Straub', 'Kay', null, null, null, null, null, 'Example row — Aubrey referred Kay to a potential client. Overwrite or delete this row.', null, true),
  ('seed-3', '2026-08-27', 'Closed Business', 'Mischa', 'Aubrey Straub', null, null, null, null, 'Medium', 'Example row — Aubrey''s referral turned into a portrait session. Overwrite or delete this row.', null, true),
  ('seed-4', '2026-09-02', 'One-on-One Meeting', 'Aubrey Straub', 'Abby Little', 'Maurissa', null, null, null, null, null, null, true),
  ('seed-5', '2026-09-03', 'One-on-One Meeting', 'Aubrey Straub', 'Kay', null, null, null, null, null, null, null, true),
  ('seed-6', '2026-09-04', 'One-on-One Meeting', 'Aubrey Straub', 'Mischa', null, null, null, null, null, null, null, true),
  ('seed-7', '2026-09-02', 'Meeting Attendance', 'Aubrey Straub', 'Leo Blizzard', 'Brian Arao', null, null, null, null, null, null, true),
  ('seed-8', '2026-09-02', 'Meeting Attendance', 'Amy Menendez', 'Abby Little', 'Maurissa', null, null, null, null, null, null, true),
  ('seed-9', '2026-09-02', 'Meeting Attendance', 'Mischa', 'Kay', null, null, null, null, null, null, null, true),
  ('seed-10', '2026-09-02', 'Meeting Role Volunteer', 'Abby Little', 'Aubrey Straub', null, null, null, null, null, 'Lunch duties and Convener', null, true),
  ('seed-11', '2026-09-02', 'Hosted an Event', 'Amy Menendez', null, null, null, null, null, null, 'Venue', null, true),
  ('seed-12', '2026-09-16', 'Referral Given', 'Amy Menendez', 'Kay', null, null, null, null, null, null, null, true),
  ('seed-13', '2026-09-16', 'Closed Business', 'Kay', 'Amy Menendez', null, null, null, null, 'Small', 'Work on Amy''s house', null, true),
  ('seed-14', '2026-09-16', 'Referral Given', 'Abby Little', null, null, 'Referrer', null, null, null, 'Referred business to Mari', null, true),
  ('seed-15', '2026-09-16', 'Referral Given', 'Aubrey Straub', 'Leo Blizzard', null, 'Referrer', 'Referree', null, null, null, null, true),
  ('seed-16', '2026-09-16', 'Closed Business', 'Aubrey Straub', 'Leo Blizzard', null, 'Referrer (bonus)', 'Closer', null, 'Small', 'Book cover design', null, true),
  ('seed-17', '2026-09-16', 'Referral Given', 'Abby Little', 'Maurissa', null, null, null, null, 'Small', 'SIMPLE IRA set-up', null, true),
  ('seed-18', '2026-09-16', 'One-on-One Meeting', 'Mischa', 'Kay', null, null, null, null, null, null, null, true),
  ('seed-19', '2026-09-16', 'One-on-One Meeting', 'Aubrey Straub', 'Kay', null, null, null, null, null, null, null, true),
  ('seed-20', '2026-09-16', 'Closed Business', 'Aubrey Straub', 'Maurissa', 'Brian Arao', null, 'Closer', 'Referrer (bonus)', 'Medium', null, null, true),
  ('seed-21', '2026-09-16', 'Meeting Attendance', 'Aubrey Straub', 'Leo Blizzard', 'Amy Menendez', null, null, null, null, null, null, true),
  ('seed-22', '2026-09-16', 'Meeting Attendance', 'Abby Little', 'Arend S', 'Maurissa', null, null, null, null, null, null, true),
  ('seed-23', '2026-09-16', 'Meeting Attendance', 'Kay', 'Mischa', null, null, null, null, null, null, null, true),
  ('seed-24', '2026-09-16', 'Testimonial Given', 'Abby Little', null, null, null, null, null, null, 'Received 15 new clients as result of social shoutoutn from Mari', null, true)
on conflict (id) do nothing;

-- Tell Supabase's API to pick up the new tables right away.
notify pgrst, 'reload schema';
