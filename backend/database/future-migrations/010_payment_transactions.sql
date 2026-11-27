-- Shared product transaction persistence. Requires 009_financial_core.sql and the
-- users table. Payment and settlement states are intentionally separate. This
-- provider/payment layer is an AquaPay reference pending PayTeam approval and is
-- not a Phase 0 service.

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'Authenticated account that owns the status resource and wallet operation.',
  initiator_user_id BIGINT UNSIGNED NOT NULL COMMENT 'Server-authenticated actor; never supplied by request body.',
  customer_user_id BIGINT UNSIGNED NULL COMMENT 'Set only when trusted account resolution exists; not inferred from customer contact fields.',
  operation VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  gateway VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'AquaPay-generated provider correlation reference.',
  gateway_order_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  txn_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'Separate identifier; ownership/generation remains provider/business-defined.',
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  idempotency_payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount_paise DECIMAL(20,0) UNSIGNED NULL COMMENT 'Exact integer paise; nullable only for products before amount enquiry resolves.',
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'INR',
  status ENUM('PENDING', 'UNKNOWN', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
  initiation_status_code VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
  settlement_status ENUM('UNCONFIRMED', 'SETTLEMENT_PENDING', 'SETTLED', 'SETTLEMENT_FAILED', 'NOT_APPLICABLE') NOT NULL DEFAULT 'UNCONFIRMED',
  intended_settlement_mode ENUM('T_PLUS_1', 'INSTANT', 'NOT_APPLICABLE') NOT NULL DEFAULT 'NOT_APPLICABLE',
  settlement_amount_paise DECIMAL(20,0) UNSIGNED NULL,
  service_charge_paise DECIMAL(20,0) UNSIGNED NOT NULL DEFAULT 0,
  instant_charge_paise DECIMAL(20,0) UNSIGNED NOT NULL DEFAULT 0,
  payment_url TEXT NULL,
  payment_mode VARCHAR(40) NULL,
  utr VARCHAR(128) NULL,
  provider_reference VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  scheme_id BIGINT UNSIGNED NULL,
  scheme_configuration_id BIGINT UNSIGNED NULL,
  service_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  operator_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  configuration_snapshot JSON NULL,
  charges_snapshot JSON NULL,
  gateway_response JSON NULL COMMENT 'Sanitized response fields only; never credentials or raw request/response bodies.',
  reconciliation_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_transaction_owner (id, user_id),
  UNIQUE KEY uq_payment_idempotency (user_id, operation, idempotency_key),
  UNIQUE KEY uq_payment_request_id (request_id),
  UNIQUE KEY uq_payment_request_scope (gateway, operation, request_id),
  UNIQUE KEY uq_payment_gateway_order (gateway, operation, gateway_order_id),
  UNIQUE KEY uq_payment_gateway_txn (gateway, operation, txn_id),
  KEY idx_payment_owner_status (user_id, status, created_at),
  KEY idx_payment_initiator_created (initiator_user_id, created_at),
  KEY idx_payment_reconciliation (reconciliation_required, status, updated_at),
  KEY idx_payment_provider_reference (gateway, operation, provider_reference),
  CONSTRAINT chk_payment_amount_positive CHECK (amount_paise IS NULL OR amount_paise > 0),
  CONSTRAINT chk_payment_charges_nonnegative CHECK (service_charge_paise >= 0 AND instant_charge_paise >= 0),
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_payment_initiator FOREIGN KEY (initiator_user_id) REFERENCES users(id),
  CONSTRAINT fk_payment_customer_user FOREIGN KEY (customer_user_id) REFERENCES users(id),
  CONSTRAINT fk_payment_scheme FOREIGN KEY (scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_payment_scheme_configuration FOREIGN KEY (scheme_configuration_id) REFERENCES scheme_operator_configurations(id),
  CONSTRAINT fk_payment_service_operator FOREIGN KEY (service_code, operator_code) REFERENCES service_operators(service_code, operator_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- File 001 cannot reference this later table. Add the reverse payment links now.
SET @wallet_payment_fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_ledger_entries'
     AND CONSTRAINT_NAME = 'fk_wallet_ledger_payment_request'
);
SET @wallet_payment_fk_sql = IF(@wallet_payment_fk_exists = 0,
  'ALTER TABLE wallet_ledger_entries ADD CONSTRAINT fk_wallet_ledger_payment_request FOREIGN KEY (source_request_id) REFERENCES payment_transactions(request_id)',
  'SELECT 1');
PREPARE aquapay_wallet_payment_fk FROM @wallet_payment_fk_sql;
EXECUTE aquapay_wallet_payment_fk;
DEALLOCATE PREPARE aquapay_wallet_payment_fk;

SET @commission_payment_fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'hierarchy_commission_entries'
     AND CONSTRAINT_NAME = 'fk_hierarchy_commission_payment_request'
);
SET @commission_payment_fk_sql = IF(@commission_payment_fk_exists = 0,
  'ALTER TABLE hierarchy_commission_entries ADD CONSTRAINT fk_hierarchy_commission_payment_request FOREIGN KEY (source_request_id) REFERENCES payment_transactions(request_id)',
  'SELECT 1');
PREPARE aquapay_commission_payment_fk FROM @commission_payment_fk_sql;
EXECUTE aquapay_commission_payment_fk;
DEALLOCATE PREPARE aquapay_commission_payment_fk;

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_transaction_id BIGINT UNSIGNED NULL,
  gateway VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  gateway_order_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sanitized_payload JSON NULL COMMENT 'PII fields are excluded by application before persistence; raw bodies must not be stored or logged.',
  authentication_verified TINYINT(1) NOT NULL DEFAULT 0,
  processing_status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_webhook_fingerprint (gateway, event_fingerprint),
  KEY idx_payment_webhook_request (gateway, request_id, received_at),
  KEY idx_payment_webhook_processing (processing_status, received_at),
  CONSTRAINT fk_payment_webhook_transaction FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_settlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_transaction_id BIGINT UNSIGNED NOT NULL,
  gateway VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_settlement_reference VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  settlement_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('PENDING', 'SETTLED', 'FAILED', 'UNKNOWN') NOT NULL,
  amount_paise DECIMAL(20,0) UNSIGNED NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'INR',
  evidence_type VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  evidence_reference VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_settlement_fingerprint (gateway, settlement_fingerprint),
  KEY idx_payment_settlement_provider_ref (gateway, provider_settlement_reference),
  KEY idx_payment_settlement_transaction (payment_transaction_id, created_at),
  CONSTRAINT fk_payment_settlement_transaction FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_reconciliation_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_transaction_id BIGINT UNSIGNED NOT NULL,
  attempt_number INT UNSIGNED NOT NULL,
  status ENUM('STARTED', 'MATCHED', 'UNRESOLVED', 'FAILED') NOT NULL,
  capability VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  evidence_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  sanitized_result JSON NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_reconciliation_attempt (payment_transaction_id, attempt_number),
  KEY idx_payment_reconciliation_attempt_status (status, attempted_at),
  CONSTRAINT fk_payment_reconciliation_transaction FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payout_beneficiaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  gateway VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_beneficiary_reference VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  display_name VARCHAR(120) NULL,
  masked_account_reference VARCHAR(80) NULL COMMENT 'Masked display value only; never a raw bank account.',
  verification_status ENUM('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'FAILED', 'UNKNOWN') NOT NULL DEFAULT 'NOT_VERIFIED',
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_beneficiary_owner (id, user_id),
  UNIQUE KEY uq_beneficiary_provider_reference (user_id, gateway, provider_beneficiary_reference),
  KEY idx_beneficiary_owner_status (user_id, status),
  CONSTRAINT fk_payout_beneficiary_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payouts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_transaction_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  beneficiary_id BIGINT UNSIGNED NOT NULL,
  provider_reference VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_payment_transaction (payment_transaction_id),
  KEY idx_payout_owner_created (user_id, created_at),
  CONSTRAINT fk_payout_payment_owner FOREIGN KEY (payment_transaction_id, user_id) REFERENCES payment_transactions(id, user_id),
  CONSTRAINT fk_payout_beneficiary_owner FOREIGN KEY (beneficiary_id, user_id) REFERENCES payout_beneficiaries(id, user_id),
  CONSTRAINT fk_payout_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS credit_card_bill_enquiries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  idempotency_payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_reference_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Hash only; customer/card reference plaintext is not persisted.',
  status ENUM('PENDING', 'COMPLETED', 'FAILED', 'UNKNOWN') NOT NULL DEFAULT 'PENDING',
  snapshot JSON NULL COMMENT 'Normalized provider enquiry response; never raw request/response body.',
  reconciliation_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bill_enquiry_owner (id, user_id),
  UNIQUE KEY uq_bill_enquiry_owner_idempotency (user_id, idempotency_key),
  UNIQUE KEY uq_bill_enquiry_request (request_id),
  KEY idx_bill_enquiry_owner_status (user_id, status, created_at),
  CONSTRAINT fk_bill_enquiry_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS credit_card_bill_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_transaction_id BIGINT UNSIGNED NOT NULL,
  enquiry_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  provider_reference VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bill_payment_transaction (payment_transaction_id),
  UNIQUE KEY uq_bill_payment_enquiry_owner (enquiry_id, user_id, payment_transaction_id),
  KEY idx_bill_payment_owner_created (user_id, created_at),
  CONSTRAINT fk_bill_payment_transaction_owner FOREIGN KEY (payment_transaction_id, user_id) REFERENCES payment_transactions(id, user_id),
  CONSTRAINT fk_bill_payment_enquiry_owner FOREIGN KEY (enquiry_id, user_id) REFERENCES credit_card_bill_enquiries(id, user_id),
  CONSTRAINT fk_bill_payment_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
