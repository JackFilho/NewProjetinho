# Sistema de Migrations - Agenday

Este diretório contém todas as migrations do banco de dados MySQL organizadas cronologicamente.

## Como usar

1. Para executar todas as migrations:
```bash
npm run migrate
```

2. Para criar uma nova migration:
```bash
npm run migration:create <nome-da-migration>
```

3. Para reverter a última migration:
```bash
npm run migration:rollback
```

## Estrutura

- `001_initial_setup.sql` - Criação da estrutura inicial do banco
- `002_admin_system.sql` - Sistema de administradores e configurações
- `003_plans_system.sql` - Sistema de planos e assinaturas
- `004_company_system.sql` - Sistema de empresas e configurações corporativas
- `005_appointment_system.sql` - Sistema de agendamentos, profissionais, serviços e clientes
- `006_communication_system.sql` - Sistema de comunicação WhatsApp e mensagens
- `007_additional_systems.sql` - Sistemas adicionais - afiliados, suporte, tour, avaliações
- `008_trial_expiration_system.sql` - Sistema de controle de expiração de período gratuito
- `009_support_system.sql` - Sistema completo de suporte ao cliente
- `010_tour_system.sql` - Sistema de tour guiado para novos usuários
- `011_financial_system.sql` - Sistema completo de gestão financeira
- `012_inventory_system.sql` - Sistema de gestão de produtos e inventário
- `013_fix_sessions_table.sql` - Correções de estrutura e compatibilidade

## Convenções

- Todas as migrations devem ter numeração sequencial
- Nome no formato: `XXX_descricao_clara.sql`
- Sempre incluir comandos de rollback quando possível
- Documentar mudanças significativas