import mysql from 'mysql2/promise';

async function initWhatsAppTable() {
  const connection = await mysql.createConnection({
    host: '69.62.101.23',
    port: 3306,
    user: 'gilliard_salao',
    password: '$KeZT4#4ptL!9j',
    database: 'gilliard_salao'
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