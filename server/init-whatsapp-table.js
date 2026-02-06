import mysql from 'mysql2/promise';

async function initWhatsAppTable() {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_PASSWORD) {
    throw new Error('Variáveis MYSQL_HOST e MYSQL_PASSWORD são obrigatórias');
  }
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });
  
  try {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS whatsapp_instances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        instance_name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'disconnected',
        qr_code TEXT,
        webhook VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company_id (company_id)
      );
    `;
    
    await connection.execute(createTableSQL);
    console.log('WhatsApp instances table initialized successfully');
  } catch (error) {
    console.error('Error initializing WhatsApp table:', error.message);
  } finally {
    await connection.end();
  }
}

initWhatsAppTable();