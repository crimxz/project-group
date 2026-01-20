const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const YandexStrategy = require('passport-yandex').Strategy;
const mongoose = require('mongoose');
const app = express();
const port = 3000;

// Настройки OAuth (ЗАМЕНИТЕ НА СВОИ!)
const GITHUB_CLIENT_ID = 'YOUR_GITHUB_CLIENT_ID';
const GITHUB_CLIENT_SECRET = 'YOUR_GITHUB_CLIENT_SECRET';
const YANDEX_CLIENT_ID = 'YOUR_YANDEX_CLIENT_ID';
const YANDEX_CLIENT_SECRET = 'YOUR_YANDEX_CLIENT_SECRET';

// Base URL (для callback)
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Настройка сессий
app.use(session({
    secret: 'mavota-auth-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 часа
        secure: false // установите true в продакшене с HTTPS
    }
}));

// Инициализация Passport
app.use(passport.initialize());
app.use(passport.session());

// Подключение к MongoDB
mongoose.set('strictQuery', false);

const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/mavota');
        console.log('✅ MongoDB подключен');
    } catch (error) {
        console.error('❌ Ошибка MongoDB:', error.message);
    }
};

connectDB();

// Модель пользователя
const User = require('./models/User');

// Настройка Passport сериализации
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

// Стратегия GitHub
if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/github/callback`,
        scope: ['user:email']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            console.log('🔑 GitHub профиль получен:', profile.username || profile.displayName);
            const user = await User.findOrCreateGithub(profile, accessToken);
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка GitHub аутентификации:', error);
            return done(error, null);
        }
    }));
} else {
    console.log('⚠️ GitHub OAuth не настроен (отсутствуют CLIENT_ID/CLIENT_SECRET)');
}

// Стратегия Яндекс
if (YANDEX_CLIENT_ID && YANDEX_CLIENT_SECRET) {
    passport.use(new YandexStrategy({
        clientID: YANDEX_CLIENT_ID,
        clientSecret: YANDEX_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/yandex/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            console.log('🔑 Яндекс профиль получен:', profile.displayName);
            const user = await User.findOrCreateYandex(profile, accessToken);
            return done(null, user);
        } catch (error) {
            console.error('❌ Ошибка Яндекс аутентификации:', error);
            return done(error, null);
        }
    }));
} else {
    console.log('⚠️ Яндекс OAuth не настроен (отсутствуют CLIENT_ID/CLIENT_SECRET)');
}

// Middleware для проверки аутентификации
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

// Middleware для получения пользователя для шаблонов
app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

// Главная страница
app.get('/', (req, res) => {
    const user = req.user;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mavota OAuth Auth</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
                .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
                .card { background: white; border-radius: 20px; padding: 40px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
                .header { text-align: center; margin-bottom: 40px; }
                .avatar { width: 100px; height: 100px; border-radius: 50%; border: 4px solid #667eea; margin: 0 auto 20px; background: #f0f0f0; overflow: hidden; }
                .avatar img { width: 100%; height: 100%; object-fit: cover; }
                .welcome { font-size: 2.5em; margin-bottom: 10px; color: #333; }
                .email { color: #666; margin-bottom: 30px; }
                .auth-buttons { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; margin: 40px 0; }
                .btn { display: inline-flex; align-items: center; justify-content: center; padding: 15px 30px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; transition: all 0.3s; border: none; cursor: pointer; }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
                .btn-local { background: #4CAF50; color: white; }
                .btn-github { background: #333; color: white; }
                .btn-yandex { background: #FFCC00; color: #000; }
                .btn-logout { background: #f44336; color: white; }
                .btn-profile { background: #2196F3; color: white; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 40px 0; }
                .stat-card { background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; }
                .stat-number { font-size: 2em; font-weight: bold; color: #667eea; }
                .stat-label { color: #666; margin-top: 5px; }
                .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 40px; }
                .feature { background: #f0f7ff; padding: 20px; border-radius: 10px; }
                .feature h3 { color: #333; margin-top: 0; }
                .feature p { color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="header">
                        <h1 style="color: #667eea; margin-bottom: 10px;">🔐 Mavota OAuth Auth System</h1>
                        <p style="color: #666;">Полная система аутентификации с GitHub и Яндекс ID</p>
                    </div>
                    
                    ${user ? `
                        <!-- Залогиненный пользователь -->
                        <div style="text-align: center;">
                            <div class="avatar">
                                ${user.avatarUrl ? `<img src="${user.avatarUrl}" alt="Avatar">` : '👤'}
                            </div>
                            <h2 class="welcome">Добро пожаловать, ${user.displayName || user.email || 'Пользователь'}!</h2>
                            <p class="email">${user.email || 'Email не указан'}</p>
                            <p><strong>Провайдер:</strong> ${user.provider}</p>
                            <p><strong>Роль:</strong> ${user.role}</p>
                        </div>
                        
                        <div class="auth-buttons">
                            <a href="/profile" class="btn btn-profile">👤 Мой профиль</a>
                            <a href="/logout" class="btn btn-logout">🚪 Выйти</a>
                        </div>
                    ` : `
                        <!-- Не залогиненный пользователь -->
                        <div style="text-align: center; padding: 40px 0;">
                            <h2 style="color: #333; margin-bottom: 30px;">Войдите в систему</h2>
                            <p style="color: #666; margin-bottom: 40px;">Выберите способ аутентификации</p>
                            
                            <div class="auth-buttons">
                                <a href="/login" class="btn btn-local">📧 Локальный вход</a>
                                <a href="/auth/github" class="btn btn-github">🐙 GitHub</a>
                                <a href="/auth/yandex" class="btn btn-yandex">🌐 Яндекс ID</a>
                            </div>
                            
                            <p style="margin-top: 30px; color: #666;">
                                Нет аккаунта? <a href="/register" style="color: #667eea;">Зарегистрируйтесь</a>
                            </p>
                        </div>
                    `}
                    
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-number">3</div>
                            <div class="stat-label">Способа входа</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">🔐</div>
                            <div class="stat-label">Безопасная аутентификация</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">⚡</div>
                            <div class="stat-label">Мгновенный вход</div>
                        </div>
                    </div>
                    
                    <div class="features">
                        <div class="feature">
                            <h3>🔐 Локальная регистрация</h3>
                            <p>Создайте аккаунт с email и паролем</p>
                        </div>
                        <div class="feature">
                            <h3>🐙 GitHub OAuth</h3>
                            <p>Войдите через ваш GitHub аккаунт</p>
                        </div>
                        <div class="feature">
                            <h3>🌐 Яндекс ID</h3>
                            <p>Используйте Яндекс ID для входа</p>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Локальная регистрация
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
                button { width: 100%; padding: 14px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
                button:hover { background: #45a049; }
                .oauth-buttons { margin-top: 20px; text-align: center; }
                .oauth-btn { display: inline-block; width: 48%; padding: 10px; margin: 5px 1%; border-radius: 5px; text-decoration: none; font-weight: bold; }
                .oauth-btn.github { background: #333; color: white; }
                .oauth-btn.yandex { background: #FFCC00; color: black; }
                .back { display: block; margin-top: 20px; text-align: center; color: #007bff; }
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
            return res.send('<script>alert("Пароли не совпадают"); window.history.back();</script>');
        }
        
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.send('<script>alert("Пользователь с таким email уже существует"); window.history.back();</script>');
        }
        
        const newUser = new User({
            email: email.toLowerCase(),
            password,
            provider: 'local'
        });
        
        await newUser.save();
        
        // Автоматический вход после регистрации
        req.login(newUser, (err) => {
            if (err) {
                return res.redirect('/login');
            }
            return res.redirect('/');
        });
        
    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        res.send('<script>alert("Ошибка регистрации"); window.history.back();</script>');
    }
});

// Локальный вход
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

app.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.send('<script>alert("Пользователь не найден"); window.history.back();</script>');
        }
        
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.send('<script>alert("Неверный пароль"); window.history.back();</script>');
        }
        
        // Обновляем время последнего входа
        user.lastLogin = new Date();
        await user.save();
        
        req.login(user, (err) => {
            if (err) return next(err);
            return res.redirect('/');
        });
        
    } catch (error) {
        console.error('❌ Ошибка входа:', error);
        res.send('<script>alert("Ошибка входа"); window.history.back();</script>');
    }
});

// OAuth маршруты для GitHub
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback',
    passport.authenticate('github', { 
        failureRedirect: '/login',
        failureMessage: true 
    }),
    (req, res) => {
        // Обновляем время последнего входа
        req.user.lastLogin = new Date();
        req.user.save();
        res.redirect('/');
    }
);

// OAuth маршруты для Яндекс
app.get('/auth/yandex', passport.authenticate('yandex'));

app.get('/auth/yandex/callback',
    passport.authenticate('yandex', { 
        failureRedirect: '/login',
        failureMessage: true 
    }),
    (req, res) => {
        // Обновляем время последнего входа
        req.user.lastLogin = new Date();
        req.user.save();
        res.redirect('/');
    }
);

// Профиль пользователя
app.get('/profile', isAuthenticated, async (req, res) => {
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
                .connected-accounts { margin: 40px 0; }
                .account-card { display: flex; align-items: center; background: #f8f9fa; padding: 15px; border-radius: 10px; margin: 10px 0; }
                .account-icon { font-size: 24px; margin-right: 15px; }
                .account-info h3 { margin: 0; }
                .account-info p { color: #666; margin: 5px 0; }
                .connected { color: #28a745; }
                .not-connected { color: #dc3545; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                .btn:hover { background: #0056b3; }
                .btn-danger { background: #dc3545; }
                .btn-success { background: #28a745; }
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
                
                <div class="connected-accounts">
                    <h2>🔗 Подключенные аккаунты</h2>
                    
                    <div class="account-card">
                        <div class="account-icon">📧</div>
                        <div class="account-info">
                            <h3>Локальный аккаунт</h3>
                            <p>${user.email ? `<span class="connected">✅ Подключен (${user.email})</span>` : '<span class="not-connected">❌ Не подключен</span>'}</p>
                        </div>
                    </div>
                    
                    <div class="account-card">
                        <div class="account-icon">🐙</div>
                        <div class="account-info">
                            <h3>GitHub</h3>
                            <p>${user.githubId ? `<span class="connected">✅ Подключен (${user.githubUsername})</span>` : '<span class="not-connected">❌ Не подключен</span>'}</p>
                        </div>
                    </div>
                    
                    <div class="account-card">
                        <div class="account-icon">🌐</div>
                        <div class="account-info">
                            <h3>Яндекс ID</h3>
                            <p>${user.yandexId ? `<span class="connected">✅ Подключен (${user.yandexUsername})</span>` : '<span class="not-connected">❌ Не подключен</span>'}</p>
                        </div>
                    </div>
                </div>
                
                <div>
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

// Выход
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.redirect('/');
        }
        res.redirect('/');
    });
});

// Административная панель (только для админов)
app.get('/admin', isAuthenticated, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send('Доступ запрещен');
    }
    
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        const stats = {
            total: await User.countDocuments(),
            local: await User.countDocuments({ provider: 'local' }),
            github: await User.countDocuments({ githubId: { $exists: true } }),
            yandex: await User.countDocuments({ yandexId: { $exists: true } }),
            admins: await User.countDocuments({ role: 'admin' })
        };
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Админ-панель</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
                    .stat-card { background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; }
                    .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
                    .stat-label { color: #666; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #007bff; color: white; }
                    tr:hover { background: #f5f5f5; }
                    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; }
                    .badge-local { background: #4CAF50; color: white; }
                    .badge-github { background: #333; color: white; }
                    .badge-yandex { background: #FFCC00; color: black; }
                    .badge-admin { background: #dc3545; color: white; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>👑 Админ-панель</h1>
                    <p>Добро пожаловать, ${req.user.email}!</p>
                    
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-number">${stats.total}</div>
                            <div class="stat-label">Всего пользователей</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.local}</div>
                            <div class="stat-label">Локальные</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.github}</div>
                            <div class="stat-label">GitHub</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.yandex}</div>
                            <div class="stat-label">Яндекс</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.admins}</div>
                            <div class="stat-label">Администраторы</div>
                        </div>
                    </div>
                    
                    <h2>👥 Все пользователи</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Email/Имя</th>
                                <th>Провайдер</th>
                                <th>Роль</th>
                                <th>Дата регистрации</th>
                                <th>Последний вход</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(user => `
                                <tr>
                                    <td><small>${user._id}</small></td>
                                    <td>${user.displayName || user.email || 'N/A'}</td>
                                    <td>
                                        <span class="badge badge-${user.provider}">${user.provider}</span>
                                        ${user.githubId ? '<span class="badge badge-github">GitHub</span>' : ''}
                                        ${user.yandexId ? '<span class="badge badge-yandex">Яндекс</span>' : ''}
                                    </td>
                                    <td>
                                        <span class="badge ${user.role === 'admin' ? 'badge-admin' : ''}">${user.role}</span>
                                    </td>
                                    <td>${user.createdAt.toLocaleDateString()}</td>
                                    <td>${user.lastLogin ? user.lastLogin.toLocaleDateString() : 'Никогда'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 40px;">
                        <a href="/" class="btn">🏠 На главную</a>
                        <a href="/logout" class="btn" style="background: #dc3545;">🚪 Выйти</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Ошибка админ-панели:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`
    ============================================
    🚀 OAuth СЕРВЕР ЗАПУЩЕН
    ============================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:${port}
    🗄️ База: mavota
    🔑 GitHub OAuth: ${GITHUB_CLIENT_ID ? '✅ Настроен' : '❌ Не настроен'}
    🌐 Яндекс OAuth: ${YANDEX_CLIENT_ID ? '✅ Настроен' : '❌ Не настроен'}
    ============================================
    
    📌 ИНСТРУКЦИЯ:
    1. Замените YOUR_GITHUB_CLIENT_ID и YOUR_GITHUB_CLIENT_SECRET на свои
    2. Замените YOUR_YANDEX_CLIENT_ID и YOUR_YANDEX_CLIENT_SECRET на свои
    3. Настройте Callback URLs в настройках OAuth приложений:
       - GitHub: ${BASE_URL}/auth/github/callback
       - Яндекс: ${BASE_URL}/auth/yandex/callback
    ============================================
    `);
});