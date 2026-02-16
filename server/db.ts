import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from "@shared/schema";

// MySQL connection configuration using environment variables
const connectionConfig = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 50,
  connectTimeout: 10000,
  idleTimeout: 60000,
  queueLimit: 0
};

console.log('Connecting to MySQL:', {
  host: connectionConfig.host,
  port: connectionConfig.port,
  user: connectionConfig.user,
  database: connectionConfig.database
});

const pool = mysql.createPool(connectionConfig);

export const db = drizzle(pool, {
  schema,
  mode: 'default' as const,
  // Set DEBUG_SQL_QUERIES=true in .env to see SQL query logs
  logger: process.env.DEBUG_SQL_QUERIES === 'true'
});

export { pool };

