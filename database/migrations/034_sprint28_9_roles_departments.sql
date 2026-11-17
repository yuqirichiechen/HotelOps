-- Migration 034: Sprint 28.9 — a person's ROLE is only employee / admin; "Front Desk" lives only in the DEPARTMENT; the legacy Management department goes.
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/034_sprint28_9_roles_departments.sql   (take a dump / snapshot first; BEFORE deploy)
--
-- What it changes (ONLY the users.role and users.department_id cells listed here — no column, table or person is dropped, nothing is deleted from users):
--   A. role front_desk, no department (or in Management)  → role employee, department Front Desk  (the role was the only thing giving them front-desk access)
--   B. role front_desk, any OTHER department              → role employee, department KEPT         (a Housekeeping person with that role stays in Housekeeping)
--   C. everyone left in the Management department         → department NULL (= "Uncategorized"); roles unchanged (nobody is promoted to admin automatically)
--   D. the Management department row is deleted ONLY if nothing at all still points at it (staff incl. deleted ones, shift templates, handoff notes);
--      otherwise it is left in place and the notice says what still uses it (clear those in Settings → Departments, then delete it there).
-- The user_role ENUM keeps its 'front_desk' label (Postgres cannot drop an enum value); the server refuses to assign it and nobody holds it after this.
--
-- Safety:
--   * Everything runs in ONE transaction — any error rolls it all back, nothing is half-done.
--   * Idempotent: a second run finds nothing to change (the backup keeps the FIRST, original values).
--   * `migration_034_backup` records every touched person (old + new role / department) and `audit_logs` gets one row each; the NOTICEs list who moved where.
--   * Undo: database/migrations/034_sprint28_9_roles_departments_ROLLBACK.sql restores the old values from the backup (skipping anyone edited since).
-- Sessions already signed in keep their old role / department until they sign in again (tokens last 8 h); the server tolerates the old role in those tokens.

BEGIN;

CREATE TABLE IF NOT EXISTS migration_034_backup (
  user_id             UUID PRIMARY KEY,
  user_name           TEXT,
  old_role            user_role NOT NULL,
  old_department_id   INT,
  old_department_name TEXT,
  new_role            user_role,
  new_department_id   INT,
  reason              TEXT NOT NULL,
  backed_up_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $mig$
DECLARE
  fd_id INT; mg_id INT; n_new INT; n_a INT := 0; n_b INT := 0; n_c INT := 0; r RECORD; mg_people INT; mg_shifts INT; mg_notes INT;
BEGIN
  SELECT department_id INTO fd_id FROM departments WHERE name ~* '^front[ _-]*desk$' ORDER BY department_id LIMIT 1;
  SELECT department_id INTO mg_id FROM departments WHERE lower(btrim(name)) = 'management' ORDER BY department_id LIMIT 1;

  -- the Front Desk department normally exists; create it only when someone needs it and it is missing
  IF fd_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE role = 'front_desk' AND (department_id IS NULL OR department_id IS NOT DISTINCT FROM mg_id)) THEN
    INSERT INTO departments (name, color) VALUES ('Front Desk', '#3182ce') RETURNING department_id INTO fd_id;
    RAISE NOTICE 'created the Front Desk department (it was missing)';
  END IF;

  -- 1. BACKUP first (+ one audit row each) — only people not already backed up, so a re-run never overwrites the originals
  WITH ins AS (
    INSERT INTO migration_034_backup (user_id, user_name, old_role, old_department_id, old_department_name, reason)
    SELECT u.user_id, u.name, u.role, u.department_id, d.name,
           CASE WHEN u.role = 'front_desk' AND (u.department_id IS NULL OR u.department_id IS NOT DISTINCT FROM mg_id) THEN 'A: front_desk role without a department → Front Desk department'
                WHEN u.role = 'front_desk' THEN 'B: front_desk role → employee (department kept)'
                ELSE 'C: left the Management department' END
      FROM users u LEFT JOIN departments d ON d.department_id = u.department_id
     WHERE u.role = 'front_desk' OR (mg_id IS NOT NULL AND u.department_id = mg_id)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id, old_role, old_department_id, reason
  )
  INSERT INTO audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  SELECT NULL, 'migration_034_role_department', 'users', ins.user_id,
         jsonb_build_object('role', ins.old_role, 'department_id', ins.old_department_id), jsonb_build_object('reason', ins.reason)
    FROM ins;
  GET DIAGNOSTICS n_new = ROW_COUNT;

  -- 2. A: front_desk role without a department (or in Management) → employee + Front Desk
  UPDATE users SET role = 'employee', department_id = fd_id
   WHERE role = 'front_desk' AND (department_id IS NULL OR department_id IS NOT DISTINCT FROM mg_id) AND fd_id IS NOT NULL;
  GET DIAGNOSTICS n_a = ROW_COUNT;
  -- 3. B: every other front_desk role → employee, department untouched
  UPDATE users SET role = 'employee' WHERE role = 'front_desk';
  GET DIAGNOSTICS n_b = ROW_COUNT;
  -- 4. C: whoever is still in Management → no department (Uncategorized)
  IF mg_id IS NOT NULL THEN
    UPDATE users SET department_id = NULL WHERE department_id = mg_id;
    GET DIAGNOSTICS n_c = ROW_COUNT;
  END IF;

  -- 5. record where each touched person ended up
  UPDATE migration_034_backup b SET new_role = u.role, new_department_id = u.department_id
    FROM users u WHERE u.user_id = b.user_id AND b.new_role IS NULL;

  RAISE NOTICE 'migration 034: % newly backed up | A (role→employee + Front Desk): % | B (role→employee, department kept): % | C (left Management): %', n_new, n_a, n_b, n_c;
  FOR r IN SELECT b.user_name, b.reason, b.old_role, COALESCE(b.old_department_name, '—') AS old_dept, b.new_role, COALESCE(d.name, 'Uncategorized') AS new_dept
             FROM migration_034_backup b LEFT JOIN departments d ON d.department_id = b.new_department_id ORDER BY b.reason, b.user_name LOOP
    RAISE NOTICE '  % | % | % / % → % / %', r.user_name, r.reason, r.old_role, r.old_dept, r.new_role, r.new_dept;
  END LOOP;

  -- 6. D: delete the Management department only when NOTHING points at it any more
  IF mg_id IS NOT NULL THEN
    SELECT (SELECT COUNT(*) FROM users WHERE department_id = mg_id), (SELECT COUNT(*) FROM shifts WHERE department_id = mg_id),
           (SELECT COUNT(*) FROM handoff_notes WHERE department_id = mg_id)
      INTO mg_people, mg_shifts, mg_notes;
    IF mg_people = 0 AND mg_shifts = 0 AND mg_notes = 0 THEN
      DELETE FROM departments WHERE department_id = mg_id;
      RAISE NOTICE 'Management department deleted (nothing used it)';
    ELSE
      RAISE NOTICE 'Management department KEPT — still used by % shift template(s), % handoff note(s), % user row(s). Clear them in the app, then delete it in Settings → Departments.', mg_shifts, mg_notes, mg_people;
    END IF;
  END IF;
END
$mig$;

COMMIT;
