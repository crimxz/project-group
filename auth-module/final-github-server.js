const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const YandexStrategy = require('passport-yandex').Strategy;
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = 3000;

// Конфигурация
const config = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mavota',
    sessionSecret: process.env.SESSION_SECRET || 'mavota-secret-key',
    
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

// Вывод конфигурации для отладки
console.log('🔧 Конфигурация GitHub OAuth:');
console.log('Client ID:', config.github.clientId ? '✅ Установлен' : '❌ Отсутствует');
console.log('Client Secret:', config.github.clientSecret ? '✅ Установлен' : '❌ Отсутствует');
console.log('Callback URL:', config.github.callbackUrl);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

const connectDB = async () => {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('✅ MongoDB подключен');
    } catch (error) {
        console.error('❌ MongoDB ошибка:', error.message);
    }
};

connectDB();

// Модель пользователя
const userSchema = new mongoose.Schema({
    email: { 
        type: String, 
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    password: String,
    githubId: { type: String, unique: true, sparse: true },
    githubUsername: String,
    githubProfileUrl: String,
    yandexId: { type: String, unique: true, sparse: true },
    yandexUsername: String,
    yandexProfileUrl: String,
    displayName: String,
    avatarUrl: String,
    provider: { type: String, default: 'local' },
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});

const User = mongoose.model('User', userSchema);

// Функции для работы с паролями
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

const comparePassword = async (candidatePassword, hashedPassword) => {
    return await bcrypt.compare(candidatePassword, hashedPassword);
};

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

// GitHub Strategy с дополнительной отладкой
if (config.github.clientId && config.github.clientSecret) {
    console.log('🐙 Настраиваю GitHub OAuth...');
    console.log('📌 Client ID:', config.github.clientId);
    console.log('📌 Callback URL:', config.github.callbackUrl);
    
    passport.use(new GitHubStrategy({
        clientID: config.github.clientId,
        clientSecret: config.github.clientSecret,
        callbackURL: config.github.callbackUrl,
        scope: ['user:email'],
        userAgent: 'Mavota-Auth-App/1.0.0'  // Добавляем userAgent
    }, async (accessToken, refreshToken, profile, done) => {
        console.log('==========================================');
        console.log('🐙 GitHub профиль получен!');
        console.log('📌 ID:', profile.id);
        console.log('📌 Username:', profile.username);
        console.log('📌 Display Name:', profile.displayName);
        console.log('📌 Profile URL:', profile.profileUrl);
        console.log('📌 Emails:', profile.emails ? profile.emails.map(e => e.value) : 'Нет email');
        console.log('📌 Raw Profile:', JSON.stringify(profile._json, null, 2));
        console.log('==========================================');
        
        try {
            let user = await User.findOne({ githubId: profile.id });
            
            if (!user) {
                console.log('🔍 Пользователь с таким GitHub ID не найден, ищу по email...');
                
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                    if (user) {
                        console.log('✅ Найден пользователь по email:', user.email);
                    }
                }
                
                if (!user) {
                    console.log('🆕 Создаю нового пользователя...');
                    user = new User({
                        githubId: profile.id,
                        githubUsername: profile.username,
                        githubProfileUrl: profile.profileUrl,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        displayName: profile.displayName || profile.username,
                        avatarUrl: profile._json.avatar_url,
                        provider: 'github',
                        lastLogin: new Date()
                    });
                    
                    await user.save();
                    console.log('✅ Создан новый пользователь GitHub:', profile.username);
                } else {
                    console.log('🔄 Обновляю существующего пользователя с GitHub данными...');
                    user.githubId = profile.id;
                    user.githubUsername = profile.username;
                    user.githubProfileUrl = profile.profileUrl;
                    user.avatarUrl = profile._json.avatar_url || user.avatarUrl;
                    user.provider = user.provider === 'local' ? 'mixed' : 'github';
                    user.lastLogin = new Date();
                    
                    await user.save();
                    console.log('✅ Пользователь обновлен:', user.email);
                }
            } else {
                console.log('✅ Найден существующий пользователь GitHub:', user.displayName);
                user.lastLogin = new Date();
                await user.save();
            }
            
            console.log('✅ Аутентификация успешна для пользователя:', user.email || user.displayName);
            return done(null, user);
        } catch (error) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА при обработке GitHub профиля:');
            console.error('📌 Ошибка:', error.message);
            console.error('📌 Стек:', error.stack);
            return done(error, null);
        }
    }));
    
    console.log('✅ GitHub OAuth стратегия настроена');
} else {
    console.log('❌ GitHub OAuth не настроен: отсутствуют ключи');
    console.log('GITHUB_CLIENT_ID:', config.github.clientId ? 'Есть' : 'Нет');
    console.log('GITHUB_CLIENT_SECRET:', config.github.clientSecret ? 'Есть' : 'Нет');
}

// Яндекс Strategy
if (config.yandex.clientId && config.yandex.clientSecret) {
    console.log('🌐 Настраиваю Яндекс OAuth...');
    
    passport.use(new YandexStrategy({
        clientID: config.yandex.clientId,
        clientSecret: config.yandex.clientSecret,
        callbackURL: config.yandex.callbackUrl
    }, async (accessToken, refreshToken, profile, done) => {
        console.log('🌐 Яндекс профиль получен:', profile.displayName);
        
        try {
            let user = await User.findOne({ yandexId: profile.id });
            
            if (!user) {
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                }
                
                if (!user) {
                    user = new User({
                        yandexId: profile.id,
                        yandexUsername: profile.displayName,
                        yandexProfileUrl: `https://yandex.ru/id/${profile.id}`,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        displayName: profile.displayName,
                        avatarUrl: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                        provider: 'yandex',
                        lastLogin: new Date()
                    });
                } else {
                    user.yandexId = profile.id;
                    user.yandexUsername = profile.displayName;
                    user.yandexProfileUrl = `https://yandex.ru/id/${profile.id}`;
                    user.avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatarUrl;
                    user.provider = user.provider === 'local' ? 'mixed' : 'yandex';
                    user.lastLogin = new Date();
                }
                
                await user.save();
            } else {
                user.lastLogin = new Date();
                await user.save();
            }
            
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка Яндекс:', error);
            return done(error, null);
        }
    }));
    
    console.log('✅ Яндекс OAuth настроен');
} else {
    console.log('⚠️ Яндекс OAuth не настроен');
}

// Главная страница
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
                .config-status { padding: 5px 10px; border-radius: 4px; font-size: 12px; }
                .config-ok { background: #d4edda; color: #155724; }
                .config-error { background: #f8d7da; color: #721c24; }
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
                        <h3>🔧 Конфигурация GitHub OAuth:</h3>
                        <p><strong>Client ID:</strong> 
                            <span class="config-status ${config.github.clientId ? 'config-ok' : 'config-error'}">
                                ${config.github.clientId ? '✅ Установлен' : '❌ Отсутствует'}
                            </span>
                        </p>
                        <p><strong>Client Secret:</strong> 
                            <span class="config-status ${config.github.clientSecret ? 'config-ok' : 'config-error'}">
                                ${config.github.clientSecret ? '✅ Установлен' : '❌ Отсутствует'}
                            </span>
                        </p>
                        <p><strong>Callback URL:</strong> ${config.github.callbackUrl}</p>
                        
                        <h4>🔄 Тестовые маршруты:</h4>
                        <ul>
                            <li><a href="/auth/github">/auth/github</a> - Вход через GitHub</li>
                            <li><a href="/auth/yandex">/auth/yandex</a> - Вход через Яндекс</li>
                            <li><a href="/local-login">/local-login</a> - Локальный вход</li>
                            <li><a href="/test-github">/test-github</a> - Тест GitHub OAuth</li>
                            <li><a href="/config">/config</a> - Просмотр конфигурации</li>
                        </ul>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Тестовый маршрут для GitHub OAuth
app.get('/test-github', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Тест GitHub OAuth</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .test-info { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .btn { display: inline-block; padding: 10px 20px; background: #24292e; color: white; text-decoration: none; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>🧪 Тест GitHub OAuth</h1>
            
            <div class="test-info">
                <h3>📋 Информация о конфигурации:</h3>
                <p><strong>Client ID:</strong> ${config.github.clientId || '❌ Не установлен'}</p>
                <p><strong>Callback URL:</strong> ${config.github.callbackUrl}</p>
                <p><strong>Состояние:</strong> ${config.github.clientId && config.github.clientSecret ? '✅ Настроено' : '❌ Не настроено'}</p>
            </div>
            
            <h3>🚀 Тестовые действия:</h3>
            <ol>
                <li><a href="/auth/github" class="btn">1. Перейти к авторизации GitHub</a></li>
                <li><a href="https://github.com/login/oauth/authorize?client_id=${config.github.clientId}&redirect_uri=${encodeURIComponent(config.github.callbackUrl)}&scope=user:email" class="btn">2. Прямая ссылка на GitHub OAuth</a></li>
                <li><a href="/config" class="btn">3. Проверить конфигурацию</a></li>
            </ol>
            
            <h3>🔧 Устранение проблем:</h3>
            <ul>
                <li>Убедитесь, что Callback URL в настройках GitHub приложения совпадает с ${config.github.callbackUrl}</li>
                <li>Проверьте, что Client ID и Secret правильно скопированы в .env файл</li>
                <li>Убедитесь, что приложение на GitHub имеет статус "Active"</li>
            </ul>
            
            <p><a href="/">← На главную</a></p>
        </body>
        </html>
    `);
});

// Маршрут для просмотра конфигурации
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
        server: {
            baseUrl: config.baseUrl,
            port: port,
            mongodbUri: config.mongodbUri.replace(/\/\/[^@]+@/, '//***:***@') // скрываем пароль
        }
    });
});

// GitHub OAuth маршруты
app.get('/auth/github', (req, res, next) => {
    console.log('🔗 Запрос на авторизацию GitHub получен');
    
    if (!config.github.clientId) {
        console.error('❌ GitHub OAuth не настроен: отсутствует Client ID');
        return res.send(`
            <div style="padding: 20px;">
                <h2>❌ GitHub OAuth не настроен</h2>
                <p>Отсутствует GITHUB_CLIENT_ID в .env файле</p>
                <p>Текущий Client ID: ${config.github.clientId || 'Пусто'}</p>
                <p><a href="/">На главную</a></p>
            </div>
        `);
    }
    
    if (!config.github.clientSecret) {
        console.error('❌ GitHub OAuth не настроен: отсутствует Client Secret');
        return res.send(`
            <div style="padding: 20px;">
                <h2>❌ GitHub OAuth не настроен</h2>
                <p>Отсутствует GITHUB_CLIENT_SECRET в .env файле</p>
                <p><a href="/">На главную</a></p>
            </div>
        `);
    }
    
    console.log('✅ Перенаправление на GitHub для авторизации...');
    passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
});

app.get('/auth/github/callback',
    (req, res, next) => {
        console.log('🔗 Callback от GitHub получен');
        console.log('📌 Query параметры:', req.query);
        console.log('📌 Код авторизации:', req.query.code);
        console.log('📌 Ошибка:', req.query.error);
        console.log('📌 Описание ошибки:', req.query.error_description);
        
        passport.authenticate('github', { 
            failureRedirect: '/oauth-error',
            failureMessage: true 
        })(req, res, next);
    },
    (req, res) => {
        console.log('✅ GitHub авторизация успешна');
        res.redirect('/');
    }
);

// Страница ошибки OAuth
app.get('/oauth-error', (req, res) => {
    const error = req.session.error || req.query.error || 'Неизвестная ошибка OAuth';
    const errorDescription = req.query.error_description || '';
    
    console.error('❌ Ошибка OAuth:', error, errorDescription);
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ошибка OAuth</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 10px; }
            </style>
        </head>
        <body>
            <h1>❌ Ошибка OAuth авторизации</h1>
            
            <div class="error">
                <h2>${error}</h2>
                ${errorDescription ? `<p>${errorDescription}</p>` : ''}
            </div>
            
            <h3>🔧 Возможные причины:</h3>
            <ol>
                <li>Неправильный Client ID или Client Secret</li>
                <li>Callback URL не совпадает с настройками приложения на GitHub</li>
                <li>Приложение не опубликовано</li>
                <li>Слишком много запросов (лимит API)</li>
                <li>Пользователь отменил авторизацию</li>
            </ol>
            
            <h3>🔄 Что делать:</h3>
            <ol>
                <li>Проверьте .env файл: правильно ли скопированы Client ID и Secret</li>
                <li>Убедитесь, что Callback URL в настройках GitHub приложения: <code>${config.github.callbackUrl}</code></li>
                <li>Попробуйте создать новое OAuth приложение на GitHub</li>
                <li>Используйте локальную авторизацию как временное решение</li>
            </ol>
            
            <p>
                <a href="/">← На главную</a> | 
                <a href="/test-github">🧪 Тест GitHub OAuth</a> | 
                <a href="/local-login">📧 Локальный вход</a>
            </p>
            
            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4>📋 Техническая информация для отладки:</h4>
                <p><strong>GitHub Client ID:</strong> ${config.github.clientId || '❌ Отсутствует'}</p>
                <p><strong>Callback URL в коде:</strong> ${config.github.callbackUrl}</p>
                <p><strong>Callback URL в настройках GitHub:</strong> http://localhost:3000/auth/github/callback</p>
                <p><strong>Должны совпадать!</strong></p>
            </div>
        </body>
        </html>
    `);
});

// Локальный вход (для теста)
app.get('/local-login', (req, res) => {
    res.send(`
        <form method="POST" action="/local-login" style="max-width: 400px; margin: 40px auto;">
            <h2>📧 Тестовый локальный вход</h2>
            <input type="email" name="email" placeholder="Email" required style="width: 100%; padding: 10px; margin: 10px 0;">
            <input type="password" name="password" placeholder="Пароль" required style="width: 100%; padding: 10px; margin: 10px 0;">
            <button type="submit" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none;">
                Войти или создать пользователя
            </button>
            <p style="text-align: center; margin-top: 20px;">
                <a href="/">← На главную</a>
            </p>
        </form>
    `);
});

app.post('/local-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.redirect('/local-login');
        }
        
        let user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            // Создаем нового пользователя
            const hashedPassword = await hashPassword(password);
            user = new User({
                email: email.toLowerCase(),
                password: hashedPassword,
                displayName: email.split('@')[0],
                provider: 'local'
            });
            await user.save();
            console.log('✅ Создан новый локальный пользователь:', email);
        } else {
            // Проверяем пароль существующего пользователя
            const isValid = await comparePassword(password, user.password);
            if (!isValid) {
                return res.send('<script>alert("Неверный пароль"); window.history.back();</script>');
            }
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

// Запуск сервера
app.listen(port, () => {
    console.log(`
    ============================================
    🚀 GITHUB OAUTH DEBUG СЕРВЕР ЗАПУЩЕН
    ============================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:${port}
    🗄️ MongoDB: ${config.mongodbUri}
    
    🔧 КОНФИГУРАЦИЯ GITHUB:
    - Client ID: ${config.github.clientId ? '✅ ' + config.github.clientId.substring(0, 10) + '...' : '❌ НЕ НАСТРОЕН'}
    - Client Secret: ${config.github.clientSecret ? '✅ Установлен' : '❌ Отсутствует'}
    - Callback URL: ${config.github.callbackUrl}
    
    📌 ТЕСТОВЫЕ МАРШРУТЫ:
    • /              - Главная страница
    • /test-github   - Тест GitHub OAuth
    • /config        - Просмотр конфигурации
    • /auth/github   - Вход через GitHub
    • /local-login   - Локальный вход (если GitHub не работает)
    
    ⚠️  ВАЖНО: Убедитесь, что в настройках GitHub OAuth App:
    1. Homepage URL: http://localhost:3000
    2. Authorization callback URL: http://localhost:3000/auth/github/callback
    
    ============================================
    `);
});