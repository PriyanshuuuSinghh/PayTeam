
-- PayTeam roles for a fresh independent database. Parent/hierarchy assignments
-- are not used by the B2C AD/US role model.

-- Seed the eight roles with their agreed IDs and slugs.
INSERT INTO roles (id, name, slug) VALUES
  (1, 'Admin', 'AD'),
  (2, 'User', 'US')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  slug = VALUES(slug);
