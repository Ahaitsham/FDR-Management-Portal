const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const userRoutes = require("./routes/user.routes.js");
const instituteRoutes = require("./routes/instituition.routes.js")
const fdrRoutes = require('./routes/fdr.routes');
const auditRoutes = require('./routes/audit.routes');
const { errorHandler, notFound } = require('./middlewares/error.middleware');
const cookieParser = require('cookie-parser');


const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser())


app.get('/', (req, res) => {
    res.json({ message: 'API is running'});
});

app.use('/api/users', userRoutes);
app.use('/api/institutions',instituteRoutes);
app.use('/api/fdrs', fdrRoutes);
app.use('/api/audit', auditRoutes);


app.use(notFound);
app.use(errorHandler);

module.exports = app;
