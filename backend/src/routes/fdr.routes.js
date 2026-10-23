const router = require('express').Router();
const controller = require('../controllers/fdr.controller');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth.middleware');
const { uploadDocument, verifyFileSignature } = require('../middlewares/upload.middleware');

router.use(authMiddleware);
router.post('/', authorizeRoles('INSTITUTION'), uploadDocument, verifyFileSignature, controller.createFdr);
router.get('/', controller.getFdrs);
router.get('/stats', controller.getStats);
router.get('/:id', controller.getFdrById);
router.get('/:id/document', controller.downloadDocument);
router.get('/:id/audit-history', controller.getAuditHistory);
router.patch('/:id', authorizeRoles('INSTITUTION'), uploadDocument, verifyFileSignature, controller.updateFdr);
router.post('/:id/resubmit', authorizeRoles('INSTITUTION'), uploadDocument, verifyFileSignature, controller.resubmitFdr);
router.post('/:id/renew', authorizeRoles('INSTITUTION', 'ADMIN'), uploadDocument, verifyFileSignature, controller.renewFdr);
router.delete('/:id', authorizeRoles('INSTITUTION', 'ADMIN'), controller.deleteFdr);

module.exports = router;
