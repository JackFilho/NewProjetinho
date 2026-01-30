import { db } from './db.ts';

async function createWhatsappTable() {
  try {
    await db.execute(`
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
      )
    `);
    console.log('WhatsApp instances table created successfully');
  } catch (error) {
    console.error('Error creating WhatsApp table:', error.message);
  }
}

createWhatsappTable();