import { pool } from './db';

export async function ensureAdminAlertsTables() {
  try {
    console.log('✅ Checking admin alerts tables...');
    
    // Create admin_alerts table
    await pool.execute(`
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

    // Create alert_companies table (for targeting specific companies)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS alert_companies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alert_id INT NOT NULL,
        company_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (alert_id) REFERENCES admin_alerts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_alert_company (alert_id, company_id)
      )
    `);

    console.log('✅ Admin alerts tables verified');
  } catch (error) {
    console.error('Error ensuring admin alerts tables:', error);
  }
}