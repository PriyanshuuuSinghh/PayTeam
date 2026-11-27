-- PayTeam B2C | 001_initial_schema.sql
-- Revised fresh-install baseline: direct registration, nullable contact verification and password + OTP login.
-- Derived from AquaPay's 12 SQL migrations; supersedes the unapplied earlier draft.
-- Oracle MySQL 8.0.16+ (CHECK enforcement); InnoDB; utf8mb4.
-- Run via database/migrate.js against a NEW payteam_kyc database only.
-- The runner owns schema_migrations. No customer data or passwords are seeded.
-- This is an immutable migration after successful application.
-- MySQL DDL implicitly commits; a failed initial run requires inspection.
-- KYC identifiers and bank account numbers must not be stored in plaintext.
-- Wallet rows are initialized during registration; money movement is not enabled.

-- 01. Master data and accounts

CREATE TABLE roles (
  id TINYINT UNSIGNED NOT NULL,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY name (name),
  UNIQUE KEY slug (slug)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE schemes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schemes_name (name),
  CONSTRAINT chk_schemes_status CHECK (status IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL, -- entered at registration; verified Aadhaar name in Step 2
  email VARCHAR(255) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  email_verified_at DATETIME(3) DEFAULT NULL,
  mobile_verified_at DATETIME(3) DEFAULT NULL,
  last_login_at DATETIME(3) DEFAULT NULL,
  company_id BIGINT UNSIGNED DEFAULT NULL,
  role_id TINYINT UNSIGNED NOT NULL,
  scheme_id BIGINT UNSIGNED DEFAULT NULL,
  parent_id BIGINT UNSIGNED DEFAULT NULL,
  shopname VARCHAR(150) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  state VARCHAR(100) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  pincode VARCHAR(10) DEFAULT NULL,
  profilepic VARCHAR(500) DEFAULT NULL,
  latitude DECIMAL(10,8) DEFAULT NULL,
  longitude DECIMAL(11,8) DEFAULT NULL,
  is_passwordchanged TINYINT(1) NOT NULL DEFAULT 0,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive', 'blocked')
    NOT NULL DEFAULT 'active',
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  admin_singleton TINYINT
    GENERATED ALWAYS AS (
      CASE WHEN role_id = 1 THEN 1 ELSE NULL END
    ) STORED,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email (email),
  UNIQUE KEY mobile (mobile),
  UNIQUE KEY admin_singleton (admin_singleton),
  KEY idx_users_parent_id (parent_id),
  KEY idx_users_role_id (role_id),
  KEY idx_users_company_id (company_id),
  KEY idx_users_scheme_id (scheme_id),
  KEY idx_users_status (status),
  KEY idx_users_created_at (created_at),
  KEY idx_users_role_status_created (role_id, status, created_at DESC, id DESC),
  KEY idx_users_created_id (created_at DESC, id DESC),
  CONSTRAINT fk_users_scheme
    FOREIGN KEY (scheme_id) REFERENCES schemes(id),

  CONSTRAINT chk_users_name
    CHECK (CHAR_LENGTH(TRIM(name)) > 0),

  CONSTRAINT chk_users_latitude
    CHECK (latitude BETWEEN -90 AND 90),

  CONSTRAINT chk_users_longitude
    CHECK (longitude BETWEEN -180 AND 180),

  CONSTRAINT chk_users_passwordchanged
    CHECK (is_passwordchanged IN (0, 1)),

  CONSTRAINT chk_users_role_scheme CHECK (
    (role_id = 1 AND scheme_id IS NULL)
    OR
    (role_id = 2 AND scheme_id IS NOT NULL)
  ),

  CONSTRAINT fk_users_company
    FOREIGN KEY (company_id) REFERENCES companies(id),

  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id) REFERENCES roles(id),

  CONSTRAINT fk_users_parent
    FOREIGN KEY (parent_id) REFERENCES users(id)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE user_wallets (
  user_id BIGINT UNSIGNED NOT NULL,
  mainbalance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  pgbalance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  qrbalance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  settlementwallet DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  lockamount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_wallets_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 02. Authentication security

CREATE TABLE auth_password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_password_reset_tokens_hash (token_hash),
  KEY idx_auth_password_reset_tokens_user (user_id, used_at, expires_at),
  KEY idx_auth_password_reset_tokens_expiry (expires_at),
  CONSTRAINT fk_auth_password_reset_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_rate_limits (
  bucket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  window_start DATETIME NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (bucket_hash, window_start),
  KEY idx_auth_rate_limits_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reserved for a future verified-contact registration flow.
-- Direct registration creates the user, wallet and KYC immediately.
-- Store SHA-256 of a randomly generated 256-bit registration bearer token.
CREATE TABLE auth_pending_registrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  registration_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified_at DATETIME(3) DEFAULT NULL,
  mobile_verified_at DATETIME(3) DEFAULT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pending_registration_token (registration_token_hash),
  KEY idx_pending_registration_expiry (expires_at),
  KEY idx_pending_registration_email (email, expires_at),
  KEY idx_pending_registration_mobile (mobile, expires_at),
  CONSTRAINT chk_pending_registration_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_pending_registration_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Reserved purpose-specific OTP records. Development login OTP uses Redis.
-- One current challenge per registration/channel or login/user; rotate on resend.
-- No access token may be issued merely because the password was correct.
CREATE TABLE auth_otp_challenges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purpose ENUM('registration_email', 'registration_mobile', 'login') NOT NULL,
  registration_id BIGINT UNSIGNED DEFAULT NULL,
  user_id BIGINT UNSIGNED DEFAULT NULL,
  login_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  channel ENUM('email', 'mobile') NOT NULL,
  destination_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  otp_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_version_snapshot INT UNSIGNED DEFAULT NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  flow_expires_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  delivered_at DATETIME(3) DEFAULT NULL,
  consumed_at DATETIME(3) DEFAULT NULL,
  invalidated_at DATETIME(3) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_otp_registration_purpose (registration_id, purpose),
  UNIQUE KEY uq_auth_otp_user_purpose (user_id, purpose),
  UNIQUE KEY uq_auth_otp_login_token (login_token_hash),
  KEY idx_auth_otp_expiry (flow_expires_at),
  CONSTRAINT fk_auth_otp_registration FOREIGN KEY (registration_id)
    REFERENCES auth_pending_registrations(id),
  CONSTRAINT fk_auth_otp_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT chk_auth_otp_scope CHECK (
    (purpose = 'registration_email' AND channel = 'email' AND registration_id IS NOT NULL
      AND user_id IS NULL AND login_token_hash IS NULL AND token_version_snapshot IS NULL)
    OR
    (purpose = 'registration_mobile' AND channel = 'mobile' AND registration_id IS NOT NULL
      AND user_id IS NULL AND login_token_hash IS NULL AND token_version_snapshot IS NULL)
    OR
    (purpose = 'login' AND registration_id IS NULL AND user_id IS NOT NULL
      AND login_token_hash IS NOT NULL AND token_version_snapshot IS NOT NULL)
  ),
  CONSTRAINT chk_auth_otp_attempts CHECK (max_attempts BETWEEN 1 AND 10 AND attempts <= max_attempts),
  CONSTRAINT chk_auth_otp_expiry CHECK (expires_at <= flow_expires_at),
  CONSTRAINT chk_auth_otp_terminal CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 03. Seven-step KYC

CREATE TABLE kyc_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  business_type VARCHAR(100) DEFAULT NULL,

  status ENUM(
    'draft',
    'pending',
    'submitted',
    'under_review',
    'approved',
    'rejected'
  ) NOT NULL DEFAULT 'pending',
  current_step TINYINT UNSIGNED NOT NULL DEFAULT 1,
  steps_completed TINYINT UNSIGNED NOT NULL DEFAULT 0,
  submitted_at DATETIME DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  rejection_reason VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kyc_cases_user (user_id),
  KEY idx_kyc_cases_status_reviewed_at (status, reviewed_at),
  KEY idx_kyc_cases_status_submitted_at_id (status, submitted_at DESC, id DESC),
  KEY idx_kyc_cases_user_status (user_id, status),
  KEY idx_kyc_cases_status_created (status, created_at),
  CONSTRAINT fk_kyc_cases_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT chk_kyc_cases_current_step CHECK (current_step BETWEEN 1 AND 7),
  CONSTRAINT chk_kyc_cases_steps_completed
    CHECK (steps_completed BETWEEN 0 AND 7)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kyc_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  step_number TINYINT UNSIGNED NOT NULL,
  status ENUM(
    'pending',
    'in_progress',
    'completed',
    'failed'
  ) NOT NULL DEFAULT 'pending',
  completed_at DATETIME DEFAULT NULL,
  failure_code VARCHAR(100) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kyc_steps_case_step (case_id, step_number),
  CONSTRAINT fk_kyc_steps_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_kyc_steps_step_number
    CHECK (step_number BETWEEN 1 AND 7)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kyc_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  verification_type ENUM('aadhaar', 'pan') NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_reference VARCHAR(255) DEFAULT NULL,
  status ENUM(
    'pending',
    'verified',
    'failed'
  ) NOT NULL DEFAULT 'pending',
  masked_identifier VARCHAR(32) DEFAULT NULL,
  verified_name VARCHAR(150) DEFAULT NULL,
  failure_code VARCHAR(100) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kyc_verifications_case_type (case_id, verification_type),
  KEY idx_kyc_verifications_provider_ref (provider, provider_reference),
  CONSTRAINT fk_kyc_verifications_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE bank_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  account_holder_name VARCHAR(150) NOT NULL,
  bank_name VARCHAR(150) DEFAULT NULL,
  ifsc_code VARCHAR(11) NOT NULL,
  account_number_encrypted VARBINARY(512) NOT NULL,
  account_number_last4 CHAR(4) NOT NULL,
  verification_status ENUM(
    'pending',
    'verified',
    'failed'
  ) NOT NULL DEFAULT 'pending',
  provider_reference VARCHAR(255) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bank_accounts_case (case_id),
  CONSTRAINT fk_bank_accounts_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE media_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  asset_type ENUM(
    'shop_image',
    'selfie',
    'consent_video'
  ) NOT NULL,
  storage_provider VARCHAR(50) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  status ENUM(
    'uploaded',
    'verified',
    'rejected'
  ) NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_assets_case_type (case_id, asset_type),
  CONSTRAINT fk_media_assets_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agreement_acceptances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  agreement_code VARCHAR(100) NOT NULL,
  agreement_version VARCHAR(50) NOT NULL,
  accepted_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agreement_case_version (
    case_id,
    agreement_code,
    agreement_version
  ),
  CONSTRAINT fk_agreement_acceptances_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kyc_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(30) DEFAULT NULL,
  new_status VARCHAR(30) NOT NULL,
  actor_user_id BIGINT UNSIGNED DEFAULT NULL,
  reason VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kyc_status_history_case_time (case_id, created_at),
  CONSTRAINT fk_kyc_status_history_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_kyc_status_history_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kyc_identity_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  case_id BIGINT UNSIGNED NOT NULL,
  verification_id BIGINT UNSIGNED NOT NULL,
  identity_type ENUM('aadhaar', 'pan') NOT NULL,
  payload_ciphertext MEDIUMBLOB NOT NULL,
  payload_iv BINARY(12) NOT NULL,
  payload_authentication_tag BINARY(16) NOT NULL,
  encryption_key_version SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kyc_identity_data_case_type (case_id, identity_type),
  UNIQUE KEY uq_kyc_identity_data_verification (verification_id),
  KEY idx_kyc_identity_data_user_case (user_id, case_id),
  CONSTRAINT fk_kyc_identity_data_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_kyc_identity_data_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_kyc_identity_data_verification
    FOREIGN KEY (verification_id) REFERENCES kyc_verifications(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kyc_digilocker_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  case_id BIGINT UNSIGNED NOT NULL,
  verification_id BIGINT UNSIGNED NOT NULL,
  verification_type ENUM('aadhaar', 'pan') NOT NULL,
  provider VARCHAR(50) NOT NULL,
  authorization_session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  authorization_state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  authorization_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  code_verifier_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  state_expires_at DATETIME(3) NOT NULL,
  status ENUM('pending', 'processing', 'verified', 'failed', 'expired') NOT NULL DEFAULT 'pending',
  current_stage VARCHAR(40) NOT NULL DEFAULT 'authorization_pending',
  provider_init_status VARCHAR(40) DEFAULT NULL,
  provider_init_code VARCHAR(32) DEFAULT NULL,
  provider_init_metadata JSON DEFAULT NULL,
  reference_key_ciphertext MEDIUMBLOB DEFAULT NULL,
  reference_key_iv BINARY(12) DEFAULT NULL,
  reference_key_authentication_tag BINARY(16) DEFAULT NULL,
  reference_key_version SMALLINT UNSIGNED DEFAULT NULL,
  reference_expires_at DATETIME(3) DEFAULT NULL,
  failure_code VARCHAR(100) DEFAULT NULL,
  consumed_at DATETIME(3) DEFAULT NULL,
  verified_at DATETIME(3) DEFAULT NULL,
  active_verification_id BIGINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE WHEN status IN ('pending', 'processing') THEN verification_id ELSE NULL END
    ) STORED,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_kyc_digilocker_session_uuid (session_uuid),
  UNIQUE KEY uq_kyc_digilocker_state_hash (authorization_state_hash),
  UNIQUE KEY uq_kyc_digilocker_active_verification (active_verification_id),
  KEY idx_kyc_digilocker_user_case (user_id, case_id, verification_type, created_at),
  KEY idx_kyc_digilocker_verification (verification_id, created_at),
  KEY idx_kyc_digilocker_expiry (status, state_expires_at),
  CONSTRAINT fk_kyc_digilocker_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_kyc_digilocker_case
    FOREIGN KEY (case_id) REFERENCES kyc_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_kyc_digilocker_verification
    -- verification_id is the base column of active_verification_id, a stored
    -- generated column. MySQL prohibits cascading actions on such base columns.
    -- Restrict deletion while a session references the verification instead.
    FOREIGN KEY (verification_id) REFERENCES kyc_verifications(id),
  CONSTRAINT chk_kyc_digilocker_reference_key_parts
    CHECK (
      (reference_key_ciphertext IS NULL AND reference_key_iv IS NULL AND
       reference_key_authentication_tag IS NULL AND reference_key_version IS NULL)
      OR
      (reference_key_ciphertext IS NOT NULL AND reference_key_iv IS NOT NULL AND
       reference_key_authentication_tag IS NOT NULL AND reference_key_version IS NOT NULL)
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- 04. Operational monitoring

CREATE TABLE api_request_metrics (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bucket_hour DATETIME NOT NULL,
  total_requests INT UNSIGNED NOT NULL DEFAULT 0,
  error_5xx_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_4xx_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_latency_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  mysql_latency_ms INT UNSIGNED NULL,
  redis_latency_ms INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bucket_hour (bucket_hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 05. Initial master data (part of the baseline, not a separate migration)
-- No admin account is created here. Provision it via the secure setup flow.
START TRANSACTION;
INSERT INTO roles (id, name, slug) VALUES
  (1, 'Admin', 'AD'),
  (2, 'User', 'US');
INSERT INTO companies (id, name) VALUES (1, 'PayTeam');
INSERT INTO schemes (id, name, status) VALUES (1, 'Default Scheme', 1);
COMMIT;
