const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/user');
const app = express();
const port = 3000;

// Middleware с логированием
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    console.log('📝 Body:', req.body);
    console.log('📝 Headers:', req.headers['content-type']);
    next();
});

// Подключение к MongoDB с детальным логированием
console.log('🔄 Попытка подключения к MongoDB...');
console.log('🔗 Строка подключения: mongodb://127.0.0.1:27017/mavota');

mongoose.connect('mongodb://127.0.0.1:27017/mavota', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ MongoDB подключен успешно');
    console.log('📊 Состояние подключения:', mongoose.connection.readyState);
    console.log('🗄️ База данных:', mongoose.connection.db.databaseName);
})
.catch((err) => {
    console.error('❌ Ошибка подключения MongoDB:');
    console.error('📌 Код ошибки:', err.code);
    console.error('📌 Сообщение:', err.message);
    console.error('📌 Полный стек:', err.stack);
});

// Проверка модели User
console.log('🔍 Проверка модели User:', User ? 'Загружена' : 'Не загружена');

// Маршруты
app.get('/register', (req, res) => {
    res.send(`
        <h2>Регистрация (Debug версия)</h2>
        <form action="/register" method="POST">
            <label>Email:</label><br>
            <input type="email" name="email" required><br><br>
            <label>Password:</label><br>
            <input type="password" name="password" required><br><br>
            <button type="submit">Зарегистрироваться</button>
        </form>
        <hr>
        <h3>Тестовые данные для Postman:</h3>
        <pre>POST http://localhost:3000/register
Content-Type: application/x-www-form-urlencoded

email=test@example.com&password=123456</pre>
    `);
});

app.post('/register', async (req, res) => {
    console.log('=== НАЧАЛО ОБРАБОТКИ РЕГИСТРАЦИИ ===');
    
    try {
        const { email, password } = req.body;
        console.log('📧 Email:', email);
        console.log('🔑 Password:', password ? 'Присутствует' : 'Отсутствует');

        if (!email || !password) {
            console.log('❌ Отсутствует email или password');
            return res.status(400).send('Email и пароль обязательны');
        }

        console.log('🔍 Поиск существующего пользователя...');
        const existingUser = await User.findOne({ email });
        console.log('📋 Результат поиска:', existingUser ? 'Найден' : 'Не найден');

        if (existingUser) {
            console.log('❌ Пользователь уже существует');
            return res.status(400).send('Пользователь с таким email уже существует');
        }

        console.log('🆕 Создание нового пользователя...');
        const newUser = new User({ email, password });
        console.log('📝 Данные пользователя:', { email, password: '***' });

        console.log('💾 Сохранение в базу данных...');
        await newUser.save();
        console.log('✅ Пользователь успешно сохранен');

        // Получаем сохраненного пользователя для проверки
        const savedUser = await User.findOne({ email }).select('-password');
        console.log('📊 Сохраненные данные:', savedUser);

        console.log('=== РЕГИСТРАЦИЯ УСПЕШНА ===');
        res.send(`
            <h2>✅ Регистрация успешна!</h2>
            <p>Email: ${email}</p>
            <p>ID: ${newUser._id}</p>
            <p>Роль: ${newUser.role}</p>
            <a href="/login">Перейти к входу</a>
        `);
    } catch (error) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:');
        console.error('📌 Название:', error.name);
        console.error('📌 Сообщение:', error.message);
        console.error('📌 Стек:', error.stack);
        
        if (error.name === 'ValidationError') {
            console.error('📌 Ошибки валидации:', error.errors);
        }
        if (error.name === 'MongoServerError') {
            console.error('📌 Код ошибки MongoDB:', error.code);
        }
        
        res.status(500).send(`
            <h2>❌ Ошибка регистрации</h2>
            <p><strong>Тип ошибки:</strong> ${error.name}</p>
            <p><strong>Сообщение:</strong> ${error.message}</p>
            <p><strong>Код:</strong> ${error.code || 'N/A'}</p>
        `);
    }
});

// Дополнительные маршруты для диагностики
app.get('/health', async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected';
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    res.json({
        status: 'ok',
        timestamp: new Date(),
        mongodb: {
            connection: dbStatus,
            database: mongoose.connection.db.databaseName,
            collections: collections.map(c => c.name)
        },
        memory: process.memoryUsage()
    });
});

app.get('/test-db', async (req, res) => {
    try {
        const testDoc = { test: 'connection', timestamp: new Date() };
        const result = await mongoose.connection.db.collection('test').insertOne(testDoc);
        const count = await mongoose.connection.db.collection('test').countDocuments();
        
        res.json({
            success: true,
            insertedId: result.insertedId,
            testCount: count,
            message: 'Тест записи в базу данных пройден'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`
    ====================================
    🚀 СЕРВЕР ЗАПУЩЕН В РЕЖИМЕ ОТЛАДКИ
    ====================================
    📍 Порт: ${port}
    🌐 URL: http://localhost:${port}
    📊 Health Check: http://localhost:${port}/health
    🧪 Test DB: http://localhost:${port}/test-db
    ====================================
    `);
});