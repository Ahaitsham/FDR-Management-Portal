require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URI,
    nodeEnv: process.env.NODE_ENV || 'development',
    cronEnabled: process.env.CRON_ENABLED !== 'false',
    cronSchedule: process.env.CRON_SCHEDULE || '0 2 * * *',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: process.env.SUPABASE_BUCKET,
};

if (!module.exports.mongoUri) {
  throw new Error('MONGO_URI is not defined in .env');
}

['supabaseUrl', 'supabaseServiceKey', 'supabaseBucket'].forEach((key) => {
  if (!module.exports[key]) {
    throw new Error(`${key === 'supabaseUrl' ? 'SUPABASE_URL' : key === 'supabaseServiceKey' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_BUCKET'} is not defined in .env`);
  }
});
