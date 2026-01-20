const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Глобальная настройка Mongoose
mongoose.set('strictQuery', false);

// Подключение к MongoDB
const connectDB = async () => {
    console.log('🔄 Попытка подключения к MongoDB...');
    
    try {
        // Пробуем разные варианты подключения
        const connectionOptions = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        };
        
        await mongoose.connect('mongodb://127.0.0.1:27017/mavota', connectionOptions);
        
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

// Схема пользователя (без bcrypt для теста)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Маршруты
app.get('/', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? '✅ Подключена' : '❌ Отключена';
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mavota Auth</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .success { color: green; }
                .error { color: red; }
                .container { max-width: 800px; margin: 0 auto; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Mavota Auth System</h1>
                <p>Статус базы данных: <strong>${dbStatus}</strong></p>
                <p>Код состояния: ${mongoose.connection.readyState} (0=отключена, 1=подключена)</p>
                
                <h2>📋 Доступные маршруты:</h2>
                <ul>
                    <li><a href="/register">📝 Регистрация</a></li>
                    <li><a href="/login">🔑 Вход</a></li>
                    <li><a href="/users">👥 Все пользователи</a></li>
                    <li><a href="/health">🩺 Проверка здоровья</a></li>
                    <li><a href="/test-db">🧪 Тест базы данных</a></li>
                </ul>
                
                <h3>ℹ️ Информация:</h3>
                <p>Порт: ${port}</p>
                <p>База данных: mavota</p>
            </div>
        </body>
        </html>
    `);
});

// Регистрация
app.get('/register', (req, res) => {
    res.send(`
        <h2>📝 Регистрация</h2>
        <form method="POST" action="/register">
            <p><input type="email" name="email" placeholder="Email" required style="width: 300px;"></p>
            <p><input type="password" name="password" placeholder="Пароль" required style="width: 300px;"></p>
            <button type="submit">Зарегистрироваться</button>
        </form>
        <p><a href="/login">Уже есть аккаунт?</a></p>
    `);
});

app.post('/register', async (req, res) => {
    console.log('\n📥 POST /register - получен запрос');
    console.log('📧 Email:', req.body.email);
    console.log('🔑 Пароль:', req.body.password ? '***' : 'отсутствует');
    
    if (mongoose.connection.readyState !== 1) {
        console.log('❌ База данных не подключена!');
        return res.status(500).send(`
            <h2>❌ Ошибка сервера</h2>
            <p>База данных не подключена. Пожалуйста, проверьте:</p>
            <ol>
                <li>Запущена ли MongoDB (net start MongoDB)</li>
                <li>Правильно ли указаны параметры подключения</li>
            </ol>
            <p><a href="/">На главную</a></p>
        `);
    }
    
    try {
        const { email, password } = req.body;
        
        // Проверяем существующего пользователя
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send(`
                <h2>❌ Пользователь уже существует</h2>
                <p>Email ${email} уже зарегистрирован.</p>
                <p><a href="/login">Войти в систему</a> или <a href="/register">попробовать другой email</a></p>
            `);
        }
        
        // Создаем нового пользователя
        const newUser = new User({ email, password });
        await newUser.save();
        
        console.log(`✅ Пользователь ${email} успешно создан!`);
        console.log(`🆔 ID: ${newUser._id}`);
        
        res.send(`
            <h2>✅ Регистрация успешна!</h2>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>ID:</strong> ${newUser._id}</p>
            <p><strong>Дата регистрации:</strong> ${newUser.createdAt.toLocaleString()}</p>
            <hr>
            <p><a href="/login">Войти в систему</a></p>
            <p><a href="/">На главную</a></p>
        `);
        
    } catch (error) {
        console.error('❌ Ошибка при регистрации:', error.message);
        res.status(500).send(`
            <h2>❌ Ошибка регистрации</h2>
            <p><strong>Тип ошибки:</strong> ${error.name}</p>
            <p><strong>Сообщение:</strong> ${error.message}</p>
            <p><strong>Код:</strong> ${error.code || 'N/A'}</p>
            <p><a href="/register">Попробовать снова</a></p>
        `);
    }
});

// Все пользователи
app.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, 'email createdAt').sort({ createdAt: -1 });
        
        let html = `
            <h2>👥 Все пользователи (${users.length})</h2>
            <table border="1" cellpadding="10" style="border-collapse: collapse;">
                <tr>
                    <th>Email</th>
                    <th>Дата регистрации</th>
                </tr>
        `;
        
        users.forEach(user => {
            html += `
                <tr>
                    <td>${user.email}</td>
                    <td>${user.createdAt.toLocaleString()}</td>
                </tr>
            `;
        });
        
        html += `
            </table>
            <p><a href="/">На главную</a></p>
        `;
        
        res.send(html);
    } catch (error) {
        res.send(`
            <h2>❌ Не удалось загрузить пользователей</h2>
            <p>${error.message}</p>
            <p><a href="/">На главную</a></p>
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
            <h2>🧪 Тест базы данных</h2>
            <p><strong>Состояние:</strong> ${states[state] || '❓ Неизвестно'}</p>
            <p><strong>Код состояния:</strong> ${state}</p>
            <p><strong>База данных:</strong> ${mongoose.connection.db?.databaseName || 'Не доступна'}</p>
            <p><strong>Коллекций:</strong> ${collections.length}</p>
            <p><strong>Пользователей в базе:</strong> ${userCount}</p>
            
            ${collections.length > 0 ? `
                <h3>📚 Коллекции:</h3>
                <ul>
                    ${collections.map(c => `<li>${c.name}</li>`).join('')}
                </ul>
            ` : ''}
            
            <p><a href="/">На главную</a></p>
        `);
    } catch (error) {
        res.send(`
            <h2>❌ Ошибка теста</h2>
            <p>${error.message}</p>
        `);
    }
});

// Проверка здоровья
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        server: {
            port: port,
            uptime: process.uptime()
        },
        mongodb: {
            connected: mongoose.connection.readyState === 1,
            state: mongoose.connection.readyState,
            database: mongoose.connection.db?.databaseName
        },
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        }
    });
});

// Запускаем подключение к БД и сервер
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
    ============================================
    `);
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

// Обработка завершения процесса
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('🔌 Соединение с MongoDB закрыто');
    process.exit(0);
});