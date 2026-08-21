-- Adds password storage for sign-in.
--
-- Nullable on purpose: users created by an admin invite (status='invited')
-- have no password until they accept. Only status='active' users with a
-- non-null hash can sign in.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS password_hash text;
