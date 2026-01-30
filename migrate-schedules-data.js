/**
 * Script de migração de dados - workDays para professional_schedules
 *
 * Este script migra profissionais que usam o sistema antigo (workDays, workStartTime, workEndTime)
 * para o novo sistema de horários individuais por dia (professional_schedules).
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrateSchedules() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'inhousec_sistema'
  });

  try {
    console.log('🔄 Iniciando migração de horários...\n');

    // Buscar todos os profissionais
    const [professionals] = await connection.execute(
      'SELECT id, name, work_days, work_start_time, work_end_time FROM professionals WHERE active = 1'
    );

    console.log(`📋 Encontrados ${professionals.length} profissionais ativos\n`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const prof of professionals) {
      console.log(`\n👤 Processando: ${prof.name} (ID: ${prof.id})`);

      // Verificar se já tem schedules
      const [existing] = await connection.execute(
        'SELECT COUNT(*) as count FROM professional_schedules WHERE professional_id = ?',
        [prof.id]
      );

      if (existing[0].count > 0) {
        console.log(`   ⏭️  Pulando - já tem ${existing[0].count} horário(s) configurado(s)`);
        skippedCount++;
        continue;
      }

      // Parsear workDays (JSON array) ou usar padrão
      let workDays = [1, 2, 3, 4, 5, 6]; // Padrão: Segunda a Sábado
      if (prof.work_days) {
        try {
          workDays = JSON.parse(prof.work_days);
        } catch (e) {
          console.log(`   ⚠️  Erro ao parsear work_days, usando padrão`);
        }
      }

      const workStart = prof.work_start_time || '09:00';
      const workEnd = prof.work_end_time || '18:00';

      console.log(`   📅 Dias de trabalho: ${workDays.join(', ')}`);
      console.log(`   ⏰ Horário: ${workStart} - ${workEnd}`);

      // Criar schedule para cada dia de trabalho
      for (const dayOfWeek of workDays) {
        await connection.execute(
          `INSERT INTO professional_schedules
           (professional_id, day_of_week, start_time, end_time, is_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
          [prof.id, dayOfWeek, workStart, workEnd]
        );
      }

      console.log(`   ✅ Criados ${workDays.length} horário(s)`);
      migratedCount++;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Migração concluída!`);
    console.log(`   - Profissionais migrados: ${migratedCount}`);
    console.log(`   - Profissionais pulados: ${skippedCount}`);
    console.log(`   - Total processado: ${professionals.length}`);
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ Erro durante migração:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Executar migração
migrateSchedules()
  .then(() => {
    console.log('🎉 Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });
