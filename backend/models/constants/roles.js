
const ROLES = [
  { slug: "AD", name: "Admin", level: 0 },
  { slug: "US", name: "User", level: 1 },
];

// Returns the immediate next child role.
function getChildSlug(slug) {
  void slug;
  return null;
}

// Returns all roles below the given role in the hierarchy.
function getChildSlugs() {
  return [];
}

export {
  ROLES,
  getChildSlug,
  getChildSlugs,
};

export default {
  ROLES,
  getChildSlug,
  getChildSlugs,
};
