import mysql from 'mysql2/promise';

async function createAdminAlertsTables() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gilliard_salao'
    });

    console.log('Creating admin_alerts table...');
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admin_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'warning', 'success', 'error') NOT NULL DEFAULT 'info',
        show_to_all_companies BOOLEAN NOT NULL DEFAULT true,
        target_company_ids JSON,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating company_alert_views table...');
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS company_alert_views (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        alert_id INT NOT NULL,
        viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (alert_id) REFERENCES admin_alerts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_company_alert (company_id, alert_id)
      )
    `);

    console.log('✅ Admin alerts tables created successfully');
    await connection.end();
    
  } catch (error) {
    console.error('Error creating admin alerts tables:', error);
    process.exit(1);
  }
}

createAdminAlertsTables();