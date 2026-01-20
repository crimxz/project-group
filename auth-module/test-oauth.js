require('dotenv').config();

console.log('🧪 Тест OAuth конфигурации');
console.log('==========================');

// Проверка переменных окружения
const requiredVars = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET', 
    'YANDEX_CLIENT_ID',
    'YANDEX_CLIENT_SECRET',
    'MONGODB_URI'
];

let allGood = true;

requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
        console.log(`❌ ${varName}: ОТСУТСТВУЕТ`);
        allGood = false;
    } else if (value.includes('YOUR_') || value.includes('ваш_')) {
        console.log(`❌ ${varName}: НЕ ЗАМЕНЕН (${value})`);
        allGood = false;
    } else {
        console.log(`✅ ${varName}: УСТАНОВЛЕН`);
    }
});

// Проверка форматов
console.log('\n📋 Проверка форматов:');

const githubId = process.env.GITHUB_CLIENT_ID;
if (githubId) {
    if (githubId.startsWith('O')) {
        console.log(`✅ GitHub Client ID: OAuth App формат (классический)`);
    } else if (githubId.startsWith('Iv')) {
        console.log(`✅ GitHub Client ID: GitHub App формат (новый)`);
    } else {
        console.log(`⚠️ GitHub Client ID: Неизвестный формат: ${githubId.substring(0, 10)}...`);
    }
}

const yandexId = process.env.YANDEX_CLIENT_ID;
if (yandexId) {
    if (yandexId.length === 32) {
        console.log(`✅ Яндекс Client ID: Правильная длина (32 символа)`);
    } else {
        console.log(`⚠️ Яндекс Client ID: Неправильная длина (${yandexId.length} вместо 32)`);
    }
}

// Генерация ссылок для проверки
console.log('\n🔗 Тестовые ссылки:');
console.log(`GitHub OAuth: http://localhost:3000/auth/github`);
console.log(`Яндекс OAuth: http://localhost:3000/auth/yandex`);
console.log(`Проверка конфигурации: http://localhost:3000/config`);

if (allGood) {
    console.log('\n🎉 Все проверки пройдены! Запускайте сервер.');
} else {
    console.log('\n❌ Есть проблемы с конфигурацией. Исправьте .env файл.');
}