-- PayTeam financial core, adapted from the AquaPay reference. Requires MySQL
-- 8.0.16+ and users/roles/role_hierarchy from 001_initial_schema.sql. Monetary
-- balances and ledger values are paise.

CREATE TABLE IF NOT EXISTS schemes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  default_slot TINYINT GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN 1 ELSE NULL END) STORED,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schemes_name (name),
  UNIQUE KEY uq_schemes_default_slot (default_slot),
  KEY idx_schemes_status (status),
  CONSTRAINT chk_scheme_default_boolean CHECK (is_default IN (0, 1)),
  CONSTRAINT chk_scheme_default_active CHECK (is_default = 0 OR status = 'ACTIVE')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Serializes default-scheme changes across application instances. Seed row 1 is permanent.
CREATE TABLE IF NOT EXISTS scheme_control (
  id TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_scheme_control_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO scheme_control (id) VALUES (1) ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS services (
  service_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  provider_name VARCHAR(160) NULL COMMENT 'Confirmed display mapping only; not a provider endpoint or payload code.',
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_code),
  KEY idx_services_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS operators (
  operator_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (operator_code),
  KEY idx_operators_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS service_operators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operator_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_operator_code VARCHAR(80) NULL COMMENT 'Intentionally NULL until a provider-specific operator value is confirmed.',
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_operator (service_code, operator_code),
  CONSTRAINT fk_service_operators_service FOREIGN KEY (service_code) REFERENCES services(service_code),
  CONSTRAINT fk_service_operators_operator FOREIGN KEY (operator_code) REFERENCES operators(operator_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scheme_assignments (
  user_id BIGINT UNSIGNED NOT NULL,
  scheme_id BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY idx_scheme_assignments_scheme (scheme_id),
  CONSTRAINT fk_scheme_assignments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_scheme_assignments_scheme FOREIGN KEY (scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_assignments_actor FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scheme_assignment_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  old_scheme_id BIGINT UNSIGNED NULL,
  new_scheme_id BIGINT UNSIGNED NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_scheme_assignment_history_user (user_id, changed_at),
  CONSTRAINT fk_scheme_assignment_history_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_scheme_assignment_history_old FOREIGN KEY (old_scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_assignment_history_new FOREIGN KEY (new_scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_assignment_history_actor FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scheme_operator_configurations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scheme_id BIGINT UNSIGNED NOT NULL,
  service_operator_id BIGINT UNSIGNED NOT NULL,
  configuration_version INT UNSIGNED NOT NULL,
  service_charge_type ENUM('percentage', 'flat') NOT NULL,
  service_charge_value DECIMAL(12,2) NOT NULL COMMENT 'Exact decimal: percent points for percentage; INR for flat.',
  instant_charge_type ENUM('percentage', 'flat') NULL,
  instant_charge_value DECIMAL(12,2) NULL COMMENT 'Exact decimal: percent points for percentage; INR for flat.',
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  current_configuration_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN is_current = 1 THEN CONCAT(scheme_id, ':', service_operator_id) ELSE NULL END) STORED,
  effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TIMESTAMP NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scheme_operator_version (scheme_id, service_operator_id, configuration_version),
  UNIQUE KEY uq_scheme_current_configuration (current_configuration_key),
  KEY idx_scheme_operator_effective (scheme_id, service_operator_id, effective_from),
  CONSTRAINT chk_service_charge_nonnegative CHECK (service_charge_value >= 0),
  CONSTRAINT chk_instant_charge_nonnegative CHECK (instant_charge_value IS NULL OR instant_charge_value >= 0),
  CONSTRAINT chk_instant_charge_pair CHECK ((instant_charge_type IS NULL) = (instant_charge_value IS NULL)),
  CONSTRAINT chk_configuration_effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_configuration_current_boolean CHECK (is_current IN (0, 1)),
  CONSTRAINT fk_scheme_config_scheme FOREIGN KEY (scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_config_service_operator FOREIGN KEY (service_operator_id) REFERENCES service_operators(id),
  CONSTRAINT fk_scheme_config_actor FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A configured hierarchy level is a separately configured commission rate.
-- The application must validate each ancestor edge against role_hierarchy.
CREATE TABLE IF NOT EXISTS scheme_commission_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  configuration_id BIGINT UNSIGNED NOT NULL,
  hierarchy_level SMALLINT UNSIGNED NOT NULL,
  rate_type ENUM('percentage', 'flat') NOT NULL,
  rate_value DECIMAL(12,2) NOT NULL COMMENT 'Exact decimal: percent points for percentage; INR for flat.',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scheme_commission_level (configuration_id, hierarchy_level),
  CONSTRAINT chk_commission_level_positive CHECK (hierarchy_level > 0),
  CONSTRAINT chk_commission_rate_nonnegative CHECK (rate_value >= 0),
  CONSTRAINT fk_scheme_commission_configuration FOREIGN KEY (configuration_id) REFERENCES scheme_operator_configurations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wallets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'INR',
  balance_paise DECIMAL(20,0) UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Integer minor units only.',
  status ENUM('ACTIVE', 'FROZEN') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_user_currency (user_id, currency),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wallet_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('CREDIT', 'DEBIT') NOT NULL,
  amount_paise DECIMAL(20,0) UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'INR',
  source_type VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Logical reference to payment_transactions.request_id; file 001 precedes file 002.',
  posting_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_ledger_posting_key (posting_key),
  KEY idx_wallet_ledger_user_created (user_id, created_at),
  KEY idx_wallet_ledger_source (source_type, source_request_id),
  CONSTRAINT chk_wallet_ledger_amount_positive CHECK (amount_paise > 0),
  CONSTRAINT fk_wallet_ledger_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  CONSTRAINT fk_wallet_ledger_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS hierarchy_commission_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payee_user_id BIGINT UNSIGNED NOT NULL,
  configuration_id BIGINT UNSIGNED NOT NULL,
  hierarchy_level SMALLINT UNSIGNED NOT NULL,
  amount_paise DECIMAL(20,0) UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'INR',
  source_request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Logical reference to payment_transactions.request_id; uniqueness is enforced per posting key.',
  posting_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hierarchy_commission_posting_key (posting_key),
  KEY idx_hierarchy_commission_payee (payee_user_id, created_at),
  KEY idx_hierarchy_commission_source (source_request_id),
  CONSTRAINT chk_hierarchy_commission_positive CHECK (amount_paise > 0),
  CONSTRAINT fk_hierarchy_commission_payee FOREIGN KEY (payee_user_id) REFERENCES users(id),
  CONSTRAINT fk_hierarchy_commission_configuration FOREIGN KEY (configuration_id) REFERENCES scheme_operator_configurations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exact AquaPay catalogue. Only supplied provider mappings are populated.
INSERT INTO services (service_code, display_name, provider_name) VALUES
  ('Silver 1','Silver 1','Nixa Silver 1'),('DYNAMICQR','DYNAMICQR',NULL),('QRMTB','QRMTB',NULL),
  ('PREPAID','PREPAID',NULL),('POSFUNDREQUEST','POSFUNDREQUEST',NULL),('Premium 2','Premium 2',NULL),
  ('Premium 4','Premium 4',NULL),('Diamond 3','Diamond 3','Nixa Silver 2'),('RUPAYUPI','RUPAYUPI',NULL),
  ('UPIPAYOUT','UPIPAYOUT',NULL),('POSTPAID','POSTPAID',NULL),('NIXAPOS','NIXAPOS',NULL),
  ('Diamond 4','Diamond 4','Nixa Premium 3 / NixaSoft Premium PG 3'),('Silver 2','Silver 2',NULL),
  ('Silver 3','Silver 3','Nixa Silver 3'),('Payout','Payout',NULL),('CREDITCARD','CREDITCARD',NULL),
  ('DTH','DTH',NULL),('NIXACFPG5','NIXACFPG5',NULL),('Premium 5','Premium 5','Nixa Premium 4'),
  ('Diamond 2','Diamond 2',NULL),('Silver 4','Silver 4','Nixa Silver 4'),('MTB','MTB',NULL),
  ('BBPS','BBPS',NULL),('BBPSI','BBPSI',NULL),('NIXAPREMlUM2','NIXAPREMlUM2',NULL),
  ('Silver 5','Silver 5','Nixa Silver 5'),('Platinum 2','Platinum 2','Pinlab Yana Grocery')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), provider_name = VALUES(provider_name);

INSERT INTO operators (operator_code, display_name) VALUES
  ('MASTERCARD','MASTERCARD'),('RUPAY','RUPAY'),('VISA','VISA'),('UPI','UPI')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

INSERT INTO service_operators (service_code, operator_code) VALUES
  ('Diamond 4','MASTERCARD'),('Diamond 4','RUPAY'),('Diamond 4','VISA'),('Diamond 4','UPI')
ON DUPLICATE KEY UPDATE status = 'ACTIVE';

-- Fresh installations have one default; the unique generated slot prevents a second.
INSERT INTO schemes (name, status, is_default)
SELECT 'Default', 'ACTIVE', 1
WHERE NOT EXISTS (SELECT 1 FROM schemes WHERE is_default = 1);
