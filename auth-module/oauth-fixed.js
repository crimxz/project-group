const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const YandexStrategy = require('passport-yandex').Strategy;
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = 3000;

// Конфигурация из .env
const config = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mavota',
    sessionSecret: process.env.SESSION_SECRET || 'mavota-secret',
    
    github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/github/callback`
    },
    
    yandex: {
        clientId: process.env.YANDEX_CLIENT_ID,
        clientSecret: process.env.YANDEX_CLIENT_SECRET,
        callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/yandex/callback`
    }
};

// Логирование конфигурации (без секретов)
console.log('🔧 Конфигурация OAuth:');
console.log(`🌐 Base URL: ${config.baseUrl}`);
console.log(`🐙 GitHub Client ID: ${config.github.clientId ? '✅ Установлен' : '❌ Отсутствует'}`);
console.log(`🌐 Яндекс Client ID: ${config.yandex.clientId ? '✅ Установлен' : '❌ Отсутствует'}`);
console.log(`🗄️ MongoDB URI: ${config.mongodbUri}`);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Сессии
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: false
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// MongoDB
mongoose.set('strictQuery', false);
mongoose.connect(config.mongodbUri)
    .then(() => console.log('✅ MongoDB подключен'))
    .catch(err => console.error('❌ MongoDB ошибка:', err.message));

// Упрощенная модель пользователя
const userSchema = new mongoose.Schema({
    email: String,
    githubId: String,
    yandexId: String,
    displayName: String,
    avatarUrl: String,
    provider: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Сериализация пользователя
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// GitHub Strategy (исправленная)
if (config.github.clientId && config.github.clientSecret) {
    console.log('🐙 Настраиваю GitHub OAuth...');
    
    passport.use(new GitHubStrategy({
        clientID: config.github.clientId,
        clientSecret: config.github.clientSecret,
        callbackURL: config.github.callbackUrl,
        scope: ['user:email']
    }, async (accessToken, refreshToken, profile, done) => {
        console.log('🐙 GitHub профиль получен:', profile.username);
        console.log('📧 Email:', profile.emails ? profile.emails[0].value : 'Нет email');
        
        try {
            // Ищем пользователя по githubId
            let user = await User.findOne({ githubId: profile.id });
            
            if (!user) {
                // Проверяем по email
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                }
                
                // Создаем нового пользователя
                if (!user) {
                    user = new User({
                        githubId: profile.id,
                        displayName: profile.displayName || profile.username,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        avatarUrl: profile._json.avatar_url,
                        provider: 'github'
                    });
                    await user.save();
                    console.log('✅ Создан новый пользователь GitHub:', profile.username);
                } else {
                    // Обновляем существующего пользователя
                    user.githubId = profile.id;
                    user.avatarUrl = profile._json.avatar_url || user.avatarUrl;
                    user.provider = 'mixed';
                    await user.save();
                    console.log('✅ Обновлен пользователь с GitHub:', user.email);
                }
            } else {
                console.log('✅ Найден существующий пользователь GitHub:', user.displayName);
            }
            
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка обработки GitHub профиля:', error);
            return done(error, null);
        }
    }));
    
    console.log('✅ GitHub OAuth настроен');
} else {
    console.log('⚠️ GitHub OAuth не настроен (отсутствуют ключи)');
}

// Яндекс Strategy (исправленная)
if (config.yandex.clientId && config.yandex.clientSecret) {
    console.log('🌐 Настраиваю Яндекс OAuth...');
    
    passport.use(new YandexStrategy({
        clientID: config.yandex.clientId,
        clientSecret: config.yandex.clientSecret,
        callbackURL: config.yandex.callbackUrl
    }, async (accessToken, refreshToken, profile, done) => {
        console.log('🌐 Яндекс профиль получен:', profile.displayName);
        console.log('📧 Email:', profile.emails ? profile.emails[0].value : 'Нет email');
        
        try {
            // Ищем пользователя по yandexId
            let user = await User.findOne({ yandexId: profile.id });
            
            if (!user) {
                // Проверяем по email
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                }
                
                // Создаем нового пользователя
                if (!user) {
                    user = new User({
                        yandexId: profile.id,
                        displayName: profile.displayName,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        avatarUrl: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                        provider: 'yandex'
                    });
                    await user.save();
                    console.log('✅ Создан новый пользователь Яндекс:', profile.displayName);
                } else {
                    // Обновляем существующего пользователя
                    user.yandexId = profile.id;
                    user.avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatarUrl;
                    user.provider = 'mixed';
                    await user.save();
                    console.log('✅ Обновлен пользователь с Яндекс:', user.email);
                }
            } else {
                console.log('✅ Найден существующий пользователь Яндекс:', user.displayName);
            }
            
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка обработки Яндекс профиля:', error);
            return done(error, null);
        }
    }));
    
    console.log('✅ Яндекс OAuth настроен');
} else {
    console.log('⚠️ Яндекс OAuth не настроен (отсутствуют ключи)');
}

// Маршруты
app.get('/', (req, res) => {
    const user = req.user;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mavota Auth</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f0f2f5; }
                .container { max-width: 800px; margin: 0 auto; }
                .card { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                h1 { color: #333; text-align: center; }
                .oauth-buttons { display: flex; flex-direction: column; gap: 15px; margin: 30px 0; }
                .btn { display: block; padding: 15px; text-align: center; text-decoration: none; border-radius: 8px; font-weight: bold; }
                .btn-github { background: #24292e; color: white; }
                .btn-yandex { background: #FFCC00; color: #000; }
                .btn-local { background: #007bff; color: white; }
                .btn-logout { background: #dc3545; color: white; }
                .btn:hover { opacity: 0.9; transform: translateY(-2px); }
                .user-info { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .debug { background: #e9ecef; padding: 15px; border-radius: 8px; margin-top: 30px; font-family: monospace; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>🔐 Mavota Auth System</h1>
                    
                    ${user ? `
                        <div class="user-info">
                            <h2>👋 Добро пожаловать, ${user.displayName || 'Пользователь'}!</h2>
                            <p><strong>Email:</strong> ${user.email || 'Не указан'}</p>
                            <p><strong>Провайдер:</strong> ${user.provider}</p>
                            <p><strong>ID:</strong> ${user._id}</p>
                        </div>
                        
                        <div class="oauth-buttons">
                            <a href="/logout" class="btn btn-logout">🚪 Выйти</a>
                        </div>
                    ` : `
                        <h2 style="text-align: center; color: #666;">Войдите в систему</h2>
                        
                        <div class="oauth-buttons">
                            <a href="/auth/github" class="btn btn-github">🐙 Войти через GitHub</a>
                            <a href="/auth/yandex" class="btn btn-yandex">🌐 Войти через Яндекс</a>
                            <a href="/local-login" class="btn btn-local">📧 Локальный вход</a>
                        </div>
                    `}
                    
                    <div class="debug">
                        <h3>🔧 Отладочная информация:</h3>
                        <p><strong>Base URL:</strong> ${config.baseUrl}</p>
                        <p><strong>GitHub настроен:</strong> ${config.github.clientId ? '✅ Да' : '❌ Нет'}</p>
                        <p><strong>Яндекс настроен:</strong> ${config.yandex.clientId ? '✅ Да' : '❌ Нет'}</p>
                        <p><strong>Callback URLs:</strong></p>
                        <ul>
                            <li>GitHub: ${config.github.callbackUrl}</li>
                            <li>Яндекс: ${config.yandex.callbackUrl}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// GitHub OAuth маршруты
app.get('/auth/github', (req, res, next) => {
    if (!config.github.clientId) {
        return res.send(`
            <div style="padding: 20px;">
                <h2>❌ GitHub OAuth не настроен</h2>
                <p>Отсутствует GITHUB_CLIENT_ID в .env файле</p>
                <p><a href="/">На главную</a></p>
            </div>
        `);
    }
    passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
});

app.get('/auth/github/callback',
    passport.authenticate('github', { 
        failureRedirect: '/oauth-error',
        failureMessage: true 
    }),
    (req, res) => {
        res.redirect('/');
    }
);

// Яндекс OAuth маршруты
app.get('/auth/yandex', (req, res, next) => {
    if (!config.yandex.clientId) {
        return res.send(`
            <div style="padding: 20px;">
                <h2>❌ Яндекс OAuth не настроен</h2>
                <p>Отсутствует YANDEX_CLIENT_ID в .env файле</p>
                <p><a href="/">На главную</a></p>
            </div>
        `);
    }
    passport.authenticate('yandex')(req, res, next);
});

app.get('/auth/yandex/callback',
    passport.authenticate('yandex', { 
        failureRedirect: '/oauth-error',
        failureMessage: true 
    }),
    (req, res) => {
        res.redirect('/');
    }
);

// Страница ошибки OAuth
app.get('/oauth-error', (req, res) => {
    const error = req.session.error || 'Неизвестная ошибка OAuth';
    delete req.session.error;
    
    res.send(`
        <div style="padding: 40px;">
            <h2 style="color: #dc3545;">❌ Ошибка OAuth авторизации</h2>
            <p><strong>Сообщение:</strong> ${error}</p>
            <p>Возможные причины:</p>
            <ol>
                <li>Неправильный Client ID или Client Secret</li>
                <li>Callback URL не совпадает с настройками приложения</li>
                <li>Приложение не опубликовано (для Яндекс)</li>
                <li>Слишком много запросов (лимит API)</li>
            </ol>
            <p><a href="/">← На главную</a></p>
        </div>
    `);
});

// Локальный вход (для теста)
app.get('/local-login', (req, res) => {
    res.send(`
        <form method="POST" action="/local-login" style="max-width: 400px; margin: 40px auto;">
            <h2>Тестовый локальный вход</h2>
            <input type="email" name="email" placeholder="Email" required style="width: 100%; padding: 10px; margin: 10px 0;">
            <button type="submit" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none;">
                Войти (создать пользователя)
            </button>
        </form>
    `);
});

app.post('/local-login', async (req, res) => {
    try {
        const { email } = req.body;
        let user = await User.findOne({ email });
        
        if (!user) {
            user = new User({
                email,
                displayName: email.split('@')[0],
                provider: 'local'
            });
            await user.save();
        }
        
        req.login(user, (err) => {
            if (err) {
                console.error('Ошибка входа:', err);
                return res.redirect('/');
            }
            return res.redirect('/');
        });
    } catch (error) {
        console.error('Ошибка локального входа:', error);
        res.redirect('/');
    }
});

// Выход
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Ошибка выхода:', err);
        res.redirect('/');
    });
});

// Проверка конфигурации
app.get('/config', (req, res) => {
    res.json({
        github: {
            clientId: config.github.clientId ? '✅ Установлен' : '❌ Отсутствует',
            clientSecret: config.github.clientSecret ? '✅ Установлен' : '❌ Отсутствует',
            callbackUrl: config.github.callbackUrl
        },
        yandex: {
            clientId: config.yandex.clientId ? '✅ Установлен' : '❌ Отсутствует',
            clientSecret: config.yandex.clientSecret ? '✅ Установлен' : '❌ Отсутствует',
            callbackUrl: config.yandex.callbackUrl
        },
        mongodb: config.mongodbUri,
        baseUrl: config.baseUrl
    });
});

// Запуск сервера
app.listen(port, () => {
    console.log(`
    ============================================
    🚀 OAuth СЕРВЕР ЗАПУЩЕН
    ============================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:${port}
    🗄️ MongoDB: ${config.mongodbUri}
    
    🔧 КОНФИГУРАЦИЯ:
    - GitHub OAuth: ${config.github.clientId ? '✅ Настроен' : '❌ НЕ НАСТРОЕН'}
    - Яндекс OAuth: ${config.yandex.clientId ? '✅ Настроен' : '❌ НЕ НАСТРОЕН'}
    
    📌 ОШИБКИ КОНФИГУРАЦИИ:
    ${!config.github.clientId ? '❌ GitHub: Отсутствует GITHUB_CLIENT_ID в .env' : ''}
    ${!config.github.clientSecret ? '❌ GitHub: Отсутствует GITHUB_CLIENT_SECRET в .env' : ''}
    ${!config.yandex.clientId ? '❌ Яндекс: Отсутствует YANDEX_CLIENT_ID в .env' : ''}
    ${!config.yandex.clientSecret ? '❌ Яндекс: Отсутствует YANDEX_CLIENT_SECRET в .env' : ''}
    
    🌐 ПРОВЕРЬТЕ КОНФИГУРАЦИЮ:
    http://localhost:${port}/config
    
    ============================================
    `);
});