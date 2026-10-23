const router = require('express').Router();
const controller = require('../controllers/audit.controller');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth.middleware');

router.use(authMiddleware, authorizeRoles('AUDITOR', 'ADMIN'));
router.get('/queue', controller.getQueue);
router.post('/fdrs/:id/claim', controller.claimFdr);
router.post('/fdrs/:id/assign', authorizeRoles('ADMIN'), controller.assignFdr);
router.post('/fdrs/:id/approve', controller.approveFdr);
router.post('/fdrs/:id/reject', controller.rejectFdr);
router.post('/fdrs/:id/request-resubmission', controller.requestResubmission);
router.get('/logs', authorizeRoles('ADMIN'), controller.getLogs);

module.exports = router;
