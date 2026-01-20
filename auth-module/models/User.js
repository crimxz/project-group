const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    // Локальная аутентификация
    email: { 
        type: String, 
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    password: { 
        type: String 
    },
    
    // GitHub OAuth
    githubId: {
        type: String,
        unique: true,
        sparse: true
    },
    githubUsername: String,
    githubProfileUrl: String,
    githubAccessToken: String,
    
    // Яндекс OAuth
    yandexId: {
        type: String,
        unique: true,
        sparse: true
    },
    yandexUsername: String,
    yandexProfileUrl: String,
    yandexAccessToken: String,
    
    // Общая информация
    displayName: String,
    avatarUrl: String,
    provider: {
        type: String,
        enum: ['local', 'github', 'yandex', 'mixed'],
        default: 'local'
    },
    
    // Дополнительные поля
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date
    }
});

// Хеширование пароля для локальной аутентификации
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Метод сравнения паролей
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

// Статический метод для поиска или создания через GitHub
userSchema.statics.findOrCreateGithub = async function(profile, accessToken) {
    let user = await this.findOne({ githubId: profile.id });
    
    if (!user) {
        // Проверяем, нет ли пользователя с таким email
        if (profile.emails && profile.emails[0]) {
            user = await this.findOne({ email: profile.emails[0].value });
        }
        
        if (!user) {
            // Создаем нового пользователя
            user = new this({
                githubId: profile.id,
                githubUsername: profile.username || profile.displayName,
                githubProfileUrl: profile.profileUrl,
                githubAccessToken: accessToken,
                email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                displayName: profile.displayName || profile.username,
                avatarUrl: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                provider: 'github',
                isVerified: true
            });
        } else {
            // Обновляем существующего пользователя данными GitHub
            user.githubId = profile.id;
            user.githubUsername = profile.username || profile.displayName;
            user.githubProfileUrl = profile.profileUrl;
            user.githubAccessToken = accessToken;
            user.avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatarUrl;
            user.provider = user.email ? 'mixed' : 'github';
        }
        
        await user.save();
    } else {
        // Обновляем токен доступа при повторном входе
        user.githubAccessToken = accessToken;
        user.lastLogin = new Date();
        await user.save();
    }
    
    return user;
};

// Статический метод для поиска или создания через Яндекс
userSchema.statics.findOrCreateYandex = async function(profile, accessToken) {
    let user = await this.findOne({ yandexId: profile.id });
    
    if (!user) {
        // Проверяем, нет ли пользователя с таким email
        if (profile.emails && profile.emails[0]) {
            user = await this.findOne({ email: profile.emails[0].value });
        }
        
        if (!user) {
            // Создаем нового пользователя
            user = new this({
                yandexId: profile.id,
                yandexUsername: profile.username || profile.displayName,
                yandexProfileUrl: `https://yandex.ru/id/${profile.id}`,
                yandexAccessToken: accessToken,
                email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                displayName: profile.displayName || profile.username,
                avatarUrl: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                provider: 'yandex',
                isVerified: true
            });
        } else {
            // Обновляем существующего пользователя данными Яндекс
            user.yandexId = profile.id;
            user.yandexUsername = profile.username || profile.displayName;
            user.yandexProfileUrl = `https://yandex.ru/id/${profile.id}`;
            user.yandexAccessToken = accessToken;
            user.avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatarUrl;
            user.provider = user.email ? 'mixed' : 'yandex';
        }
        
        await user.save();
    } else {
        // Обновляем токен доступа при повторном входе
        user.yandexAccessToken = accessToken;
        user.lastLogin = new Date();
        await user.save();
    }
    
    return user;
};

// Метод для безопасного представления пользователя
userSchema.methods.toSafeObject = function() {
    const user = this.toObject();
    delete user.password;
    delete user.githubAccessToken;
    delete user.yandexAccessToken;
    delete user.__v;
    return user;
};

module.exports = mongoose.model('User', userSchema);