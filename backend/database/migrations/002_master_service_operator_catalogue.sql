CREATE TABLE services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(500) NULL,
  status TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_code (code),
  KEY idx_services_status_order (status, display_order, id),
  CONSTRAINT chk_services_code CHECK (CHAR_LENGTH(code) > 0 AND CHAR_LENGTH(code) = CHAR_LENGTH(TRIM(code))),
  CONSTRAINT chk_services_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_services_status CHECK (status IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE operators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(64) NOT NULL,
  operator_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operators_code (code),
  KEY idx_operators_status_code (status, code),
  CONSTRAINT chk_operators_code CHECK (CHAR_LENGTH(code) > 0 AND CHAR_LENGTH(code) = CHAR_LENGTH(TRIM(code))),
  CONSTRAINT chk_operators_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_operators_type CHECK (operator_type IN ('CARD_NETWORK', 'TRANSFER_CHANNEL', 'PAYMENT_METHOD')),
  CONSTRAINT chk_operators_status CHECK (status IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE service_operators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id BIGINT UNSIGNED NOT NULL,
  operator_id BIGINT UNSIGNED NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_operators_pair (service_id, operator_id),
  KEY idx_service_operators_service_order (service_id, display_order, id),
  KEY idx_service_operators_service_status_order (service_id, status, display_order, id),
  KEY idx_service_operators_operator (operator_id, status),
  CONSTRAINT fk_service_operators_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_service_operators_operator FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE RESTRICT,
  CONSTRAINT chk_service_operators_status CHECK (status IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Frozen bootstrap snapshot of src/modules/schemes/serviceCatalogue.js.
-- Only repository-verified Diamond 4 mappings are active for catalogue reads.
INSERT INTO services (code, name, status, display_order) VALUES
  ('Silver 1', 'Silver 1', 0, 1),
  ('DYNAMICQR', 'DYNAMICQR', 0, 2),
  ('QRMTB', 'QRMTB', 0, 3),
  ('PREPAID', 'PREPAID', 0, 4),
  ('POSFUNDREQUEST', 'POSFUNDREQUEST', 0, 5),
  ('Premium 2', 'Premium 2', 0, 6),
  ('Premium 4', 'Premium 4', 0, 7),
  ('Diamond 3', 'Diamond 3', 0, 8),
  ('RUPAYUPI', 'RUPAYUPI', 0, 9),
  ('UPIPAYOUT', 'UPIPAYOUT', 0, 10),
  ('POSTPAID', 'POSTPAID', 0, 11),
  ('NIXAPOS', 'NIXAPOS', 0, 12),
  ('Diamond 4', 'Diamond 4', 1, 13),
  ('Silver 2', 'Silver 2', 0, 14),
  ('Silver 3', 'Silver 3', 0, 15),
  ('Payout', 'Payout', 0, 16),
  ('CREDITCARD', 'CREDITCARD', 0, 17),
  ('DTH', 'DTH', 0, 18),
  ('NIXACFPG5', 'NIXACFPG5', 0, 19),
  ('Premium 5', 'Premium 5', 0, 20),
  ('Diamond 2', 'Diamond 2', 0, 21),
  ('Silver 4', 'Silver 4', 0, 22),
  ('MTB', 'MTB', 0, 23),
  ('BBPS', 'BBPS', 0, 24),
  ('BBPSI', 'BBPSI', 0, 25),
  ('NIXAPREMlUM2', 'NIXAPREMlUM2', 0, 26),
  ('Silver 5', 'Silver 5', 0, 27),
  ('Platinum 2', 'Platinum 2', 0, 28);

INSERT INTO operators (code, name, operator_type, status) VALUES
  ('MASTERCARD', 'Mastercard', 'CARD_NETWORK', 1),
  ('RUPAY', 'RuPay', 'CARD_NETWORK', 1),
  ('VISA', 'Visa', 'CARD_NETWORK', 1),
  ('UPI', 'UPI', 'TRANSFER_CHANNEL', 1);

INSERT INTO service_operators (service_id, operator_id, status, display_order)
SELECT services.id, operators.id, 1,
  CASE operators.code
    WHEN 'MASTERCARD' THEN 1
    WHEN 'RUPAY' THEN 2
    WHEN 'VISA' THEN 3
    WHEN 'UPI' THEN 4
  END
FROM services
CROSS JOIN operators
WHERE services.code = 'Diamond 4'
  AND operators.code IN ('MASTERCARD', 'RUPAY', 'VISA', 'UPI');
