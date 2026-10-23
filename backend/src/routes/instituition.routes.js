const router = require('express').Router();

const { createInstitution, getInstitutions, getInstitutionById, updateInstitution, getPublicInstitutions } = require('../controllers/instituition.controller.js');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth.middleware.js');

router.get('/public', getPublicInstitutions); 

router.post('/', authMiddleware, authorizeRoles('ADMIN'), createInstitution);
router.get('/', authMiddleware, authorizeRoles('ADMIN', 'AUDITOR'), getInstitutions);
router.get('/:id', authMiddleware, authorizeRoles('ADMIN', 'AUDITOR'), getInstitutionById);
router.patch('/:id', authMiddleware, authorizeRoles('ADMIN'), updateInstitution);

module.exports = router;