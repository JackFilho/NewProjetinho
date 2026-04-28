import mysql from 'mysql2/promise';

async function cleanupDuplicates() {
  const connection = await mysql.createConnection({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  });

  try {
    // Find duplicate appointments for Gilliard
    const [duplicates] = await connection.execute(`
      SELECT id, client_name, appointment_date, appointment_time 
      FROM appointments 
      WHERE client_name = 'Gilliard' 
      AND appointment_date = '2025-06-13'
      ORDER BY id
    `);

    console.log('Duplicate appointments found:', duplicates);

    // Keep only the first one, delete the rest
    if (duplicates.length > 1) {
      const idsToDelete = duplicates.slice(1).map(d => d.id);
      
      for (const id of idsToDelete) {
        await connection.execute('DELETE FROM appointments WHERE id = ?', [id]);
        console.log(`Deleted appointment ID: ${id}`);
      }
    }

    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

cleanupDuplicates();