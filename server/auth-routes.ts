import { Request, Response } from 'express';
import { authenticateCompany, getCompanyById } from './auth-simple.js';

export async function loginCompany(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    const company = await authenticateCompany(email, password);

    if (!company) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Salvar na sessão
    req.session.companyId = company.id;
    req.session.user = company;

    res.json({ 
      success: true, 
      company: {
        id: company.id,
        email: company.email,
        fantasyName: company.fantasyName
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  try {
    if (!req.session.companyId) {
      return res.status(401).json({ message: 'Não autenticado' });
    }

    const company = await getCompanyById(req.session.companyId);

    if (!company) {
      return res.status(401).json({ message: 'Sessão inválida' });
    }

    res.json({
      id: company.id,
      email: company.email,
      fantasyName: company.fantasyName
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
}

export async function logoutCompany(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erro ao fazer logout:', err);
      return res.status(500).json({ message: 'Erro ao fazer logout' });
    }
    res.json({ success: true });
  });
}