create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz default now()
);

create table if not exists public.writing_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  title text,
  content text,
  content_type text,
  created_at timestamptz default now()
);

create table if not exists public.writing_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  profile_json jsonb,
  sample_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  title text,
  original_text text,
  content_type text,
  result_json jsonb,
  overall_risk int,
  risk_label text,
  created_at timestamptz default now()
);

create table if not exists public.revisions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses(id),
  paragraph_index int,
  original_text text,
  revised_text text,
  revision_type text,
  created_at timestamptz default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses(id),
  user_id uuid references public.users(id),
  user_rating int,
  outcome_label text check (outcome_label in ('submitted_no_issue', 'received_feedback', 'got_grade', 'other') or outcome_label is null),
  notes text,
  created_at timestamptz default now()
);

create index if not exists writing_samples_user_id_idx on public.writing_samples(user_id);
create index if not exists writing_profiles_user_id_idx on public.writing_profiles(user_id);
create index if not exists analyses_user_id_created_at_idx on public.analyses(user_id, created_at desc);
create index if not exists revisions_analysis_id_idx on public.revisions(analysis_id);
create index if not exists feedback_analysis_id_idx on public.feedback(analysis_id);
