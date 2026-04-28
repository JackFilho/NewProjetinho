// Script to test professional appointments query
const mysql = require('mysql2/promise');

async function testAppointments() {
  if (!process.env.DB_PASSWORD) {
    throw new Error('Variável DB_PASSWORD é obrigatória');
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'inhouseaida'
  });

  try {
    // Get all professionals
    const [professionals] = await connection.execute('SELECT id, name, email, companyId FROM professionals LIMIT 5');
    console.log('\n📋 Professionals:');
    console.table(professionals);

    // Get all appointments
    const [appointments] = await connection.execute(`
      SELECT
        a.id,
        a.professionalId,
        a.companyId,
        a.clientName,
        a.appointmentDate,
        a.appointmentTime,
        s.name as serviceName
      FROM appointments a
      LEFT JOIN services s ON a.serviceId = s.id
      LIMIT 10
    `);
    console.log('\n📅 All Appointments:');
    console.table(appointments);

    // Get appointments by professional (if any professionals exist)
    if (professionals.length > 0) {
      const professionalId = professionals[0].id;
      const companyId = professionals[0].companyId;

      const [profAppointments] = await connection.execute(`
        SELECT
          a.id,
          a.professionalId,
          a.companyId,
          a.clientName,
          a.appointmentDate,
          a.appointmentTime,
          s.name as serviceName
        FROM appointments a
        LEFT JOIN services s ON a.serviceId = s.id
        WHERE a.professionalId = ? AND a.companyId = ?
        ORDER BY a.appointmentDate DESC, a.appointmentTime DESC
      `, [professionalId, companyId]);

      console.log(`\n📅 Appointments for Professional ${professionalId} (${professionals[0].name}):`);
      console.table(profAppointments);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

testAppointments();
