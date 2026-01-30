import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function createReminderTables() {
  const connection = await mysql.createConnection({
    host: process.env.PGHOST || 'localhost',
    user: process.env.PGUSER || 'root',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'salon_db',
    port: process.env.PGPORT || 3306
  });

  try {
    // Create reminder_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reminder_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        reminder_type VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        message_template TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);

    // Create reminder_history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reminder_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        appointment_id INT NOT NULL,
        reminder_type VARCHAR(50) NOT NULL,
        client_phone VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'sent',
        whatsapp_instance_id INT,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id)
      )
    `);

    // Insert default reminder settings for existing companies
    const [companies] = await connection.execute('SELECT id FROM companies');
    
    for (const company of companies) {
      // Check if reminder settings already exist
      const [existing] = await connection.execute(
        'SELECT id FROM reminder_settings WHERE company_id = ?',
        [company.id]
      );

      if (existing.length === 0) {
        // Insert default reminder templates
        const reminderTemplates = [
          {
            type: 'confirmation',
            template: '🎉 *Agendamento Confirmado!*\n\n📍 *{companyName}*\n💇‍♀️ *Serviço:* {serviceName}\n👨‍💼 *Profissional:* {professionalName}\n📅 *Data e Hora:* {appointmentDate} às {appointmentTime}\n\nObrigado por escolher nossos serviços! 😊'
          },
          {
            type: '24h',
            template: '⏰ *Lembrete de Agendamento*\n\n📍 *{companyName}*\n💇‍♀️ *Serviço:* {serviceName}\n👨‍💼 *Profissional:* {professionalName}\n📅 *Data e Hora:* {appointmentDate} às {appointmentTime}\n\n*Seu agendamento é amanhã!* \nNos vemos em breve! 😊'
          },
          {
            type: '1h',
            template: '🔔 *Lembrete Final*\n\n📍 *{companyName}*\n💇‍♀️ *Serviço:* {serviceName}\n👨‍💼 *Profissional:* {professionalName}\n📅 *Data e Hora:* {appointmentDate} às {appointmentTime}\n\n*Seu agendamento é em 1 hora!* \nEstamos te esperando! 🚀'
          }
        ];

        for (const reminder of reminderTemplates) {
          await connection.execute(
            'INSERT INTO reminder_settings (company_id, reminder_type, message_template) VALUES (?, ?, ?)',
            [company.id, reminder.type, reminder.template]
          );
        }
      }
    }

    console.log('✅ Reminder tables created/verified successfully');
    console.log('✅ Default reminder templates inserted for all companies');

  } catch (error) {
    console.error('❌ Error creating reminder tables:', error);
  } finally {
    await connection.end();
  }
}

createReminderTables();