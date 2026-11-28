-- The migration account requires the same trigger privileges as migration 003.
CREATE TABLE scheme_assignment_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  previous_scheme_id BIGINT UNSIGNED NULL,
  new_scheme_id BIGINT UNSIGNED NOT NULL,
  administrator_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_scheme_assignment_customer (customer_id, id),
  CONSTRAINT fk_scheme_assignment_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_scheme_assignment_previous FOREIGN KEY (previous_scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_assignment_new FOREIGN KEY (new_scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_assignment_admin FOREIGN KEY (administrator_id) REFERENCES users(id),
  CONSTRAINT chk_scheme_assignment_change CHECK (previous_scheme_id IS NULL OR previous_scheme_id <> new_scheme_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER scheme_assignment_history_no_update BEFORE UPDATE ON scheme_assignment_history FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Scheme assignment history is append-only';

CREATE TRIGGER scheme_assignment_history_no_delete BEFORE DELETE ON scheme_assignment_history FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Scheme assignment history is append-only';
