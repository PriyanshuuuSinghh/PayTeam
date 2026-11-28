-- The migration account must be permitted to create and retain trigger definers.
-- On servers with binary logging, confirm trigger creation requirements before running.
ALTER TABLE schemes
  ADD COLUMN code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN description VARCHAR(500) NULL,
  ADD COLUMN created_by BIGINT UNSIGNED NULL,
  ADD COLUMN updated_by BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_schemes_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  ADD CONSTRAINT fk_schemes_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

-- The ID makes the backfill unique, and the LEGACY- prefix is reserved by the API.
UPDATE schemes SET code = CONCAT('LEGACY-', id), updated_at = updated_at WHERE code IS NULL;

ALTER TABLE schemes
  MODIFY code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ADD UNIQUE KEY uq_schemes_code (code),
  ADD CONSTRAINT chk_schemes_code CHECK (REGEXP_LIKE(code, '^[A-Z][A-Z0-9_-]*$', 'c'));

CREATE TABLE scheme_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scheme_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  status ENUM('draft', 'published', 'retired') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  published_by BIGINT UNSIGNED NULL,
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scheme_versions_number (scheme_id, version_number),
  UNIQUE KEY uq_scheme_versions_owner (scheme_id, id),
  CONSTRAINT fk_scheme_versions_scheme FOREIGN KEY (scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_scheme_versions_published_by FOREIGN KEY (published_by) REFERENCES users(id),
  CONSTRAINT chk_scheme_versions_number CHECK (version_number > 0),
  CONSTRAINT chk_scheme_versions_publication CHECK (
    (status = 'draft' AND published_by IS NULL AND published_at IS NULL)
    OR (status IN ('published', 'retired') AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE scheme_services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scheme_version_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scheme_services_version_service (scheme_version_id, service_id),
  KEY idx_scheme_services_service (service_id),
  CONSTRAINT fk_scheme_services_version FOREIGN KEY (scheme_version_id) REFERENCES scheme_versions(id),
  CONSTRAINT fk_scheme_services_service FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT chk_scheme_services_status CHECK (status IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE scheme_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scheme_id BIGINT UNSIGNED NOT NULL,
  scheme_version_id BIGINT UNSIGNED NULL,
  administrator_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  previous_state JSON NULL,
  new_state JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_scheme_audit_scheme (scheme_id, id),
  CONSTRAINT fk_scheme_audit_scheme FOREIGN KEY (scheme_id) REFERENCES schemes(id),
  CONSTRAINT fk_scheme_audit_version FOREIGN KEY (scheme_id, scheme_version_id) REFERENCES scheme_versions(scheme_id, id),
  CONSTRAINT fk_scheme_audit_administrator FOREIGN KEY (administrator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER scheme_versions_insert_draft BEFORE INSERT ON scheme_versions FOR EACH ROW
BEGIN
  IF NEW.status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New scheme versions must begin as drafts';
  END IF;
END;

CREATE TRIGGER scheme_versions_guard_update BEFORE UPDATE ON scheme_versions FOR EACH ROW
BEGIN
  IF NEW.id <> OLD.id OR NEW.scheme_id <> OLD.scheme_id OR NEW.version_number <> OLD.version_number
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
     OR OLD.status = 'retired'
     OR (OLD.status = 'draft' AND NEW.status = 'retired')
     OR (OLD.status = 'published' AND (
       NEW.status <> 'retired' OR NOT (NEW.published_by <=> OLD.published_by)
       OR NOT (NEW.published_at <=> OLD.published_at)
     )) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid scheme version change';
  END IF;
END;

CREATE TRIGGER scheme_versions_guard_delete BEFORE DELETE ON scheme_versions FOR EACH ROW
BEGIN
  IF OLD.status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published scheme versions cannot be deleted';
  END IF;
END;

CREATE TRIGGER scheme_services_guard_insert BEFORE INSERT ON scheme_services FOR EACH ROW
BEGIN
  DECLARE version_status VARCHAR(9);
  SELECT status INTO version_status FROM scheme_versions WHERE id = NEW.scheme_version_id FOR UPDATE;
  IF version_status IS NOT NULL AND version_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only draft service configurations can change';
  END IF;
END;

CREATE TRIGGER scheme_services_guard_update BEFORE UPDATE ON scheme_services FOR EACH ROW
BEGIN
  DECLARE version_status VARCHAR(9);
  SELECT status INTO version_status FROM scheme_versions WHERE id = OLD.scheme_version_id FOR UPDATE;
  IF version_status <> 'draft' OR NEW.id <> OLD.id OR NEW.scheme_version_id <> OLD.scheme_version_id
     OR NEW.service_id <> OLD.service_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only draft service configuration status can change';
  END IF;
END;

CREATE TRIGGER scheme_services_guard_delete BEFORE DELETE ON scheme_services FOR EACH ROW
BEGIN
  DECLARE version_status VARCHAR(9);
  SELECT status INTO version_status FROM scheme_versions WHERE id = OLD.scheme_version_id FOR UPDATE;
  IF version_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only draft service configurations can change';
  END IF;
END;

CREATE TRIGGER scheme_audit_events_no_update BEFORE UPDATE ON scheme_audit_events FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Scheme audit events are append-only';

CREATE TRIGGER scheme_audit_events_no_delete BEFORE DELETE ON scheme_audit_events FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Scheme audit events are append-only';
