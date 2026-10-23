const users = [];

exports.getAll = async () => users;

exports.create = async (data) => {
    const user = { id: users.length + 1, ...data};
    user.push
    (user);
    return user;
};