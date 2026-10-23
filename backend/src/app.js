const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require("./routes");
const { errorHandler, notFound } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'API is running'});
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;