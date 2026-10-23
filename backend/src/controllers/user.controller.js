const userService = require('../services/user.service');

exports.getUsers = async (req, res, next) => {
    try {
        const users = await userService.getAll();
        res.json(users);
    } catch (err) {
        next(err);
    }
};

exports.createUser = async (req, res, next) => {
    try {
        const user = await userService.create(req.body);
        res.status(201).json(user);
    } catch (err) {
        next(err);
    }
};