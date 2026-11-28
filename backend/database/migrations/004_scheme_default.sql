-- The existing registration default is scheme 1. Verify it is active before applying.
ALTER TABLE schemes ADD UNIQUE KEY uq_schemes_id_status (id, status);

CREATE TABLE scheme_default (
  singleton_id TINYINT UNSIGNED NOT NULL,
  scheme_id BIGINT UNSIGNED NOT NULL,
  scheme_status TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (singleton_id),
  CONSTRAINT chk_scheme_default_singleton CHECK (singleton_id = 1),
  CONSTRAINT chk_scheme_default_active CHECK (scheme_status = 1),
  CONSTRAINT fk_scheme_default_active FOREIGN KEY (scheme_id, scheme_status) REFERENCES schemes(id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO scheme_default (singleton_id, scheme_id) VALUES (1, 1);
