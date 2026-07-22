-- ============================================================================
-- ElectraFlow AI — Manual: Storage buckets and RLS policies
-- ============================================================================
-- NOT applied by `supabase db push`. Run manually after schema migrations.
--
-- Prerequisites:
--   1. All supabase/migrations/ files applied (through phase 6+ JWT helpers).
--   2. Create PRIVATE buckets in Supabase Dashboard → Storage:
--        • project-documents
--        • avatars
--
-- Source: migration-phase6.sql section 15 (commented block).
-- ============================================================================

-- project-documents bucket
DROP POLICY IF EXISTS "doc_storage: org members can upload" ON storage.objects;
CREATE POLICY "doc_storage: org members can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_my_org_id()::text
  );

DROP POLICY IF EXISTS "doc_storage: org members can read" ON storage.objects;
CREATE POLICY "doc_storage: org members can read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_my_org_id()::text
  );

-- avatars bucket
DROP POLICY IF EXISTS "avatars: org members can read" ON storage.objects;
CREATE POLICY "avatars: org members can read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_my_org_id()::text
  );

DROP POLICY IF EXISTS "avatars: user can upload own avatar" ON storage.objects;
CREATE POLICY "avatars: user can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = get_my_org_id()::text
  );
