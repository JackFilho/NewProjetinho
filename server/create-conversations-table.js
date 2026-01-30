import mysql from 'mysql2/promise';

async function createConversationsTable() {
  const connection = await mysql.createConnection({
    host: '69.62.101.23',
    port: 3306,
    user: 'gilliard_salao',
    password: '$KeZT4#4ptL!9j',
    database: 'gilliard_salao'
  });
  
  try {
    // Create conversations table
    const createConversationsSQL = `
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        whatsapp_instance_id INT NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        contact_name VARCHAR(255),
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company_phone (company_id, phone_number),
        INDEX idx_instance_phone (whatsapp_instance_id, phone_number)
      );
    `;
    
    await connection.execute(createConversationsSQL);
    console.log('Conversations table created successfully');

    // Create messages table
    const createMessagesSQL = `
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content TEXT NOT NULL,
        message_id VARCHAR(255),
        message_type VARCHAR(50),
        delivered BOOLEAN DEFAULT false,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conversation (conversation_id),
        INDEX idx_timestamp (timestamp),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `;
    
    await connection.execute(createMessagesSQL);
    console.log('Messages table created successfully');
    
  } catch (error) {
    console.error('Error creating tables:', error.message);
  } finally {
    await connection.end();
  }
}

createConversationsTable();