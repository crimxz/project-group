const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/user');
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Добавляем поддержку JSON

// Подключение к MongoDB
const mongoURI = 'mongodb://127.0.0.1:27017/mavota'; // Используем IP вместо localhost

const connectDB = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('✅ MongoDB connected successfully');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    }
};

connectDB();

// Главная страница
app.get('/', (req, res) => {
    res.send('Hello World');
});

// GET /register - форма регистрации
app.get('/register', (req, res) => {
    res.send(`
        <h2>Регистрация</h2>
        <form action="/register" method="POST">
            <label>Email:</label><br>
            <input type="email" name="email" required><br><br>
            <label>Password:</label><br>
            <input type="password" name="password" required><br><br>
            <button type="submit">Зарегистрироваться</button>
        </form>
        <hr>
        <a href="/login">Вход</a>
    `);
});

// POST /register - обработка регистрации
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('📥 Регистрация:', email);

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('❌ Пользователь уже существует');
        }

        const newUser = new User({ email, password });
        await newUser.save();

        console.log('✅ Пользователь создан:', email);
        res.send(`✅ Пользователь ${email} успешно зарегистрирован!`);
    } catch (error) {
        console.error('❌ Ошибка регистрации:', error.message);
        res.status(500).send('Ошибка регистрации');
    }
});

// GET /login - форма входа
app.get('/login', (req, res) => {
    res.send(`
        <h2>Вход</h2>
        <form action="/login" method="POST">
            <label>Email:</label><br>
            <input type="email" name="email" required><br><br>
            <label>Password:</label><br>
            <input type="password" name="password" required><br><br>
            <button type="submit">Войти</button>
        </form>
    `);
});

// POST /login - аутентификация
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).send('❌ Пользователь не найден');
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).send('❌ Неверный пароль');
        }

        res.send(`✅ Вход выполнен! Добро пожаловать, ${email}`);
    } catch (error) {
        console.error('❌ Ошибка входа:', error.message);
        res.status(500).send('Ошибка входа');
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${port}`);
});