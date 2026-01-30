const mysql = require('mysql2/promise');

async function checkTrialColumn() {
  const pool = mysql.createPool({
    host: '31.97.166.39',
    port: 3306,
    user: 'agenday_dev',
    password: 'YourPassword2024',
    database: 'agenday_dev',
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    ssl: false
  });

  try {
    console.log('🔌 Conectando ao banco de dados...');
    
    // Verificar se a coluna trial_expires_at existe
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'agenday_dev' 
      AND TABLE_NAME = 'companies' 
      AND COLUMN_NAME LIKE '%trial%'
    `);
    
    console.log('📊 Colunas relacionadas a trial na tabela companies:');
    console.log(columns);
    
    if (columns.length === 0) {
      console.log('❌ Nenhuma coluna de trial encontrada! Vou adicionar...');
      
      // Adicionar as colunas necessárias
      await pool.execute(`
        ALTER TABLE companies 
        ADD COLUMN trial_expires_at DATETIME NULL,
        ADD COLUMN subscription_status ENUM('trial', 'active', 'blocked', 'cancelled') DEFAULT 'trial'
      `);
      
      console.log('✅ Colunas de trial adicionadas com sucesso!');
      
      // Atualizar empresas existentes com data de expiração do trial
      const [companies] = await pool.execute(`
        SELECT c.id, c.created_at, p.free_days 
        FROM companies c 
        LEFT JOIN plans p ON c.plan_id = p.id 
        WHERE c.trial_expires_at IS NULL
      `);
      
      for (const company of companies) {
        const freeDays = company.free_days || 30; // Padrão de 30 dias
        const createdAt = new Date(company.created_at);
        const trialExpiresAt = new Date(createdAt.getTime() + (freeDays * 24 * 60 * 60 * 1000));
        
        await pool.execute(`
          UPDATE companies 
          SET trial_expires_at = ?, subscription_status = 'trial' 
          WHERE id = ?
        `, [trialExpiresAt, company.id]);
      }
      
      console.log(`✅ ${companies.length} empresas atualizadas com datas de expiração de trial`);
    } else {
      console.log('✅ Colunas de trial já existem!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
    console.log('👋 Conexão com banco finalizada');
  }
}

checkTrialColumn();