exports.notFound = (req, res) => {
    res.status(404).json({ message: 'route not found'});
};

exports.errorHandler = (err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        message: err.message || 'internal server error',
    });
};