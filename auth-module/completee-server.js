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

// Конфигурация из .env
const config = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mavota',
    sessionSecret: process.env.SESSION_SECRET || 'mavota-super-secret-key-2024',
    
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

// Отладочная информация
console.log('🔧 Конфигурация OAuth:');
console.log(`🐙 GitHub: ${config.github.clientId ? '✅ Настроен' : '❌ Не настроен'}`);
console.log(`🌐 Яндекс: ${config.yandex.clientId ? '✅ Настроен' : '❌ Не настроен'}`);

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
        
        // Проверяем подключение
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('📚 Коллекции в базе:', collections.map(c => c.name));
    } catch (error) {
        console.error('❌ MongoDB ошибка:', error.message);
    }
};

connectDB();

// Модель пользователя (без pre-save хука)
const userSchema = new mongoose.Schema({
    // Локальная аутентификация
    email: { 
        type: String, 
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    password: String,
    
    // GitHub OAuth
    githubId: { type: String, unique: true, sparse: true },
    githubUsername: String,
    githubProfileUrl: String,
    
    // Яндекс OAuth
    yandexId: { type: String, unique: true, sparse: true },
    yandexUsername: String,
    yandexProfileUrl: String,
    
    // Общая информация
    displayName: String,
    avatarUrl: String,
    provider: {
        type: String,
        default: 'local'
    },
    role: {
        type: String,
        default: 'user'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date
    }
});

const User = mongoose.model('User', userSchema);

// Функции для работы с паролями
const hashPassword = async (password) => {
    try {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.error('❌ Ошибка хеширования пароля:', error);
        throw error;
    }
};

const comparePassword = async (candidatePassword, hashedPassword) => {
    try {
        if (!candidatePassword || !hashedPassword) return false;
        return await bcrypt.compare(candidatePassword, hashedPassword);
    } catch (error) {
        console.error('❌ Ошибка сравнения паролей:', error);
        return false;
    }
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

// ========== GITHUB STRATEGY (исправленная) ==========
if (config.github.clientId && config.github.clientSecret) {
    console.log('🐙 Настраиваю GitHub OAuth...');
    
    passport.use(new GitHubStrategy({
        clientID: config.github.clientId,
        clientSecret: config.github.clientSecret,
        callbackURL: config.github.callbackUrl,
        scope: ['user:email'],
        userAgent: 'Mavota-Auth-App/1.0.0'
    }, async (accessToken, refreshToken, profile, done) => {
        console.log('==========================================');
        console.log('🐙 GitHub профиль получен!');
        console.log('📌 ID:', profile.id);
        console.log('📌 Username:', profile.username);
        console.log('📌 Display Name:', profile.displayName);
        console.log('==========================================');
        
        try {
            // Ищем пользователя по githubId
            let user = await User.findOne({ githubId: profile.id });
            
            if (!user) {
                console.log('🔍 Пользователь с таким GitHub ID не найден, ищу по email...');
                
                // Проверяем по email
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                }
                
                if (!user) {
                    console.log('🆕 Создаю нового пользователя...');
                    // Создаем нового пользователя
                    user = new User({
                        githubId: profile.id,
                        githubUsername: profile.username,
                        githubProfileUrl: profile.profileUrl,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        displayName: profile.displayName || profile.username,
                        avatarUrl: profile._json?.avatar_url || null,
                        provider: 'github',
                        isVerified: true,
                        lastLogin: new Date()
                    });
                } else {
                    console.log('🔄 Обновляю существующего пользователя с GitHub данными...');
                    // Обновляем существующего пользователя
                    user.githubId = profile.id;
                    user.githubUsername = profile.username;
                    user.githubProfileUrl = profile.profileUrl;
                    user.avatarUrl = profile._json?.avatar_url || user.avatarUrl;
                    user.provider = user.provider === 'local' ? 'mixed' : 'github';
                    user.lastLogin = new Date();
                }
            } else {
                console.log('✅ Найден существующий пользователь GitHub');
                user.lastLogin = new Date();
            }
            
            await user.save();
            console.log(`✅ Пользователь сохранен: ${user.email || user.displayName}`);
            
            return done(null, user);
            
        } catch (error) {
            console.error('❌ Ошибка при обработке GitHub профиля:');
            console.error('📌 Сообщение:', error.message);
            if (error.code === 11000) {
                console.error('📌 Ошибка дублирования ключа. Пытаемся найти существующего пользователя...');
                // Пробуем найти пользователя по другим полям
                const existingUser = await User.findOne({ 
                    $or: [
                        { githubId: profile.id },
                        { email: profile.emails && profile.emails[0] ? profile.emails[0].value : null }
                    ]
                });
                if (existingUser) {
                    existingUser.lastLogin = new Date();
                    await existingUser.save();
                    return done(null, existingUser);
                }
            }
            return done(error, null);
        }
    }));
    
    console.log('✅ GitHub OAuth настроен');
} else {
    console.log('⚠️ GitHub OAuth не настроен (отсутствуют ключи)');
}

// ========== YANDEX STRATEGY ==========
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
                // Проверяем по email
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                }
                
                if (!user) {
                    // Создаем нового пользователя
                    user = new User({
                        yandexId: profile.id,
                        yandexUsername: profile.displayName,
                        yandexProfileUrl: `https://yandex.ru/id/${profile.id}`,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        displayName: profile.displayName,
                        avatarUrl: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                        provider: 'yandex',
                        isVerified: true,
                        lastLogin: new Date()
                    });
                } else {
                    // Обновляем существующего пользователя
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

// ========== МИДЛВЭЙРЫ И МАРШРУТЫ ==========

// Middleware для проверки аутентификации
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    next();
};

// Middleware для передачи пользователя в шаблоны
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.config = config;
    next();
});

// Главная страница
app.get('/', (req, res) => {
    const user = req.user;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mavota Auth</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
                .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
                .card { background: white; border-radius: 20px; padding: 40px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
                .header { text-align: center; margin-bottom: 40px; }
                h1 { color: #333; }
                .user-info { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 40px 0; }
                .stat { background: #f0f7ff; padding: 20px; border-radius: 10px; text-align: center; }
                .stat-number { font-size: 2em; font-weight: bold; color: #667eea; }
                .stat-label { color: #666; }
                .auth-buttons { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; margin: 40px 0; }
                .btn { display: inline-flex; align-items: center; justify-content: center; padding: 15px 30px; border-radius: 10px; text-decoration: none; font-weight: bold; transition: all 0.3s; }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
                .btn-register { background: #28a745; color: white; }
                .btn-login { background: #007bff; color: white; }
                .btn-github { background: #333; color: white; }
                .btn-yandex { background: #FFCC00; color: #000; }
                .btn-profile { background: #6f42c1; color: white; }
                .btn-logout { background: #dc3545; color: white; }
                .config-status { display: inline-block; padding: 5px 10px; border-radius: 4px; font-size: 12px; margin-left: 10px; }
                .config-ok { background: #d4edda; color: #155724; }
                .config-error { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="header">
                        <h1>🔐 Mavota Auth System</h1>
                        <p>Полная система аутентификации с локальной регистрацией, GitHub и Яндекс ID</p>
                    </div>
                    
                    ${user ? `
                        <!-- Авторизованный пользователь -->
                        <div class="user-info">
                            <h2>👋 Добро пожаловать, ${user.displayName || user.email || 'Пользователь'}!</h2>
                            <p><strong>Email:</strong> ${user.email || 'Не указан'}</p>
                            <p><strong>Провайдер:</strong> ${user.provider}</p>
                            <p><strong>Роль:</strong> ${user.role}</p>
                            <p><strong>ID:</strong> ${user._id}</p>
                        </div>
                        
                        <div class="auth-buttons">
                            <a href="/profile" class="btn btn-profile">👤 Мой профиль</a>
                            <a href="/users" class="btn btn-profile">👥 Все пользователи</a>
                            <a href="/logout" class="btn btn-logout">🚪 Выйти</a>
                        </div>
                    ` : `
                        <!-- Неавторизованный пользователь -->
                        <div style="text-align: center; padding: 40px 0;">
                            <h2>Войдите в систему</h2>
                            
                            <div class="auth-buttons">
                                <a href="/register" class="btn btn-register">📝 Регистрация</a>
                                <a href="/login" class="btn btn-login">🔑 Вход</a>
                                <a href="/auth/github" class="btn btn-github">🐙 GitHub 
                                    <span class="config-status ${config.github.clientId ? 'config-ok' : 'config-error'}">
                                        ${config.github.clientId ? '✓' : '✗'}
                                    </span>
                                </a>
                                <a href="/auth/yandex" class="btn btn-yandex">🌐 Яндекс ID
                                    <span class="config-status ${config.yandex.clientId ? 'config-ok' : 'config-error'}">
                                        ${config.yandex.clientId ? '✓' : '✗'}
                                    </span>
                                </a>
                            </div>
                        </div>
                    `}
                    
                    <div class="stats">
                        <div class="stat">
                            <div class="stat-number">3</div>
                            <div class="stat-label">Способа входа</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">✅</div>
                            <div class="stat-label">Работает с MongoDB</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">🔐</div>
                            <div class="stat-label">Безопасная аутентификация</div>
                        </div>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-top: 40px;">
                        <h3>📋 Доступные маршруты:</h3>
                        <ul>
                            <li><strong>/</strong> - Главная страница</li>
                            <li><strong>/register</strong> - Локальная регистрация ✅</li>
                            <li><strong>/login</strong> - Локальный вход ✅</li>
                            <li><strong>/auth/github</strong> - Вход через GitHub ${config.github.clientId ? '✅' : '❌'}</li>
                            <li><strong>/auth/yandex</strong> - Вход через Яндекс ${config.yandex.clientId ? '✅' : '❌'}</li>
                            <li><strong>/profile</strong> - Профиль пользователя</li>
                            <li><strong>/users</strong> - Все пользователи ✅</li>
                            <li><strong>/test-db</strong> - Тест базы данных</li>
                            <li><strong>/health</strong> - Проверка здоровья</li>
                            <li><strong>/logout</strong> - Выход</li>
                        </ul>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ========== ЛОКАЛЬНАЯ РЕГИСТРАЦИЯ ==========
app.get('/register', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Регистрация</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 5px; }
                button { width: 100%; padding: 14px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
                button:hover { background: #218838; }
                .oauth-buttons { margin-top: 20px; text-align: center; }
                .oauth-btn { display: inline-block; width: 48%; padding: 10px; margin: 5px 1%; border-radius: 5px; text-decoration: none; font-weight: bold; }
                .oauth-btn.github { background: #333; color: white; }
                .oauth-btn.yandex { background: #FFCC00; color: black; }
                .back { display: block; margin-top: 20px; text-align: center; color: #007bff; }
                .error { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2 style="text-align: center;">📝 Регистрация</h2>
                <form method="POST" action="/register">
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="password" placeholder="Пароль (минимум 6 символов)" required minlength="6">
                    <input type="password" name="confirmPassword" placeholder="Подтвердите пароль" required>
                    <button type="submit">Зарегистрироваться</button>
                </form>
                
                <div class="oauth-buttons">
                    <p style="margin: 20px 0; color: #666;">Или войдите через:</p>
                    <a href="/auth/github" class="oauth-btn github">🐙 GitHub</a>
                    <a href="/auth/yandex" class="oauth-btn yandex">🌐 Яндекс</a>
                </div>
                
                <a href="/login" class="back">Уже есть аккаунт? Войти</a>
                <a href="/" class="back">← На главную</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/register', async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;
        
        if (password !== confirmPassword) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Пароли не совпадают</div>
                    <a href="/register">← Назад к регистрации</a>
                </div>
            `);
        }
        
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Пользователь с таким email уже существует</div>
                    <a href="/register">← Назад к регистрации</a>
                </div>
            `);
        }
        
        // Хешируем пароль
        const hashedPassword = await hashPassword(password);
        
        const newUser = new User({
            email: email.toLowerCase(),
            password: hashedPassword,
            provider: 'local',
            displayName: email.split('@')[0],
            isVerified: false,
            createdAt: new Date()
        });
        
        await newUser.save();
        console.log(`✅ Зарегистрирован новый пользователь: ${email}`);
        
        // Автоматический вход после регистрации
        req.login(newUser, (err) => {
            if (err) {
                console.error('Ошибка автоматического входа:', err);
                return res.redirect('/login');
            }
            return res.redirect('/profile');
        });
        
    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        res.send(`
            <div style="padding: 20px;">
                <div class="error">❌ Ошибка регистрации: ${error.message}</div>
                <a href="/register">← Назад к регистрации</a>
            </div>
        `);
    }
});

// ========== ЛОКАЛЬНЫЙ ВХОД ==========
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Вход</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 5px; }
                button { width: 100%; padding: 14px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
                button:hover { background: #0056b3; }
                .oauth-buttons { margin-top: 20px; text-align: center; }
                .oauth-btn { display: inline-block; width: 48%; padding: 10px; margin: 5px 1%; border-radius: 5px; text-decoration: none; font-weight: bold; }
                .oauth-btn.github { background: #333; color: white; }
                .oauth-btn.yandex { background: #FFCC00; color: black; }
                .back { display: block; margin-top: 20px; text-align: center; color: #007bff; }
                .error { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2 style="text-align: center;">🔑 Вход в систему</h2>
                <form method="POST" action="/login">
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="password" placeholder="Пароль" required>
                    <button type="submit">Войти</button>
                </form>
                
                <div class="oauth-buttons">
                    <p style="margin: 20px 0; color: #666;">Или войдите через:</p>
                    <a href="/auth/github" class="oauth-btn github">🐙 GitHub</a>
                    <a href="/auth/yandex" class="oauth-btn yandex">🌐 Яндекс</a>
                </div>
                
                <a href="/register" class="back">Нет аккаунта? Зарегистрируйтесь</a>
                <a href="/" class="back">← На главную</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Пользователь не найден</div>
                    <a href="/login">← Назад ко входу</a>
                </div>
            `);
        }
        
        // Проверяем пароль
        const isPasswordValid = await comparePassword(password, user.password);
        if (!isPasswordValid) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Неверный пароль</div>
                    <a href="/login">← Назад ко входу</a>
                </div>
            `);
        }
        
        user.lastLogin = new Date();
        await user.save();
        
        req.login(user, (err) => {
            if (err) {
                console.error('Ошибка входа:', err);
                return res.redirect('/login');
            }
            return res.redirect('/profile');
        });
        
    } catch (error) {
        console.error('❌ Ошибка входа:', error);
        res.send(`
            <div style="padding: 20px;">
                <div class="error">❌ Ошибка входа: ${error.message}</div>
                <a href="/login">← Назад ко входу</a>
            </div>
        `);
    }
});

// ========== GITHUB OAUTH МАРШРУТЫ ==========
app.get('/auth/github', (req, res, next) => {
    if (!config.github.clientId) {
        return res.send(`
            <div style="padding: 20px;">
                <h2>❌ GitHub OAuth не настроен</h2>
                <p>Добавьте GITHUB_CLIENT_ID и GITHUB_CLIENT_SECRET в .env файл</p>
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
        console.log('✅ GitHub авторизация успешна, перенаправление в профиль');
        res.redirect('/profile');
    }
);

// ========== YANDEX OAUTH МАРШРУТЫ ==========
app.get('/auth/yandex', (req, res, next) => {
    if (!config.yandex.clientId) {
        return res.send(`
            <div style="padding: 20px;">
                <h2>❌ Яндекс OAuth не настроен</h2>
                <p>Добавьте YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET в .env файл</p>
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
        res.redirect('/profile');
    }
);

// ========== ОШИБКИ OAUTH ==========
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
            
            <h3>🔧 Возможные причины для GitHub:</h3>
            <ol>
                <li>Неправильный Client ID или Client Secret</li>
                <li>Callback URL не совпадает: должно быть <code>http://localhost:3000/auth/github/callback</code></li>
                <li>Слишком много запросов (лимит API)</li>
                <li>Пользователь отменил авторизацию</li>
            </ol>
            
            <p>
                <a href="/">← На главную</a> | 
                <a href="/login">📧 Локальный вход</a> |
                <a href="/register">📝 Регистрация</a>
            </p>
        </body>
        </html>
    `);
});

// ========== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/profile', requireAuth, async (req, res) => {
    const user = req.user;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Мой профиль</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .profile-header { display: flex; align-items: center; margin-bottom: 40px; }
                .avatar { width: 120px; height: 120px; border-radius: 50%; border: 4px solid #007bff; margin-right: 30px; overflow: hidden; }
                .avatar img { width: 100%; height: 100%; object-fit: cover; }
                .profile-info h1 { margin: 0 0 10px 0; }
                .profile-info p { color: #666; margin: 5px 0; }
                .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
                .stat { background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; }
                .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
                .stat-label { color: #666; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                .btn:hover { background: #0056b3; }
                .btn-danger { background: #dc3545; }
                .btn-success { background: #28a745; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                td { padding: 10px; border-bottom: 1px solid #ddd; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="profile-header">
                    <div class="avatar">
                        ${user.avatarUrl ? `<img src="${user.avatarUrl}" alt="Avatar">` : '👤'}
                    </div>
                    <div class="profile-info">
                        <h1>${user.displayName || user.email || 'Пользователь'}</h1>
                        <p><strong>Email:</strong> ${user.email || 'Не указан'}</p>
                        <p><strong>Провайдер:</strong> ${user.provider}</p>
                        <p><strong>Роль:</strong> ${user.role}</p>
                        <p><strong>Дата регистрации:</strong> ${user.createdAt.toLocaleDateString()}</p>
                        <p><strong>Последний вход:</strong> ${user.lastLogin ? user.lastLogin.toLocaleString() : 'Нет данных'}</p>
                    </div>
                </div>
                
                <div class="stats">
                    <div class="stat">
                        <div class="stat-number">${user.provider}</div>
                        <div class="stat-label">Способ входа</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${user.isVerified ? '✅' : '❌'}</div>
                        <div class="stat-label">Верификация</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${user.role}</div>
                        <div class="stat-label">Роль</div>
                    </div>
                </div>
                
                <h2>🔗 Подключенные аккаунты</h2>
                <table>
                    <tr>
                        <td><strong>Локальный аккаунт:</strong></td>
                        <td>${user.email ? '✅ Подключен' : '❌ Не подключен'}</td>
                    </tr>
                    <tr>
                        <td><strong>GitHub:</strong></td>
                        <td>${user.githubId ? '✅ Подключен' : '❌ Не подключен'}</td>
                    </tr>
                    <tr>
                        <td><strong>Яндекс ID:</strong></td>
                        <td>${user.yandexId ? '✅ Подключен' : '❌ Не подключен'}</td>
                    </tr>
                </table>
                
                <div style="margin-top: 40px;">
                    <a href="/" class="btn">🏠 На главную</a>
                    ${!user.githubId ? '<a href="/auth/github" class="btn btn-success">➕ Подключить GitHub</a>' : ''}
                    ${!user.yandexId ? '<a href="/auth/yandex" class="btn btn-success">➕ Подключить Яндекс</a>' : ''}
                    <a href="/logout" class="btn btn-danger">🚪 Выйти</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ========== ВСЕ ПОЛЬЗОВАТЕЛИ ==========
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        const totalUsers = users.length;
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Все пользователи</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #007bff; color: white; }
                    tr:hover { background: #f5f5f5; }
                    .count { background: #007bff; color: white; padding: 5px 10px; border-radius: 20px; }
                    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; margin: 2px; }
                    .badge-local { background: #4CAF50; color: white; }
                    .badge-github { background: #333; color: white; }
                    .badge-yandex { background: #FFCC00; color: black; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>👥 Все пользователи <span class="count">${totalUsers}</span></h1>
                    
                    ${totalUsers > 0 ? `
                        <table>
                            <thead>
                                <tr>
                                    <th>№</th>
                                    <th>Email/Имя</th>
                                    <th>Провайдеры</th>
                                    <th>Дата регистрации</th>
                                    <th>Последний вход</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map((user, index) => {
                                    const providers = [];
                                    if (user.email && user.provider === 'local') providers.push('<span class="badge badge-local">local</span>');
                                    if (user.githubId) providers.push('<span class="badge badge-github">GitHub</span>');
                                    if (user.yandexId) providers.push('<span class="badge badge-yandex">Яндекс</span>');
                                    
                                    return `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td>
                                                <strong>${user.displayName || user.email || 'N/A'}</strong><br>
                                                <small>${user.email || 'Нет email'}</small>
                                            </td>
                                            <td>${providers.join(' ')}</td>
                                            <td>${user.createdAt.toLocaleDateString()}</td>
                                            <td>${user.lastLogin ? user.lastLogin.toLocaleDateString() : 'Никогда'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    ` : `
                        <div style="padding: 40px; text-align: center;">
                            <h3>📭 Пользователей нет</h3>
                            <p>Будьте первым пользователем!</p>
                            <a href="/register" class="btn">📝 Зарегистрироваться</a>
                        </div>
                    `}
                    
                    <div style="margin-top: 40px;">
                        <a href="/" class="btn">🏠 На главную</a>
                        <a href="/register" class="btn">📝 Добавить пользователя</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
        res.status(500).send(`
            <div style="padding: 20px;">
                <h2>❌ Ошибка загрузки пользователей</h2>
                <p>${error.message}</p>
                <p><a href="/">На главную</a></p>
            </div>
        `);
    }
});

// ========== ТЕСТ БАЗЫ ДАННЫХ ==========
app.get('/test-db', async (req, res) => {
    try {
        const dbState = mongoose.connection.readyState;
        const states = ['❌ Отключен', '✅ Подключен', '🔄 Подключается', '⚠️ Отключается'];
        
        const usersCount = await User.countDocuments();
        const collections = await mongoose.connection.db.listCollections().toArray();
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Тест базы данных</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .stat { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .success { color: #28a745; }
                    .error { color: #dc3545; }
                    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🧪 Тест базы данных</h1>
                    
                    <div class="stat">
                        <h2>📊 Состояние MongoDB</h2>
                        <p><strong>Статус:</strong> <span class="${dbState === 1 ? 'success' : 'error'}">${states[dbState] || 'Неизвестно'}</span></p>
                        <p><strong>Код состояния:</strong> ${dbState}</p>
                        <p><strong>База данных:</strong> ${mongoose.connection.db?.databaseName || 'Не доступна'}</p>
                        <p><strong>Коллекций:</strong> ${collections.length}</p>
                        <p><strong>Пользователей в базе:</strong> ${usersCount}</p>
                    </div>
                    
                    <div class="stat">
                        <h2>📚 Коллекции</h2>
                        <ul>
                            ${collections.map(col => `<li>${col.name}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div style="margin-top: 40px;">
                        <a href="/" class="btn">🏠 На главную</a>
                        <a href="/health" class="btn">🩺 Проверка здоровья</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send(`
            <div style="padding: 20px;">
                <h2>❌ Ошибка теста базы данных</h2>
                <p>${error.message}</p>
                <p><a href="/">На главную</a></p>
            </div>
        `);
    }
});

// ========== ПРОВЕРКА ЗДОРОВЬЯ ==========
app.get('/health', async (req, res) => {
    try {
        const dbState = mongoose.connection.readyState;
        const userCount = await User.countDocuments();
        const githubCount = await User.countDocuments({ githubId: { $exists: true } });
        const yandexCount = await User.countDocuments({ yandexId: { $exists: true } });
        const localCount = await User.countDocuments({ provider: 'local' });
        
        res.json({
            status: 'ok',
            timestamp: new Date(),
            server: {
                port: port,
                uptime: Math.round(process.uptime()) + ' сек',
                node_version: process.version,
                platform: process.platform
            },
            database: {
                mongodb: {
                    state: dbState,
                    connected: dbState === 1,
                    database: 'mavota',
                    users_count: userCount
                }
            },
            statistics: {
                total_users: userCount,
                github_users: githubCount,
                yandex_users: yandexCount,
                local_users: localCount
            },
            auth: {
                github_configured: !!config.github.clientId,
                yandex_configured: !!config.yandex.clientId,
                local_auth: true
            }
        });
    } catch (error) {
        res.json({
            status: 'error',
            message: error.message,
            timestamp: new Date()
        });
    }
});

// ========== ВЫХОД ==========
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Ошибка выхода:', err);
        res.redirect('/');
    });
});

// ========== ЗАПУСК СЕРВЕРА ==========
app.listen(port, () => {
    console.log(`
    ============================================
    🚀 ФИНАЛЬНЫЙ СЕРВЕР ЗАПУЩЕН
    ============================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:3000
    🗄️ База: mavota
    🔐 Методы аутентификации:
       📧 Локальная регистрация/вход: ✅ РАБОТАЕТ
       🐙 GitHub OAuth: ${config.github.clientId ? '✅ Настроен' : '❌ Не настроен'}
       🌐 Яндекс OAuth: ${config.yandex.clientId ? '✅ Настроен' : '❌ Не настроен'}
    ============================================
    
    📌 ОСНОВНЫЕ МАРШРУТЫ:
    • /              - Главная страница
    • /register      - Локальная регистрация ✅
    • /login         - Локальный вход ✅
    • /auth/github   - Вход через GitHub ${config.github.clientId ? '✅' : '❌'}
    • /auth/yandex   - Вход через Яндекс ${config.yandex.clientId ? '✅' : '❌'}
    • /profile       - Профиль пользователя
    • /users         - Все пользователи ✅
    • /test-db       - Тест базы данных
    • /health        - Проверка здоровья
    • /logout        - Выход
    ============================================
    `);
});