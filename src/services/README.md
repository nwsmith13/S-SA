# Cloud Library services

`supabase.ts` creates the browser client from `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. `AuthContext.tsx` keeps the Supabase session available
to the app. `cloudLibrary.ts` owns private Storage uploads, metadata writes, and
Library reads.

## Deployment

1. Apply `supabase/migrations/202610070001_cloud_library.sql` to the target
   Supabase project.
2. Set the two variables from `.env.example` in local and production builds.
3. Enable Email authentication and add the deployed `/library` URL to the
   Supabase Auth redirect allow list.

The `scan-library` bucket is private. Database RLS and Storage policies use
`auth.uid()` as the ownership boundary; the browser's query filters are not a
security boundary.
