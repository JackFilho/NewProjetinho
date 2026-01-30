import { pool } from './server/db.js';

async function fixSmtpSecureColumn() {
  try {
    console.log('Modificando coluna smtp_secure para VARCHAR...');
    
    await pool.execute(`
      ALTER TABLE global_settings 
      MODIFY COLUMN smtp_secure VARCHAR(10) DEFAULT 'tls'
    `);
    
    console.log('✅ Coluna smtp_secure modificada com sucesso');
  } catch (error) {
    console.error('❌ Erro ao modificar coluna:', error.message);
  } finally {
    await pool.end();
  }
}

fixSmtpSecureColumn();