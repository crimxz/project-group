const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Важно для Mongoose 9.x
mongoose.set('strictQuery', false);

// Подключение к MongoDB
const connectDB = async () => {
    console.log('🔄 Попытка подключения к MongoDB...');
    
    try {
        // Mongoose 9.x: убраны useNewUrlParser и useUnifiedTopology
        await mongoose.connect('mongodb://127.0.0.1:27017/mavota', {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
        console.log('✅ MongoDB успешно подключен!');
        console.log(`📊 Состояние: ${mongoose.connection.readyState}`);
        console.log(`🗄️ База: ${mongoose.connection.db.databaseName}`);
        
        // Проверяем коллекции
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('📚 Доступные коллекции:');
        collections.forEach(col => {
            console.log(`   - ${col.name}`);
        });
        
    } catch (error) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА ПОДКЛЮЧЕНИЯ:');
        console.error(`📌 Сообщение: ${error.message}`);
        console.error(`📌 Код ошибки: ${error.code || 'N/A'}`);
        console.error('⚠️ Сервер будет работать без базы данных');
    }
};

// Схема пользователя
const userSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true
    },
    password: { 
        type: String, 
        required: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

const User = mongoose.model('User', userSchema);

// Маршруты
app.get('/', async (req, res) => {
    const state = mongoose.connection.readyState;
    const dbStatus = state === 1 ? '✅ Подключена' : '❌ Отключена';
    
    let userCount = 0;
    if (state === 1) {
        try {
            userCount = await User.countDocuments();
        } catch (e) {
            userCount = -1;
        }
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mavota Auth</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .success { color: #28a745; }
                .error { color: #dc3545; }
                .warning { color: #ffc107; }
                .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                .btn:hover { background: #0056b3; }
                .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
                .connected { background: #d4edda; border: 1px solid #c3e6cb; }
                .disconnected { background: #f8d7da; border: 1px solid #f5c6cb; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f8f9fa; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Mavota Auth System</h1>
                <h2>📊 Статус системы</h2>
                
                <div class="status ${state === 1 ? 'connected' : 'disconnected'}">
                    <h3>База данных MongoDB: <span class="${state === 1 ? 'success' : 'error'}">${dbStatus}</span></h3>
                    <p><strong>Код состояния:</strong> ${state} (0=отключена, 1=подключена, 2=подключается, 3=отключается)</p>
                    <p><strong>Пользователей в базе:</strong> ${userCount >= 0 ? userCount : 'Недоступно'}</p>
                </div>
                
                <h2>🚀 Быстрые действия</h2>
                <p>
                    <a href="/register" class="btn">📝 Регистрация</a>
                    <a href="/login" class="btn">🔑 Вход</a>
                    <a href="/users" class="btn">👥 Все пользователи</a>
                    <a href="/test-db" class="btn">🧪 Тест БД</a>
                    <a href="/health" class="btn">🩺 Проверка здоровья</a>
                </p>
                
                <h2>📡 Техническая информация</h2>
                <table>
                    <tr>
                        <th>Параметр</th>
                        <th>Значение</th>
                    </tr>
                    <tr>
                        <td>Порт сервера</td>
                        <td>${port}</td>
                    </tr>
                    <tr>
                        <td>База данных</td>
                        <td>mavota</td>
                    </tr>
                    <tr>
                        <td>MongoDB URI</td>
                        <td>mongodb://127.0.0.1:27017/mavota</td>
                    </tr>
                    <tr>
                        <td>Версия Mongoose</td>
                        <td>${mongoose.version}</td>
                    </tr>
                    <tr>
                        <td>Время запуска</td>
                        <td>${new Date().toLocaleString()}</td>
                    </tr>
                </table>
                
                <h3>📋 Инструкция</h3>
                <ol>
                    <li>Проверьте статус базы данных выше</li>
                    <li>Если статус "❌ Отключена", проверьте что MongoDB запущен</li>
                    <li>Используйте кнопки выше для навигации</li>
                </ol>
            </div>
        </body>
        </html>
    `);
});

// Регистрация
app.get('/register', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Регистрация</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
                button { width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background: #218838; }
                .back { display: inline-block; margin-top: 20px; color: #007bff; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📝 Регистрация</h2>
                <form method="POST" action="/register">
                    <div>
                        <label>Email:</label>
                        <input type="email" name="email" placeholder="example@domain.com" required>
                    </div>
                    <div>
                        <label>Пароль:</label>
                        <input type="password" name="password" placeholder="Минимум 6 символов" required minlength="6">
                    </div>
                    <button type="submit">Зарегистрироваться</button>
                </form>
                <a href="/" class="back">← На главную</a>
                <a href="/login" class="back">Уже есть аккаунт? Войти</a>
                
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                    <h4>📌 Тестовые данные:</h4>
                    <p><strong>Email:</strong> test@example.com</p>
                    <p><strong>Пароль:</strong> 123456</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.post('/register', async (req, res) => {
    console.log('\n📥 POST /register - получен запрос');
    console.log('📧 Email:', req.body.email);
    console.log('🔑 Пароль:', req.body.password ? '***' : 'отсутствует');
    
    if (mongoose.connection.readyState !== 1) {
        console.log('❌ База данных не подключена!');
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; }
                    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>❌ Ошибка подключения к базе данных</h2>
                    <div class="error">
                        <p><strong>База данных не подключена!</strong></p>
                        <p>Состояние подключения: ${mongoose.connection.readyState}</p>
                    </div>
                    
                    <h3>🔧 Что делать:</h3>
                    <ol>
                        <li>Убедитесь, что MongoDB запущен:
                            <pre>net start MongoDB</pre>
                        </li>
                        <li>Проверьте подключение:
                            <pre>mongosh --eval "db.adminCommand({ping:1})"</pre>
                        </li>
                        <li>Перезапустите сервер</li>
                    </ol>
                    
                    <p>
                        <a href="/" class="btn">На главную</a>
                        <a href="/register" class="btn">Попробовать снова</a>
                    </p>
                </div>
            </body>
            </html>
        `);
    }
    
    try {
        const { email, password } = req.body;
        
        // Проверяем существующего пользователя
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.send(`
                <div style="padding: 20px;">
                    <h2 style="color: #dc3545;">❌ Пользователь уже существует</h2>
                    <p>Email <strong>${email}</strong> уже зарегистрирован.</p>
                    <p><a href="/login">Войти в систему</a> или <a href="/register">попробовать другой email</a></p>
                </div>
            `);
        }
        
        // Создаем нового пользователя
        const newUser = new User({ 
            email: email.toLowerCase().trim(), 
            password 
        });
        await newUser.save();
        
        console.log(`✅ Пользователь ${email} успешно создан!`);
        console.log(`🆔 ID: ${newUser._id}`);
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; }
                    .info { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; margin: 15px 0; }
                    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    td { padding: 8px; border-bottom: 1px solid #ddd; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success">
                        <h2>✅ Регистрация успешна!</h2>
                    </div>
                    
                    <div class="info">
                        <h3>📋 Информация о пользователе:</h3>
                        <table>
                            <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
                            <tr><td><strong>ID пользователя:</strong></td><td>${newUser._id}</td></tr>
                            <tr><td><strong>Дата регистрации:</strong></td><td>${newUser.createdAt.toLocaleString()}</td></tr>
                            <tr><td><strong>Статус базы данных:</strong></td><td>✅ Подключена</td></tr>
                        </table>
                    </div>
                    
                    <h3>🎯 Дальнейшие действия:</h3>
                    <p>
                        <a href="/login" class="btn">🔑 Войти в систему</a>
                        <a href="/" class="btn">🏠 На главную</a>
                        <a href="/users" class="btn">👥 Посмотреть всех пользователей</a>
                    </p>
                </div>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('❌ Ошибка при регистрации:', error.message);
        res.send(`
            <div style="padding: 20px;">
                <h2 style="color: #dc3545;">❌ Ошибка регистрации</h2>
                <div style="background: #f8d7da; padding: 15px; border-radius: 5px;">
                    <p><strong>Тип ошибки:</strong> ${error.name}</p>
                    <p><strong>Сообщение:</strong> ${error.message}</p>
                    <p><strong>Код:</strong> ${error.code || 'N/A'}</p>
                </div>
                <p style="margin-top: 20px;">
                    <a href="/register" style="color: #007bff;">← Попробовать снова</a>
                </p>
            </div>
        `);
    }
});

// Все пользователи
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, 'email createdAt _id').sort({ createdAt: -1 });
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Пользователи</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #f8f9fa; position: sticky; top: 0; }
                    tr:hover { background: #f5f5f5; }
                    .count { background: #007bff; color: white; padding: 5px 10px; border-radius: 20px; }
                    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                    .btn:hover { background: #0056b3; }
                    .success { color: #28a745; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>👥 Пользователи системы <span class="count">${users.length}</span></h1>
                    <p>Статус базы данных: <span class="success">${mongoose.connection.readyState === 1 ? '✅ Подключена' : '❌ Отключена'}</span></p>
                    
                    ${users.length > 0 ? `
                        <table>
                            <thead>
                                <tr>
                                    <th>№</th>
                                    <th>ID</th>
                                    <th>Email</th>
                                    <th>Дата регистрации</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map((user, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td><small>${user._id}</small></td>
                                        <td><strong>${user.email}</strong></td>
                                        <td>${user.createdAt.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : `
                        <div style="padding: 40px; text-align: center; background: #f8f9fa; border-radius: 10px;">
                            <h3>📭 База данных пуста</h3>
                            <p>Пользователей не найдено. Будьте первым!</p>
                            <a href="/register" class="btn">Зарегистрироваться</a>
                        </div>
                    `}
                    
                    <p style="margin-top: 30px;">
                        <a href="/" class="btn">🏠 На главную</a>
                        <a href="/register" class="btn">📝 Добавить пользователя</a>
                    </p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send(`
            <div style="padding: 20px;">
                <h2>❌ Не удалось загрузить пользователей</h2>
                <p>${error.message}</p>
                <p><a href="/">На главную</a></p>
            </div>
        `);
    }
});

// Тест базы данных
app.get('/test-db', async (req, res) => {
    const state = mongoose.connection.readyState;
    const states = {
        0: '❌ Отключен',
        1: '✅ Подключен',
        2: '🔄 Подключается',
        3: '⚠️ Отключается'
    };
    
    try {
        let collections = [];
        let userCount = 0;
        
        if (state === 1) {
            collections = await mongoose.connection.db.listCollections().toArray();
            userCount = await User.countDocuments();
        }
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Тест базы данных</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .card { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .success { color: #28a745; }
                    .error { color: #dc3545; }
                    .warning { color: #ffc107; }
                    .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    td { padding: 10px; border-bottom: 1px solid #ddd; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🧪 Тест базы данных</h1>
                    
                    <div class="card">
                        <h2>📊 Основная информация</h2>
                        <table>
                            <tr><td><strong>Состояние:</strong></td><td class="${state === 1 ? 'success' : 'error'}">${states[state] || '❓ Неизвестно'}</td></tr>
                            <tr><td><strong>Код состояния:</strong></td><td>${state}</td></tr>
                            <tr><td><strong>База данных:</strong></td><td>${mongoose.connection.db?.databaseName || 'Не доступна'}</td></tr>
                            <tr><td><strong>Коллекций:</strong></td><td>${collections.length}</td></tr>
                            <tr><td><strong>Пользователей:</strong></td><td>${userCount}</td></tr>
                            <tr><td><strong>MongoDB URI:</strong></td><td>mongodb://127.0.0.1:27017/mavota</td></tr>
                        </table>
                    </div>
                    
                    ${collections.length > 0 ? `
                        <div class="card">
                            <h2>📚 Коллекции в базе</h2>
                            <ul>
                                ${collections.map(c => `<li><strong>${c.name}</strong> - ${c.type || 'коллекция'}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div class="card">
                        <h2>🔧 Диагностика</h2>
                        <p>Если база данных не подключена:</p>
                        <ol>
                            <li>Запустите MongoDB: <code>net start MongoDB</code></li>
                            <li>Проверьте статус: <code>mongosh --eval "db.adminCommand({ping:1})"</code></li>
                            <li>Перезапустите сервер</li>
                        </ol>
                    </div>
                    
                    <p>
                        <a href="/" class="btn">🏠 На главную</a>
                        <a href="/health" class="btn">🩺 Проверка здоровья</a>
                    </p>
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
app.get('/health', (req, res) => {
    const state = mongoose.connection.readyState;
    
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
                connected: state === 1,
                state: state,
                state_text: ['disconnected', 'connected', 'connecting', 'disconnecting'][state] || 'unknown',
                database: mongoose.connection.db?.databaseName || null,
                host: mongoose.connection.host || null,
                port: mongoose.connection.port || null
            }
        },
        memory: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            external: Math.round(process.memoryUsage().external / 1024 / 1024) + ' MB'
        },
        performance: {
            cpu_usage: process.cpuUsage(),
            loadavg: process.loadavg ? process.loadavg() : 'N/A'
        }
    });
});

// Вход (базовая реализация)
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
                button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background: #0056b3; }
                .back { display: inline-block; margin-top: 20px; color: #007bff; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🔑 Вход в систему</h2>
                <form method="POST" action="/login">
                    <div>
                        <label>Email:</label>
                        <input type="email" name="email" placeholder="Ваш email" required>
                    </div>
                    <div>
                        <label>Пароль:</label>
                        <input type="password" name="password" placeholder="Ваш пароль" required>
                    </div>
                    <button type="submit">Войти</button>
                </form>
                <a href="/" class="back">← На главную</a>
                <a href="/register" class="back">Нет аккаунта? Зарегистрироваться</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        if (!user) {
            return res.send(`
                <div style="padding: 20px;">
                    <h2 style="color: #dc3545;">❌ Пользователь не найден</h2>
                    <p>Пользователь с email <strong>${email}</strong> не зарегистрирован.</p>
                    <p><a href="/register">Зарегистрироваться</a> или <a href="/login">попробовать снова</a></p>
                </div>
            `);
        }
        
        // Простая проверка пароля (в реальном приложении используйте bcrypt)
        if (user.password === password) {
            res.send(`
                <div style="padding: 20px;">
                    <h2 style="color: #28a745;">✅ Вход выполнен!</h2>
                    <p>Добро пожаловать, <strong>${user.email}</strong>!</p>
                    <p>ID: ${user._id}</p>
                    <p><a href="/">На главную</a></p>
                </div>
            `);
        } else {
            res.send(`
                <div style="padding: 20px;">
                    <h2 style="color: #dc3545;">❌ Неверный пароль</h2>
                    <p>Пароль для пользователя <strong>${user.email}</strong> неверен.</p>
                    <p><a href="/login">Попробовать снова</a></p>
                </div>
            `);
        }
    } catch (error) {
        res.send(`
            <div style="padding: 20px;">
                <h2 style="color: #dc3545;">❌ Ошибка входа</h2>
                <p>${error.message}</p>
                <p><a href="/login">Попробовать снова</a></p>
            </div>
        `);
    }
});

// Обработка событий MongoDB
mongoose.connection.on('connected', () => {
    console.log('✅ Mongoose подключен к базе данных');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ Ошибка Mongoose:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ Mongoose отключен от базы данных');
});

// Запускаем подключение к БД
connectDB();

// Запуск сервера
app.listen(port, () => {
    console.log(`
    ============================================
    🚀 СЕРВЕР ЗАПУЩЕН
    ============================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:${port}
    🗄️ База: mavota
    🔧 Mongoose: ${mongoose.version}
    ============================================
    `);
});

// Обработка завершения процесса
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('🔌 Соединение с MongoDB закрыто');
    process.exit(0);
});