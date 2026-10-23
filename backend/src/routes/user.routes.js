const router = require('express').Router();
const controller = require("../controllers/user.controller.js");
const { authMiddleware, authorizeRoles } = require('../middlewares/auth.middleware.js');

//any user
router.post('/logout',controller.logout);
router.post('/login',controller.login);
router.post('/register',controller.register)


//logged in users only
router.post('/:id/reset-password',authMiddleware, controller.resetUserPassword)
router.get('/me',authMiddleware, controller.getMe);
router.patch('/me',authMiddleware, controller.updateMe)


//admin only
router.post('/create',authMiddleware,authorizeRoles('ADMIN'),controller.createUser);
router.get('/',authMiddleware,authorizeRoles('ADMIN'), controller.getUsers);
router.get('/:id',authMiddleware,authorizeRoles('ADMIN'), controller.getUserById)
router.patch('/:id',authMiddleware,authorizeRoles('ADMIN'), controller.updateUser)  
router.post('/me/change-password',authMiddleware,authorizeRoles('ADMIN'), controller.changePassword)

module.exports = router;