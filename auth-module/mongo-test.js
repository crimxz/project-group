const mongoose = require('mongoose');

async function testConnection() {
    console.log('=== ТЕСТ ПОДКЛЮЧЕНИЯ К MONGODB ===');
    
    const uris = [
        'mongodb://127.0.0.1:27017/mavota',
        'mongodb://localhost:27017/mavota',
        'mongodb://0.0.0.0:27017/mavota'
    ];
    
    for (let uri of uris) {
        console.log(`\n🔗 Попытка подключения: ${uri}`);
        
        try {
            mongoose.set('strictQuery', false);
            
            await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            
            console.log('✅ Успешное подключение!');
            console.log(`📊 Состояние: ${mongoose.connection.readyState === 1 ? 'Подключен' : 'Отключен'}`);
            console.log(`🗄️ База данных: ${mongoose.connection.db.databaseName}`);
            
            // Попробуем выполнить простую операцию
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log('📚 Коллекции:', collections.map(c => c.name));
            
            // Закрываем соединение для следующего теста
            await mongoose.disconnect();
            console.log('🔌 Соединение закрыто');
            
        } catch (error) {
            console.log('❌ Ошибка подключения:');
            console.log(`📌 Сообщение: ${error.message}`);
            console.log(`📌 Код: ${error.code || 'N/A'}`);
        }
    }
    
    console.log('\n=== ТЕСТ ЗАВЕРШЕН ===');
}

testConnection();