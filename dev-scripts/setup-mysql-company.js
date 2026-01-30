import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

async function setupMySQLCompany() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '69.62.101.23',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'gilliard_salao',
    password: process.env.MYSQL_PASSWORD || 'NQEc0ViGRJpS',
    database: process.env.MYSQL_DATABASE || 'gilliard_salao'
  });

  try {
    console.log('Conectado ao MySQL...');

    // Verificar se tabela companies existe
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'companies'
    `, [process.env.MYSQL_DATABASE || 'gilliard_salao']);

    if (tables.length === 0) {
      console.log('Criando tabela companies...');
      await connection.execute(`
        CREATE TABLE companies (
          id int NOT NULL AUTO_INCREMENT,
          fantasy_name varchar(255) NOT NULL,
          document varchar(20) NOT NULL UNIQUE,
          address text NOT NULL,
          email varchar(255) NOT NULL UNIQUE,
          password varchar(255) NOT NULL,
          ai_agent_prompt text,
          created_at timestamp DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);
    }

    // Verificar se empresa já existe
    const [existing] = await connection.execute(
      'SELECT id FROM companies WHERE email = ?',
      ['damasceno02@hotmail.com']
    );

    if (existing.length === 0) {
      // Criar hash da senha
      const hashedPassword = await bcrypt.hash('12345678', 10);
      
      // Inserir empresa
      await connection.execute(`
        INSERT INTO companies (fantasy_name, document, address, email, password)
        VALUES (?, ?, ?, ?, ?)
      `, [
        'Salão Damasceno',
        '12345678901',
        'Rua Exemplo, 123',
        'damasceno02@hotmail.com',
        hashedPassword
      ]);
      
      console.log('Empresa criada com sucesso!');
      console.log('Email: damasceno02@hotmail.com');
      console.log('Senha: 12345678');
    } else {
      console.log('Empresa já existe');
    }

    // Criar tabelas de pontos se não existirem
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS client_points (
        id int NOT NULL AUTO_INCREMENT,
        client_id int NOT NULL,
        company_id int NOT NULL,
        total_points int DEFAULT 0,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS points_campaigns (
        id int NOT NULL AUTO_INCREMENT,
        company_id int NOT NULL,
        name varchar(255) NOT NULL,
        required_points int NOT NULL,
        reward_service_id int NOT NULL,
        active boolean DEFAULT true,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS points_history (
        id int NOT NULL AUTO_INCREMENT,
        company_id int NOT NULL,
        client_id int NOT NULL,
        points_change int NOT NULL,
        description text NOT NULL,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);

    console.log('Tabelas de pontos criadas/verificadas');

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await connection.end();
  }
}

setupMySQLCompany().catch(console.error);