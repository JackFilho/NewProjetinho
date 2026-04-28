# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Available Commands

Development commands (package.json scripts):
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production (both client and server)
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes using Drizzle Kit

## Project Architecture

This is a full-stack TypeScript application with a React frontend and Express.js backend, using MySQL as the database.

### Directory Structure

```
├── client/          # React frontend application
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── lib/         # Utility libraries
│   │   └── utils/       # Helper functions
├── server/          # Express.js backend
│   ├── routes.ts        # Main API routes (327KB - comprehensive)
│   ├── storage.ts       # Database operations (145KB)
│   ├── auth.ts          # Authentication logic
│   ├── db.ts            # Database connection
│   └── services/        # Business logic services
├── shared/          # Shared code between client and server
│   ├── schema.ts        # Database schema definitions (Drizzle ORM)
│   └── phone-utils.ts   # Phone number utilities
└── migrations/      # SQL migration files (018 migrations available)
```

### Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Shadcn/UI components
- **Backend**: Express.js, TypeScript, Passport.js authentication
- **Database**: MySQL with Drizzle ORM (despite drizzle.config.ts showing PostgreSQL)
- **Build Tools**: Vite (frontend), esbuild (backend bundling)
- **Session Management**: express-session with connect-pg-simple
- **Validation**: Zod schemas with Brazilian document validation (CNPJ/CPF)

### Database Configuration

The project uses MySQL in production but has configuration inconsistencies:
- `drizzle.config.ts` references PostgreSQL dialect
- Actual implementation uses MySQL (see README.md and server setup)
- Multiple database schema files exist (schema.ts, schema-pg.ts, schema-postgres.ts)

### Key Features

- Multi-tenant company management system
- Subscription plans with Stripe integration
- Professional/employee management
- Client appointment scheduling
- WhatsApp integration capabilities
- Review and rating system
- Campaign scheduling and automation
- Tour system for user onboarding
- Admin alerts and support ticket system
- Brazilian business document validation

### Authentication & Authorization

- Admin authentication with role-based access
- Professional/employee login system
- Session-based authentication using express-session
- Plan-based feature restrictions via middleware

### Important Files

- `server/routes.ts`: Main API endpoints (very large file - 327KB)
- `server/storage.ts`: Core database operations (145KB)
- `shared/schema.ts`: Complete database schema definitions
- `server/plan-middleware.ts`: Subscription plan enforcement
- `server/campaign-scheduler.ts`: Automated campaign system
- `migrations/`: Database migration history (18 migrations)

### Development Notes

- The codebase includes extensive migration scripts and database maintenance utilities
- Many loose migration files exist in the root directory (not organized in migrations/)
- Brazilian localization is integrated throughout (Portuguese interface)
- Extensive cookie-based session management for different user types
- Multiple environment-specific configuration files

### Database Migrations

Use the migrations in the `migrations/` directory for database setup. The project includes:
- Initial setup (001-003)
- Core systems (004-007)
- Additional features (008-018)
- Various utility scripts for database maintenance

### Testing & Quality

- TypeScript strict mode enabled
- Path aliases configured for clean imports (@/* for client, @shared/* for shared)
- No specific test framework identified in package.json