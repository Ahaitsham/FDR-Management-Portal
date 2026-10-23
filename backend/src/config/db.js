const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10
        });
        console.log(`MongoDB connected: ${mongoose.connection.host}`);
    } catch (err) {
        console.log('MongoDB connection failed:', err.message);
        process.exit(1);
    }
};

mongoose.connection.on('disconnect', () => console.warn('MongoDB disconnected'));
mongoose.connection.on('error', (err) => console.error('MongoDB error:', err));

module.exports = connectDB;