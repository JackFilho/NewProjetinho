import bcrypt from 'bcrypt';
import { pool } from './db-simple.js';

export async function authenticateCompany(email: string, password: string) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, email, password, fantasy_name FROM companies WHERE email = ?',
      [email]
    );

    const companies = rows as any[];
    
    if (companies.length === 0) {
      return null;
    }

    const company = companies[0];
    const isValid = await bcrypt.compare(password, company.password);
    
    if (!isValid) {
      return null;
    }

    return {
      id: company.id,
      email: company.email,
      fantasyName: company.fantasy_name
    };
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return null;
  }
}

export async function getCompanyById(id: number) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, email, fantasy_name FROM companies WHERE id = ?',
      [id]
    );

    const companies = rows as any[];
    
    if (companies.length === 0) {
      return null;
    }

    const company = companies[0];
    return {
      id: company.id,
      email: company.email,
      fantasyName: company.fantasy_name
    };
  } catch (error) {
    console.error('Erro ao buscar empresa:', error);
    return null;
  }
}