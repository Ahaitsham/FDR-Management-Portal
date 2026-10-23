const Institution = require('../models/Institution');

// Returns the institution filter for an auditor's configured scope.
async function getAuditorScopeFilter(user) {
  const scope = user.auditScope || {};
  const states = Array.isArray(scope.states) ? scope.states.filter(Boolean) : [];
  const institutions = Array.isArray(scope.institutions) ? scope.institutions.filter(Boolean) : [];

  if (!states.length && !institutions.length) return {};

  const stateInstitutions = states.length
    ? await Institution.find({ 'address.state': { $in: states } }).select('_id').lean()
    : [];
  const ids = [...institutions.map(String), ...stateInstitutions.map(item => String(item._id))];
  return { institution: { $in: [...new Set(ids)] } };
}

async function canAuditorAccess(user, fdr) {
  const filter = await getAuditorScopeFilter(user);
  if (!filter.institution) return true;
  return filter.institution.$in.map(String).includes(String(fdr.institution._id || fdr.institution));
}

module.exports = { getAuditorScopeFilter, canAuditorAccess };
