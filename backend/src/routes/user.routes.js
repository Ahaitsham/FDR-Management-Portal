const router = require('express').Router();
const controller = require("../controllers/user.controller");

router.get('/', controller.getUsers);
router.post('/', controller.createUser);

module.exports = router;