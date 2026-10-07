-- Library Management V2: flat, user-owned folders and optional document filing.
create table public.library_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index library_folders_user_name_ci_idx on public.library_folders (user_id, lower(name));
create index library_folders_user_name_idx on public.library_folders (user_id, name);

alter table public.scan_documents add column folder_id uuid null;
alter table public.scan_documents add constraint scan_documents_owned_folder_fk
  foreign key (folder_id, user_id) references public.library_folders(id, user_id)
  on delete set null (folder_id);
create index scan_documents_user_folder_updated_idx on public.scan_documents (user_id, folder_id, updated_at desc);

create or replace function public.touch_library_folder_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger touch_library_folder_updated_at before update on public.library_folders
for each row execute function public.touch_library_folder_updated_at();

alter table public.library_folders enable row level security;
create policy "owners read library folders" on public.library_folders for select to authenticated using (user_id = auth.uid());
create policy "owners create library folders" on public.library_folders for insert to authenticated with check (user_id = auth.uid());
create policy "owners update library folders" on public.library_folders for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners delete library folders" on public.library_folders for delete to authenticated using (user_id = auth.uid());

-- Existing documents retain folder_id = null and therefore appear in Unfiled.
-- Reversal (only after setting every document folder_id to null):
-- alter table public.scan_documents drop constraint scan_documents_owned_folder_fk;
-- alter table public.scan_documents drop column folder_id;
-- drop table public.library_folders;
