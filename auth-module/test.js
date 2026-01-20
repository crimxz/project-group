const express = require('express');
const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));

// Простой маршрут для теста
app.get('/register', (req, res) => {
    res.send(`
        <h2>Тестовая регистрация</h2>
        <form action="/register" method="POST">
            Email: <input type="email" name="email"><br>
            Password: <input type="password" name="password"><br>
            <button type="submit">Отправить</button>
        </form>
    `);
});

// Простой обработчик POST без MongoDB
app.post('/register', (req, res) => {
    console.log('Получены данные:', req.body);
    res.send(`
        <h2>Успешно!</h2>
        <p>Email: ${req.body.email}</p>
        <p>Пароль: ${req.body.password}</p>
        <p>✅ Форма работает! MongoDB не требуется.</p>
    `);
});

// Простая проверка
app.get('/test', (req, res) => {
    res.send('✅ Сервер работает!');
});

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});