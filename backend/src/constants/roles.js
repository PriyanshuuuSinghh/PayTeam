const ROLES = [
  { slug: "AD", name: "Admin", level: 0 },
  { slug: "US", name: "User", level: 1 },
];

function getRole(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();
  return (
    ROLES.find(
      (r) =>
        r.slug.toLowerCase() === str ||
        r.name.toLowerCase() === str ||
        (r.aliases && r.aliases.some((a) => a.toLowerCase() === str)),
    ) || null
  );
}

function getChildSlug(slug) {
  getRole(slug);
  return null;
}

function canCreateChildRole() {
  return false;
}

function getRoleBySlug(slug) {
  return getRole(slug);
}

function getRoleByName(name) {
  return getRole(name);
}

export {
  ROLES,
  getRole,
  getChildSlug,
  canCreateChildRole,
  getRoleBySlug,
  getRoleByName,
};

export default {
  ROLES,
  getRole,
  getChildSlug,
  canCreateChildRole,
  getRoleBySlug,
  getRoleByName,
};
