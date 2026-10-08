begin;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 100
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read their own profile"
on public.user_profiles for select to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own profile"
on public.user_profiles for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own profile"
on public.user_profiles for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_user_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_user_profile_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
begin
  profile_name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  )), '');

  if profile_name is not null then
    insert into public.user_profiles (user_id, display_name)
    values (new.id, left(profile_name, 100))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

commit;
