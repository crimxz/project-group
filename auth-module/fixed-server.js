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
    sessionSecret: process.env.SESSION_SECRET || 'mavota-secret-key-2024',
    
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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Сессии
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
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

// УПРОЩЕННАЯ модель пользователя (без хуков, которые вызывают ошибки)
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

// Удаляем хук pre('save'), который вызывает ошибку
// Вместо этого будем хешировать пароль вручную перед сохранением

const User = mongoose.model('User', userSchema);

// Функция для хеширования пароля
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

// Функция для сравнения паролей
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
        
        try {
            let user = await User.findOne({ githubId: profile.id });
            
            if (!user) {
                // Проверяем по email
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                }
                
                if (!user) {
                    // Создаем нового пользователя
                    user = new User({
                        githubId: profile.id,
                        githubUsername: profile.username,
                        githubProfileUrl: profile.profileUrl,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        displayName: profile.displayName || profile.username,
                        avatarUrl: profile._json.avatar_url,
                        provider: 'github',
                        isVerified: true,
                        lastLogin: new Date()
                    });
                    
                    await user.save();
                    console.log('✅ Создан новый пользователь GitHub:', profile.username);
                } else {
                    // Обновляем существующего пользователя
                    user.githubId = profile.id;
                    user.githubUsername = profile.username;
                    user.githubProfileUrl = profile.profileUrl;
                    user.avatarUrl = profile._json.avatar_url || user.avatarUrl;
                    user.provider = user.provider === 'local' ? 'mixed' : 'github';
                    user.lastLogin = new Date();
                    
                    await user.save();
                    console.log('✅ Обновлен пользователь с GitHub:', user.email);
                }
            } else {
                // Обновляем время входа
                user.lastLogin = new Date();
                await user.save();
                console.log('✅ Найден существующий пользователь GitHub:', user.displayName);
            }
            
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка GitHub:', error.message);
            return done(error, null);
        }
    }));
    
    console.log('✅ GitHub OAuth настроен');
} else {
    console.log('⚠️ GitHub OAuth не настроен');
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
                    
                    await user.save();
                    console.log('✅ Создан новый пользователь Яндекс:', profile.displayName);
                } else {
                    // Обновляем существующего пользователя
                    user.yandexId = profile.id;
                    user.yandexUsername = profile.displayName;
                    user.yandexProfileUrl = `https://yandex.ru/id/${profile.id}`;
                    user.avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatarUrl;
                    user.provider = user.provider === 'local' ? 'mixed' : 'yandex';
                    user.lastLogin = new Date();
                    
                    await user.save();
                    console.log('✅ Обновлен пользователь с Яндекс:', user.email);
                }
            } else {
                // Обновляем время входа
                user.lastLogin = new Date();
                await user.save();
                console.log('✅ Найден существующий пользователь Яндекс:', user.displayName);
            }
            
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка Яндекс:', error.message);
            return done(error, null);
        }
    }));
    
    console.log('✅ Яндекс OAuth настроен');
} else {
    console.log('⚠️ Яндекс OAuth не настроен');
}

// Middleware для проверки аутентификации
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    next();
};

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
                .auth-buttons { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; margin: 40px 0; }
                .btn { display: inline-flex; align-items: center; justify-content: center; padding: 15px 30px; border-radius: 10px; text-decoration: none; font-weight: bold; transition: all 0.3s; }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
                .btn-register { background: #28a745; color: white; }
                .btn-login { background: #007bff; color: white; }
                .btn-github { background: #333; color: white; }
                .btn-yandex { background: #FFCC00; color: #000; }
                .btn-profile { background: #6f42c1; color: white; }
                .btn-logout { background: #dc3545; color: white; }
                .user-info { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
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
                                <a href="/auth/github" class="btn btn-github">🐙 GitHub</a>
                                <a href="/auth/yandex" class="btn btn-yandex">🌐 Яндекс ID</a>
                            </div>
                        </div>
                    `}
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-top: 40px;">
                        <h3>📋 Доступные маршруты:</h3>
                        <ul>
                            <li><strong>/</strong> - Главная страница</li>
                            <li><strong>/register</strong> - Локальная регистрация (РАБОТАЕТ!)</li>
                            <li><strong>/login</strong> - Локальный вход (РАБОТАЕТ!)</li>
                            <li><strong>/auth/github</strong> - Вход через GitHub</li>
                            <li><strong>/auth/yandex</strong> - Вход через Яндекс</li>
                            <li><strong>/profile</strong> - Профиль пользователя</li>
                            <li><strong>/users</strong> - Список всех пользователей</li>
                            <li><strong>/logout</strong> - Выход из системы</li>
                            <li><strong>/health</strong> - Проверка здоровья</li>
                            <li><strong>/test-db</strong> - Тест базы данных</li>
                        </ul>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ЛОКАЛЬНАЯ РЕГИСТРАЦИЯ (ИСПРАВЛЕННАЯ)
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
                .back { display: block; margin-top: 20px; text-align: center; color: #007bff; }
                .error { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 10px 0; }
                .success { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2 style="text-align: center;">📝 Регистрация</h2>
                <form method="POST" action="/register">
                    <input type="email" name="email" placeholder="Ваш email" required>
                    <input type="password" name="password" placeholder="Пароль (минимум 6 символов)" required minlength="6">
                    <input type="password" name="confirmPassword" placeholder="Подтвердите пароль" required>
                    <button type="submit">Зарегистрироваться</button>
                </form>
                
                <div style="text-align: center; margin: 20px 0;">
                    <p style="color: #666;">Или войдите через:</p>
                    <a href="/auth/github" style="display: inline-block; padding: 10px 20px; background: #333; color: white; border-radius: 5px; text-decoration: none; margin: 5px;">🐙 GitHub</a>
                    <a href="/auth/yandex" style="display: inline-block; padding: 10px 20px; background: #FFCC00; color: black; border-radius: 5px; text-decoration: none; margin: 5px;">🌐 Яндекс</a>
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
        
        // Валидация
        if (!email || !password || !confirmPassword) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Все поля обязательны для заполнения</div>
                    <a href="/register">← Назад к регистрации</a>
                </div>
            `);
        }
        
        if (password !== confirmPassword) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Пароли не совпадают</div>
                    <a href="/register">← Назад к регистрации</a>
                </div>
            `);
        }
        
        if (password.length < 6) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Пароль должен содержать минимум 6 символов</div>
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
        
        // Хешируем пароль вручную
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
                return res.send(`
                    <div style="padding: 20px;">
                        <div class="success">✅ Регистрация успешна! Но произошла ошибка при автоматическом входе.</div>
                        <p><a href="/login">Войти в систему</a></p>
                        <p><a href="/">На главную</a></p>
                    </div>
                `);
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

// ЛОКАЛЬНЫЙ ВХОД (ИСПРАВЛЕННЫЙ)
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
                .back { display: block; margin-top: 20px; text-align: center; color: #007bff; }
                .error { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2 style="text-align: center;">🔑 Вход в систему</h2>
                <form method="POST" action="/login">
                    <input type="email" name="email" placeholder="Ваш email" required>
                    <input type="password" name="password" placeholder="Ваш пароль" required>
                    <button type="submit">Войти</button>
                </form>
                
                <div style="text-align: center; margin: 20px 0;">
                    <p style="color: #666;">Или войдите через:</p>
                    <a href="/auth/github" style="display: inline-block; padding: 10px 20px; background: #333; color: white; border-radius: 5px; text-decoration: none; margin: 5px;">🐙 GitHub</a>
                    <a href="/auth/yandex" style="display: inline-block; padding: 10px 20px; background: #FFCC00; color: black; border-radius: 5px; text-decoration: none; margin: 5px;">🌐 Яндекс</a>
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
        
        if (!email || !password) {
            return res.send(`
                <div style="padding: 20px;">
                    <div class="error">❌ Введите email и пароль</div>
                    <a href="/login">← Назад ко входу</a>
                </div>
            `);
        }
        
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
        
        // Обновляем время последнего входа
        user.lastLogin = new Date();
        await user.save();
        
        // Логиним пользователя
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

// GitHub OAuth маршруты
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
        failureRedirect: '/login-error',
        failureMessage: true 
    }),
    (req, res) => {
        res.redirect('/profile');
    }
);

// Яндекс OAuth маршруты
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
        failureRedirect: '/login-error',
        failureMessage: true 
    }),
    (req, res) => {
        res.redirect('/profile');
    }
);

// Страница ошибки входа
app.get('/login-error', (req, res) => {
    res.send(`
        <div style="padding: 40px;">
            <h2 style="color: #dc3545;">❌ Ошибка авторизации</h2>
            <p>Не удалось выполнить вход. Пожалуйста, попробуйте снова.</p>
            <p><a href="/login">← На страницу входа</a></p>
            <p><a href="/">← На главную</a></p>
        </div>
    `);
});

// Профиль пользователя
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

// Все пользователи
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
                        if (user.email) providers.push('<span class="badge badge-local">local</span>');
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

// Тест базы данных
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

// Проверка здоровья
app.get('/health', async (req, res) => {
    try {
        const dbState = mongoose.connection.readyState;
        const userCount = await User.countDocuments();
        
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
    🚀 ИСПРАВЛЕННЫЙ СЕРВЕР ЗАПУЩЕН
    ============================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:${port}
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
    • /auth/github   - Вход через GitHub
    • /auth/yandex   - Вход через Яндекс
    • /profile       - Профиль пользователя
    • /users         - Все пользователи ✅
    • /test-db       - Тест базы данных
    • /health        - Проверка здоровья
    • /logout        - Выход
    ============================================
    `);
});