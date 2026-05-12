-- Align table name with Prisma @@map("questions") (legacy migration used a trailing space in the identifier).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'questions '
  ) THEN
    ALTER TABLE "questions " RENAME TO "questions";
  END IF;
END $$;
