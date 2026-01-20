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

// Модель пользователя с паролем
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
        enum: ['local', 'github', 'yandex', 'mixed'],
        default: 'local'
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
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

// Хеширование пароля
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Метод сравнения паролей
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

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

// GitHub Strategy
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
                if (profile.emails && profile.emails[0]) {
                    user = await User.findOne({ email: profile.emails[0].value });
                }
                
                if (!user) {
                    user = new User({
                        githubId: profile.id,
                        githubUsername: profile.username,
                        githubProfileUrl: profile.profileUrl,
                        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                        displayName: profile.displayName || profile.username,
                        avatarUrl: profile._json.avatar_url,
                        provider: 'github',
                        isVerified: true
                    });
                } else {
                    user.githubId = profile.id;
                    user.githubUsername = profile.username;
                    user.githubProfileUrl = profile.profileUrl;
                    user.avatarUrl = profile._json.avatar_url || user.avatarUrl;
                    user.provider = 'mixed';
                }
                
                await user.save();
                console.log('✅ GitHub пользователь создан/обновлен');
            }
            
            user.lastLogin = new Date();
            await user.save();
            
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка GitHub:', error);
            return done(error, null);
        }
    }));
    
    console.log('✅ GitHub OAuth настроен');
} else {
    console.log('⚠️ GitHub OAuth не настроен');
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
                        isVerified: true
                    });
                } else {
                    user.yandexId = profile.id;
                    user.yandexUsername = profile.displayName;
                    user.yandexProfileUrl = `https://yandex.ru/id/${profile.id}`;
                    user.avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatarUrl;
                    user.provider = 'mixed';
                }
                
                await user.save();
                console.log('✅ Яндекс пользователь создан/обновлен');
            }
            
            user.lastLogin = new Date();
            await user.save();
            
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
                .user-info { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 40px 0; }
                .stat { background: #f0f7ff; padding: 20px; border-radius: 10px; text-align: center; }
                .stat-number { font-size: 2em; font-weight: bold; color: #667eea; }
                .stat-label { color: #666; }
                .auth-buttons { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; margin: 40px 0; }
                .btn { display: inline-flex; align-items: center; justify-content: center; padding: 15px 30px; border-radius: 10px; text-decoration: none; font-weight: bold; transition: all 0.3s; }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
                .btn-primary { background: #007bff; color: white; }
                .btn-success { background: #28a745; color: white; }
                .btn-danger { background: #dc3545; color: white; }
                .btn-github { background: #333; color: white; }
                .btn-yandex { background: #FFCC00; color: #000; }
                .connected-accounts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 40px 0; }
                .account { background: #f8f9fa; padding: 20px; border-radius: 10px; }
                .connected { color: #28a745; }
                .disconnected { color: #dc3545; }
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
                        <div style="text-align: center;">
                            <h2>👋 Добро пожаловать, ${user.displayName || user.email || 'Пользователь'}!</h2>
                            <p>Email: ${user.email || 'Не указан'}</p>
                            <p>Провайдер: ${user.provider}</p>
                            <p>Роль: ${user.role}</p>
                            <p>ID: ${user._id}</p>
                        </div>
                        
                        <div class="auth-buttons">
                            <a href="/profile" class="btn btn-primary">👤 Мой профиль</a>
                            <a href="/users" class="btn btn-primary">👥 Все пользователи</a>
                            <a href="/logout" class="btn btn-danger">🚪 Выйти</a>
                        </div>
                    ` : `
                        <!-- Неавторизованный пользователь -->
                        <div style="text-align: center; padding: 40px 0;">
                            <h2>Войдите в систему</h2>
                            
                            <div class="auth-buttons">
                                <a href="/register" class="btn btn-success">📝 Регистрация</a>
                                <a href="/login" class="btn btn-primary">🔑 Вход</a>
                                <a href="/auth/github" class="btn btn-github">🐙 GitHub</a>
                                <a href="/auth/yandex" class="btn btn-yandex">🌐 Яндекс ID</a>
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
                            <li><strong>/register</strong> - Локальная регистрация</li>
                            <li><strong>/login</strong> - Локальный вход</li>
                            <li><strong>/auth/github</strong> - Вход через GitHub</li>
                            <li><strong>/auth/yandex</strong> - Вход через Яндекс</li>
                            <li><strong>/profile</strong> - Профиль пользователя (требует входа)</li>
                            <li><strong>/users</strong> - Список всех пользователей</li>
                            <li><strong>/logout</strong> - Выход из системы</li>
                            <li><strong>/health</strong> - Проверка здоровья системы</li>
                        </ul>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ЛОКАЛЬНАЯ РЕГИСТРАЦИЯ
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
        
        const newUser = new User({
            email: email.toLowerCase(),
            password,
            provider: 'local',
            displayName: email.split('@')[0],
            isVerified: false
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

// ЛОКАЛЬНЫЙ ВХОД
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
        
        const isPasswordValid = await user.comparePassword(password);
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

// GitHub OAuth маршруты
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback',
    passport.authenticate('github', { 
        failureRedirect: '/login',
        failureMessage: true 
    }),
    (req, res) => {
        res.redirect('/profile');
    }
);

// Яндекс OAuth маршруты
app.get('/auth/yandex', passport.authenticate('yandex'));

app.get('/auth/yandex/callback',
    passport.authenticate('yandex', { 
        failureRedirect: '/login',
        failureMessage: true 
    }),
    (req, res) => {
        res.redirect('/profile');
    }
);

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

// Все пользователи
app.get('/users', requireAuth, async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        
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
                    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; }
                    .badge-local { background: #4CAF50; color: white; }
                    .badge-github { background: #333; color: white; }
                    .badge-yandex { background: #FFCC00; color: black; }
                    .count { background: #007bff; color: white; padding: 5px 10px; border-radius: 20px; }
                    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>👥 Все пользователи <span class="count">${users.length}</span></h1>
                    
                    ${users.length > 0 ? `
                        <table>
                            <thead>
                                <tr>
                                    <th>№</th>
                                    <th>ID</th>
                                    <th>Email/Имя</th>
                                    <th>Провайдер</th>
                                    <th>Роль</th>
                                    <th>Дата регистрации</th>
                                    <th>Последний вход</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map((user, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td><small>${user._id.toString().substring(0, 8)}...</small></td>
                                        <td><strong>${user.displayName || user.email || 'N/A'}</strong><br><small>${user.email || 'Нет email'}</small></td>
                                        <td>
                                            <span class="badge badge-${user.provider}">${user.provider}</span>
                                            ${user.githubId ? '<span class="badge badge-github">GitHub</span>' : ''}
                                            ${user.yandexId ? '<span class="badge badge-yandex">Яндекс</span>' : ''}
                                        </td>
                                        <td>${user.role}</td>
                                        <td>${user.createdAt.toLocaleDateString()}</td>
                                        <td>${user.lastLogin ? user.lastLogin.toLocaleDateString() : 'Никогда'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : `
                        <div style="padding: 40px; text-align: center;">
                            <h3>📭 Пользователей нет</h3>
                            <p>Будьте первым пользователем!</p>
                        </div>
                    `}
                    
                    <div style="margin-top: 40px;">
                        <a href="/" class="btn">🏠 На главную</a>
                        <a href="/profile" class="btn">👤 Мой профиль</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// Проверка здоровья
app.get('/health', async (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = ['❌ Отключен', '✅ Подключен', '🔄 Подключается', '⚠️ Отключается'];
    
    let userCount = 0;
    if (dbState === 1) {
        userCount = await User.countDocuments();
    }
    
    res.json({
        status: 'ok',
        timestamp: new Date(),
        server: {
            port: port,
            uptime: Math.round(process.uptime()) + ' сек',
            node_version: process.version
        },
        database: {
            mongodb: {
                state: dbState,
                state_text: states[dbState] || 'Неизвестно',
                database: 'mavota',
                collections: ['users'],
                users_count: userCount
            }
        },
        auth: {
            github: config.github.clientId ? '✅ Настроен' : '❌ Не настроен',
            yandex: config.yandex.clientId ? '✅ Настроен' : '❌ Не настроен',
            local: '✅ Доступна'
        }
    });
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
    🚀 ПОЛНЫЙ СЕРВЕР АВТОРИЗАЦИИ ЗАПУЩЕН
    ============================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:${port}
    🗄️ База: mavota
    🔐 Методы аутентификации:
       📧 Локальная регистрация/вход
       🐙 GitHub OAuth: ${config.github.clientId ? '✅ Настроен' : '❌ Не настроен'}
       🌐 Яндекс OAuth: ${config.yandex.clientId ? '✅ Настроен' : '❌ Не настроен'}
    ============================================
    
    📌 ОСНОВНЫЕ МАРШРУТЫ:
    • /              - Главная страница
    • /register      - Локальная регистрация
    • /login         - Локальный вход
    • /auth/github   - Вход через GitHub
    • /auth/yandex   - Вход через Яндекс
    • /profile       - Профиль пользователя
    • /users         - Все пользователи
    • /health        - Проверка здоровья
    • /logout        - Выход
    ============================================
    `);
});