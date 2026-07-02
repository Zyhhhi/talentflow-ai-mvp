-- TalentFlow AI internal trial schema
-- Run this in Supabase SQL editor after creating the project.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'hr', 'interviewer');
  end if;

  if not exists (select 1 from pg_type where typname = 'candidate_status') then
    create type candidate_status as enum (
      'new',
      'scheduled',
      'interviewed',
      'passed',
      'rejected',
      'offer',
      'onboarded',
      'probation'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'probation_status') then
    create type probation_status as enum (
      'not_started',
      'in_progress',
      'passed',
      'risk',
      'failed'
    );
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role app_role not null default 'hr',
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  position text not null,
  source text not null default 'unknown',
  status candidate_status not null default 'new',
  is_archived boolean not null default false,
  interview_time timestamptz,
  interviewer text,
  interview_feedback text,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  result_note text,
  onboard_date date,
  probation_status probation_status not null default 'not_started',
  resume_text text,
  resume_file_url text,
  resume_file_name text,
  resume_imported_at timestamptz,
  resume_parsed_info jsonb not null default '{}',
  jd_text text,
  ai_stale boolean not null default false,
  ai_updated_at timestamptz,
  status_updated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidates add column if not exists phone text;
alter table public.candidates add column if not exists email text;
alter table public.candidates add column if not exists resume_parsed_info jsonb not null default '{}';
alter table public.candidates add column if not exists resume_imported_at timestamptz;
alter table public.candidates add column if not exists ai_stale boolean not null default false;
alter table public.candidates add column if not exists ai_updated_at timestamptz;
alter table public.candidates add column if not exists status_updated_at timestamptz;

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  match_score integer check (match_score is null or (match_score >= 0 and match_score <= 100)),
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  risks text[] not null default '{}',
  follow_up_questions text[] not null default '{}',
  next_round_recommendation text,
  recommended_conclusion text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.operation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  candidate_id uuid references public.candidates(id) on delete set null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_candidates_status on public.candidates(status);
create index if not exists idx_candidates_is_archived on public.candidates(is_archived);
create index if not exists idx_candidates_position on public.candidates(position);
create index if not exists idx_candidates_interviewer on public.candidates(interviewer);
create index if not exists idx_candidates_created_by on public.candidates(created_by);
create index if not exists idx_ai_reports_candidate_id on public.ai_reports(candidate_id);
create index if not exists idx_operation_logs_candidate_id on public.operation_logs(candidate_id);
create index if not exists idx_operation_logs_user_id on public.operation_logs(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_candidates_updated_at on public.candidates;
create trigger set_candidates_updated_at
before update on public.candidates
for each row
execute function public.set_updated_at();

-- RLS design placeholder for internal trial.
-- Enable after Supabase Auth is connected and profiles are created.
--
-- alter table public.profiles enable row level security;
-- alter table public.candidates enable row level security;
-- alter table public.ai_reports enable row level security;
-- alter table public.operation_logs enable row level security;
--
-- Suggested policies:
-- 1. admin can select/insert/update/delete all rows.
-- 2. hr can manage candidates and create ai_reports/operation_logs.
-- 3. interviewer can select candidates where candidates.interviewer matches their profile name or email,
--    and can update interview_feedback for assigned candidates.
-- 4. operation_logs should be insert-only for hr/admin and read-only for admin.

-- Storage design:
-- Create a private bucket named "resumes".
-- Suggested object path: resumes/{candidate_id}/{timestamp}-{original_file_name}
-- Use signed URLs or authenticated download flows. Do not make resume files public.
