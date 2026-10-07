-- First Cloud Library slice. Additive and safe to apply to an existing project.
create extension if not exists pgcrypto;

create table if not exists public.scan_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  pdf_filename text not null check (char_length(pdf_filename) between 5 and 124),
  page_count integer not null check (page_count > 0),
  status text not null default 'completed' check (status = 'completed'),
  pdf_storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_documents_owner_path check (split_part(pdf_storage_path, '/', 1) = user_id::text)
);

create table if not exists public.scan_document_pages (
  id uuid primary key,
  document_id uuid not null references public.scan_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  original_storage_path text not null,
  processed_storage_path text not null,
  original_filename text not null,
  original_content_type text not null,
  original_size_bytes bigint not null check (original_size_bytes >= 0),
  processed_width integer not null check (processed_width > 0),
  processed_height integer not null check (processed_height > 0),
  processing_mode text not null check (processing_mode in ('auto', 'color', 'grayscale', 'black-white')),
  rotation integer not null check (rotation in (0, 90, 180, 270)),
  corners jsonb not null,
  detected_corners jsonb not null,
  detection_confidence real not null,
  created_at timestamptz not null default now(),
  unique (document_id, page_index),
  constraint scan_document_pages_original_owner_path check (split_part(original_storage_path, '/', 1) = user_id::text),
  constraint scan_document_pages_processed_owner_path check (split_part(processed_storage_path, '/', 1) = user_id::text)
);

create index if not exists scan_documents_user_updated_idx on public.scan_documents (user_id, updated_at desc);
create index if not exists scan_document_pages_document_order_idx on public.scan_document_pages (document_id, page_index);

create or replace function public.touch_scan_document_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger touch_scan_document_updated_at before update on public.scan_documents
for each row execute function public.touch_scan_document_updated_at();

alter table public.scan_documents enable row level security;
alter table public.scan_document_pages enable row level security;

create policy "owners read scan documents" on public.scan_documents for select to authenticated using (user_id = auth.uid());
create policy "owners create scan documents" on public.scan_documents for insert to authenticated with check (user_id = auth.uid());
create policy "owners update scan documents" on public.scan_documents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners delete scan documents" on public.scan_documents for delete to authenticated using (user_id = auth.uid());

create policy "owners read scan pages" on public.scan_document_pages for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.scan_documents d where d.id = document_id and d.user_id = auth.uid()));
create policy "owners create scan pages" on public.scan_document_pages for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.scan_documents d where d.id = document_id and d.user_id = auth.uid()));
create policy "owners update scan pages" on public.scan_document_pages for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.scan_documents d where d.id = document_id and d.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.scan_documents d where d.id = document_id and d.user_id = auth.uid()));
create policy "owners delete scan pages" on public.scan_document_pages for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.scan_documents d where d.id = document_id and d.user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scan-library', 'scan-library', false, 52428800, null)
on conflict (id) do update set public = false;

create policy "owners read scan files" on storage.objects for select to authenticated
  using (bucket_id = 'scan-library' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners create scan files" on storage.objects for insert to authenticated
  with check (bucket_id = 'scan-library' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners update scan files" on storage.objects for update to authenticated
  using (bucket_id = 'scan-library' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'scan-library' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete scan files" on storage.objects for delete to authenticated
  using (bucket_id = 'scan-library' and (storage.foldername(name))[1] = auth.uid()::text);

-- Reversal, if this slice must be removed:
-- drop policy ... on storage.objects; delete from storage.buckets where id = 'scan-library';
-- drop table public.scan_document_pages; drop table public.scan_documents;
