import mysql from 'mysql2/promise';

export async function ensureReviewTables() {
  try {
    // Use MySQL connection from environment
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || '',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || '',
    });

    // Create professional_reviews table with MySQL syntax
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS professional_reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        professional_id INT NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        client_phone VARCHAR(20) NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        service_name VARCHAR(255),
        appointment_date DATE,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_public BOOLEAN DEFAULT true,
        company_id INT NOT NULL,
        appointment_id INT,
        INDEX idx_professional_id (professional_id),
        INDEX idx_company_id (company_id),
        INDEX idx_appointment_id (appointment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ professional_reviews table created/verified');

    // Create review_invitations table with MySQL syntax
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS review_invitations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL,
        professional_id INT NOT NULL,
        client_phone VARCHAR(20) NOT NULL,
        invitation_token VARCHAR(255) NOT NULL UNIQUE,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        review_submitted_at TIMESTAMP NULL,
        status ENUM('sent', 'viewed', 'completed') DEFAULT 'sent',
        whatsapp_instance_id INT,
        company_id INT NOT NULL,
        INDEX idx_appointment_id (appointment_id),
        INDEX idx_professional_id (professional_id),
        INDEX idx_token (invitation_token),
        INDEX idx_company_id (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ review_invitations table created/verified');
    console.log('✅ Review tables setup completed');

    await connection.end();

  } catch (error) {
    console.error('❌ Error creating review tables:', error);
    // Don't throw error to prevent server startup failure
    console.log('⚠️ Continuing without review tables...');
  }
}