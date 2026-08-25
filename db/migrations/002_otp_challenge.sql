-- One table for both signup verification and password reset — same
-- mechanism either way: a time-limited, attempt-limited code tied to an
-- email. See lib/auth/otp.ts.
--
-- Signup payload (org_name, name, password_hash) sits on the challenge
-- itself because the app_user row does not exist yet — nothing to attach it
-- to until the code is verified. Reset carries user_id instead, since that
-- account already exists.
CREATE TABLE otp_challenge (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose       text NOT NULL CHECK (purpose IN ('signup', 'reset')),
  email         text NOT NULL,
  otp_hash      text NOT NULL,

  -- signup only
  org_name      text,
  name          text,
  password_hash text,

  -- reset only
  user_id       uuid REFERENCES app_user(id) ON DELETE CASCADE,

  attempts      int NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- requesting a new code for the same email+purpose replaces the old one
  -- rather than piling up rows — "resend" is just calling create again
  UNIQUE (email, purpose)
);
