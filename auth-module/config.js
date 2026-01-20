require('dotenv').config();

module.exports = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mavota',
    sessionSecret: process.env.SESSION_SECRET || 'mavota-auth-secret-key-2024',
    
    github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET
    },
    
    yandex: {
        clientId: process.env.YANDEX_CLIENT_ID,
        clientSecret: process.env.YANDEX_CLIENT_SECRET
    }
};