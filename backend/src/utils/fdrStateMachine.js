const transitions = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'],
  REJECTED: ['SUBMITTED'],
  RESUBMISSION_REQUIRED: ['SUBMITTED'],
  APPROVED: []
};

// Throws a normal error so controllers can return a consistent 409 response.
function assertTransition(from, to, isAdmin) {
  const allowed = transitions[from] || [];
  const adminDirect = isAdmin && from === 'SUBMITTED' && ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'].includes(to);
  if (!allowed.includes(to) && !adminDirect) {
    const error = new Error(`Cannot change status from ${from} to ${to}`);
    error.status = 409;
    throw error;
  }
}

module.exports = { assertTransition, transitions };
