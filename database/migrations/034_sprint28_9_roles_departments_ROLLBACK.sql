-- ROLLBACK for migration 034 (Sprint 28.9). Not a numbered migration — run by hand only if you need to undo it:
--   psql "<connection-string>?sslmode=require" -f database/migrations/034_sprint28_9_roles_departments_ROLLBACK.sql
--
-- Puts each person back to the role + department recorded in `migration_034_backup`, EXCEPT anyone whose role or department was changed by an admin after the
-- migration (those are left alone and listed, so a deliberate edit is never overwritten). A deleted Management department is re-created by name.
-- Also restore the previous app version if you roll back — the old app is the one that offers the front_desk role again.
-- The backup table is kept (drop it yourself, when you are sure: DROP TABLE migration_034_backup;).

BEGIN;

DO $rb$
DECLARE r RECORD; target INT; n_ok INT := 0; n_skip INT := 0;
BEGIN
  IF to_regclass('migration_034_backup') IS NULL THEN RAISE EXCEPTION 'migration_034_backup does not exist — nothing to roll back'; END IF;
  FOR r IN SELECT b.*, u.role AS cur_role, u.department_id AS cur_dept FROM migration_034_backup b JOIN users u ON u.user_id = b.user_id ORDER BY b.user_name LOOP
    IF r.cur_role IS NOT DISTINCT FROM r.new_role AND r.cur_dept IS NOT DISTINCT FROM r.new_department_id THEN
      target := NULL;
      IF r.old_department_name IS NOT NULL THEN
        SELECT department_id INTO target FROM departments WHERE name = r.old_department_name ORDER BY department_id LIMIT 1;
        IF target IS NULL THEN
          INSERT INTO departments (name) VALUES (r.old_department_name) RETURNING department_id INTO target;   -- Management was deleted by the migration: re-create it (colour is not recorded)
          RAISE NOTICE 're-created department %', r.old_department_name;
        END IF;
      END IF;
      UPDATE users SET role = r.old_role, department_id = target WHERE user_id = r.user_id;
      n_ok := n_ok + 1;
    ELSE
      n_skip := n_skip + 1;
      RAISE NOTICE 'left alone (edited since the migration): %', r.user_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'rollback 034: % restored, % left alone', n_ok, n_skip;
END
$rb$;

COMMIT;
