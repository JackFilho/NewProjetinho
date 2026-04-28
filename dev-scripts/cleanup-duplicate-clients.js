import mysql from 'mysql2/promise';

async function cleanupDuplicateClients() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gilliard_salao'
  });

  try {
    console.log('🔍 Searching for duplicate clients...');
    
    // Find duplicate clients based on normalized phone numbers
    const [duplicates] = await connection.execute(`
      SELECT 
        company_id,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+55', '') as normalized_phone,
        COUNT(*) as count
      FROM clients 
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY company_id, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+55', '')
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate clients found');
      return;
    }

    console.log(`Found ${duplicates.length} groups of duplicate clients`);

    for (const duplicate of duplicates) {
      console.log(`\n📱 Processing duplicates for phone: ${duplicate.normalized_phone}`);
      
      // Get all clients with this normalized phone
      const [clients] = await connection.execute(`
        SELECT id, name, phone, email, created_at
        FROM clients 
        WHERE company_id = ? AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+55', '') = ?
        ORDER BY created_at ASC
      `, [duplicate.company_id, duplicate.normalized_phone]);

      if (clients.length <= 1) continue;

      // Keep the first (oldest) client, delete the rest
      const keepClient = clients[0];
      const deleteClients = clients.slice(1);

      console.log(`👤 Keeping client: ${keepClient.name} (ID: ${keepClient.id}) - Created: ${keepClient.created_at}`);
      
      for (const clientToDelete of deleteClients) {
        console.log(`🗑️ Deleting duplicate: ${clientToDelete.name} (ID: ${clientToDelete.id}) - Created: ${clientToDelete.created_at}`);
        
        // Update any appointments that reference the duplicate client
        await connection.execute(`
          UPDATE appointments 
          SET client_phone = ? 
          WHERE client_phone = ? AND company_id = ?
        `, [keepClient.phone, clientToDelete.phone, duplicate.company_id]);

        // Delete the duplicate client
        await connection.execute('DELETE FROM clients WHERE id = ?', [clientToDelete.id]);
      }
    }

    console.log('\n✅ Duplicate cleanup completed successfully');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await connection.end();
  }
}

// Run the cleanup
cleanupDuplicateClients().catch(console.error);