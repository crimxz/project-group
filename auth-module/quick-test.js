const http = require('http');

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/register') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <h1>САМЫЙ ПРОСТОЙ ТЕСТ</h1>
            <form method="POST" action="/register">
                <input name="email"><br>
                <input name="password" type="password"><br>
                <button>Отправить</button>
            </form>
        `);
    } else if (req.method === 'POST' && req.url === '/register') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            console.log('Получено:', body);
            res.end('✅ ФОРМА РАБОТАЕТ! Данные: ' + body);
        });
    } else {
        res.end('Сервер работает!');
    }
});

server.listen(3000, () => {
    console.log('✅ Самый простой сервер на порту 3000');
});