CREATE TEMP TABLE recovery_counts (name text, rows bigint);
BEGIN READ ONLY;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    EXECUTE format('INSERT INTO recovery_counts SELECT %L, count(*) FROM public.%I',
                   item.tablename, item.tablename);
  END LOOP;
  IF NOT EXISTS (SELECT FROM recovery_counts)
     OR NOT EXISTS (SELECT FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL)
     OR EXISTS (SELECT FROM public."_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL)
  THEN RAISE EXCEPTION 'Backup evidence is incomplete'; END IF;
END $$;
SELECT 'NASJ_EVIDENCE:' || (SELECT count(*) FROM recovery_counts) || ':' ||
       count(*) || ':' || md5(string_agg(migration_name || ':' || checksum, ',' ORDER BY migration_name)) || ':' ||
       (SELECT md5(string_agg(name || ':' || rows, ',' ORDER BY name)) FROM recovery_counts)
FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
ROLLBACK;
