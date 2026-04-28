import { pool } from "./db";

export async function ensureSupportTables() {
  try {
    console.log("✅ Checking and ensuring support tables...");
    
    // First check if support_tickets table exists and its structure
    try {
      const [columns] = await pool.execute('SHOW COLUMNS FROM support_tickets') as any;
      console.log('Current support_tickets columns:', columns.map((col: any) => col.Field).join(', '));
      
      const hasAttachments = columns.some((col: any) => col.Field === 'attachments');
      if (!hasAttachments) {
        console.log('⚠️ Attachments column missing, will add it...');
      } else {
        console.log('✅ Attachments column already exists');
      }
    } catch (error) {
      console.log('Support_tickets table does not exist yet, will be created');
    }
    
    // Create support_ticket_types table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS support_ticket_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create support_ticket_statuses table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS support_ticket_statuses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        color VARCHAR(7) DEFAULT '#6b7280',
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create support_ticket_comments table for additional information
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS support_ticket_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        company_id INT NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    
    // Check if support_tickets table exists and handle migration
    const [tableCheck] = await pool.execute(`
      SELECT COUNT(*) as table_exists 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'support_tickets'
    `) as any;
    
    if (tableCheck[0]?.table_exists > 0) {
      // Table exists, check if it has the correct columns
      const [statusIdCheck] = await pool.execute(`
        SELECT COUNT(*) as column_exists 
        FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'support_tickets' 
        AND column_name = 'status_id'
      `) as any;
      
      if (statusIdCheck[0]?.column_exists === 0) {
        // Add status_id column if it doesn't exist
        await pool.execute(`ALTER TABLE support_tickets ADD COLUMN status_id INT`);
        
        // Check if old status column exists and migrate data
        const [oldStatusCheck] = await pool.execute(`
          SELECT COUNT(*) as column_exists 
          FROM information_schema.columns 
          WHERE table_schema = DATABASE() 
          AND table_name = 'support_tickets' 
          AND column_name = 'status'
        `) as any;
        
        if (oldStatusCheck[0]?.column_exists > 0) {
          // Migrate data from old status column to status_id by mapping string values to IDs
          await pool.execute(`
            UPDATE support_tickets st
            LEFT JOIN support_ticket_statuses sts ON (
              (st.status = 'open' AND sts.name = 'Aberto') OR
              (st.status = 'in_progress' AND sts.name = 'Em Andamento') OR
              (st.status = 'resolved' AND sts.name = 'Resolvido') OR
              (st.status = 'closed' AND sts.name = 'Fechado')
            )
            SET st.status_id = sts.id
            WHERE st.status_id IS NULL AND sts.id IS NOT NULL
          `);
          
          // Drop the old status column
          await pool.execute(`ALTER TABLE support_tickets DROP COLUMN status`);
        }
        
        // Add attachments column if it doesn't exist
        const [columns] = await pool.execute('SHOW COLUMNS FROM support_tickets') as any;
        const hasAttachments = columns.some((col: any) => col.Field === 'attachments');
        
        if (!hasAttachments) {
          try {
            await pool.execute(`
              ALTER TABLE support_tickets 
              ADD COLUMN attachments TEXT
            `);
            console.log('✅ Attachments column added to support_tickets');
          } catch (error: any) {
            console.log('❌ Error adding attachments column:', error.message);
          }
        } else {
          console.log('✅ Attachments column already exists');
        }
        
        // Add foreign key constraint
        await pool.execute(`
          ALTER TABLE support_tickets 
          ADD FOREIGN KEY (status_id) REFERENCES support_ticket_statuses(id) ON DELETE SET NULL
        `);
      }
    } else {
      // Create support_tickets table with correct structure
      await pool.execute(`
        CREATE TABLE support_tickets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          company_id INT NOT NULL,
          type_id INT,
          status_id INT,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          priority VARCHAR(50) DEFAULT 'medium',
          category VARCHAR(100),
          admin_response TEXT,
          attachments TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
          FOREIGN KEY (type_id) REFERENCES support_ticket_types(id) ON DELETE SET NULL,
          FOREIGN KEY (status_id) REFERENCES support_ticket_statuses(id) ON DELETE SET NULL
        )
      `);
    }
    
    // Insert default ticket types if they don't exist (with proper duplicate checking)
    const defaultTypes = [
      { name: 'Técnico', description: 'Problemas técnicos e bugs do sistema' },
      { name: 'Financeiro', description: 'Questões relacionadas a pagamentos e cobrança' },
      { name: 'Funcionalidade', description: 'Solicitações de novas funcionalidades' },
      { name: 'Geral', description: 'Dúvidas e suporte geral' }
    ];
    
    for (const type of defaultTypes) {
      const [existing] = await pool.execute(
        'SELECT id FROM support_ticket_types WHERE name = ?',
        [type.name]
      ) as any;
      
      if (existing.length === 0) {
        await pool.execute(
          'INSERT INTO support_ticket_types (name, description, is_active) VALUES (?, ?, TRUE)',
          [type.name, type.description]
        );
      }
    }
    
    // Insert default ticket statuses if they don't exist (with proper duplicate checking)
    const defaultStatuses = [
      { name: 'Aberto', description: 'Ticket recém-criado', color: '#ef4444', sort_order: 1 },
      { name: 'Em Análise', description: 'Ticket sendo analisado pela equipe', color: '#f59e0b', sort_order: 2 },
      { name: 'Em Andamento', description: 'Ticket sendo trabalhado', color: '#3b82f6', sort_order: 3 },
      { name: 'Aguardando Cliente', description: 'Aguardando resposta do cliente', color: '#8b5cf6', sort_order: 4 },
      { name: 'Resolvido', description: 'Ticket resolvido com sucesso', color: '#10b981', sort_order: 5 },
      { name: 'Fechado', description: 'Ticket finalizado', color: '#6b7280', sort_order: 6 }
    ];
    
    for (const status of defaultStatuses) {
      const [existing] = await pool.execute(
        'SELECT id FROM support_ticket_statuses WHERE name = ?',
        [status.name]
      ) as any;
      
      if (existing.length === 0) {
        await pool.execute(
          'INSERT INTO support_ticket_statuses (name, description, color, is_active, sort_order) VALUES (?, ?, ?, TRUE, ?)',
          [status.name, status.description, status.color, status.sort_order]
        );
      }
    }
    
    console.log("✅ Support tables verified and initialized");
  } catch (error) {
    console.error("Error ensuring support tables:", error);
    throw error;
  }
}