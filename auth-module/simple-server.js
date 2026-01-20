const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Подключение к MongoDB с таймаутом
mongoose.connect('mongodb://127.0.0.1:27017/mavota', {
    serverSelectionTimeoutMS: 5000, // Таймаут 5 секунд
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ MongoDB подключен');
})
.catch(err => {
    console.log('❌ Ошибка MongoDB:', err.message);
    console.log('ℹ️ Продолжаем без базы данных...');
});

// Простая схема пользователя
const userSchema = new mongoose.Schema({
    email: String,
    password: String
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Маршруты
app.get('/', (req, res) => {
    res.send(`
        <h1>Тестовая система</h1>
        <ul>
            <li><a href="/register">Регистрация</a></li>
            <li><a href="/test-db">Проверка БД</a></li>
            <li><a href="/health">Состояние сервера</a></li>
        </ul>
    `);
});

app.get('/register', (req, res) => {
    res.send(`
        <h2>Регистрация</h2>
        <form method="POST" action="/register">
            <input type="email" name="email" placeholder="email@example.com" required><br><br>
            <input type="password" name="password" placeholder="Пароль" required><br><br>
            <button type="submit">Зарегистрироваться</button>
        </form>
    `);
});

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Проверяем подключение к БД
        const dbConnected = mongoose.connection.readyState === 1;
        
        if (!dbConnected) {
            return res.send(`
                <h2>⚠️ База данных не подключена</h2>
                <p>Полученные данные:</p>
                <p>Email: ${email}</p>
                <p>Пароль: ${password}</p>
                <p>Запустите MongoDB и попробуйте снова</p>
            `);
        }
        
        // Создаем пользователя
        const user = new User({ email, password });
        await user.save();
        
        res.send(`
            <h2>✅ Успешно!</h2>
            <p>Пользователь ${email} зарегистрирован</p>
            <p>ID: ${user._id}</p>
        `);
    } catch (error) {
        res.send(`
            <h2>❌ Ошибка</h2>
            <p>${error.message}</p>
            <a href="/register">Назад</a>
        `);
    }
});

app.get('/test-db', async (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = {
        0: '❌ Отключен',
        1: '✅ Подключен',
        2: '🔄 Подключается',
        3: '⚠️ Отключается'
    };
    
    res.send(`
        <h2>Проверка базы данных</h2>
        <p>Состояние: ${states[dbState] || '❓ Неизвестно'}</p>
        <p>Код состояния: ${dbState}</p>
        <p>База данных: ${mongoose.connection.db?.databaseName || 'Не доступна'}</p>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        port: port,
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
    console.log(`🌐 Откройте http://localhost:${port}`);
});