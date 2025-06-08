require('dotenv').config();
console.log('EMAIL_SMTP_HOST cargado:', process.env.EMAIL_SMTP_HOST);
console.log('DB_DATABASE cargado:', process.env.DB_DATABASE);
console.log('EMAIL_TRANSPORT cargado:', process.env.EMAIL_TRANSPORT);

// Iniciar Directus
const { spawn } = require('child_process');
const directus = spawn('npx', ['directus', 'start'], { stdio: 'inherit' });