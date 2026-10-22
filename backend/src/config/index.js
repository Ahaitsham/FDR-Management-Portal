require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URI,
    nodeEnv: process.env.NODE_ENV || 'development',
};

if (!module.exports.mongoUri) {
  throw new Error('MONGO_URI is not defined in .env');
}