const mongoose = require('mongoose');
const app = require('./app');
const { port } = require('./config');
const connectDB = requrie('./config/db');
require('./models');

let server;

const start = async () => {
    try {
        await connectDB();
        server = app.listen(port, () => console.log(`server running on ${port}`));
    } catch (err) {
        console.error('failed to start server:', err.message);
        process.exit(1);
    }
};

const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);

    const forceExit = setTimeout(() => {
        console.error('forced shutdown after timeout');
        process.exit(1);
    }, 10000);
    forceExit.unref();

    try {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    } catch (err) {
        console.error('error during shutdown:', err.message);
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));     
process.on('SIGTERM', () => shutdown('SIGTERM')); 

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});

start();