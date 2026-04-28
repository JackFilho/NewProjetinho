import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import type { Plan } from "@shared/schema";
import type { Session, SessionData } from "express-session";

// Define a type for company session data
interface CompanySession extends Session {
  companyId: number;
}

// Define a type for the request object with company plan
export interface RequestWithPlan extends Request {
  companyPlan?: Plan;
  session: CompanySession;
}

// Middleware para carregar informações do plano da empresa
export const loadCompanyPlan = async (req: RequestWithPlan, res: Response, next: NextFunction) => {
  try {
    const session = req.session as CompanySession;
    
    if (!session.companyId) {
      return next(); // Não é uma sessão de empresa, continua
    }

    // Buscar empresa e seu plano
    const company = await storage.getCompany(session.companyId);
    if (!company || !company.planId) {
      return next();
    }

    // Buscar detalhes do plano
    const plan = await storage.getPlan(company.planId);
    if (!plan) {
      return next();
    }

    // Adicionar informações do plano à request
    req.companyPlan = {
      id: plan.id,
      name: plan.name,
      price: plan.price,
      freeDays: plan.freeDays,
      stripePriceId: plan.stripePriceId,
      stripeProductId: plan.stripeProductId,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      maxProfessionals: plan.maxProfessionals || 1,
      permissions: plan.permissions || {
        dashboard: true,
        appointments: true,
        services: true,
        professionals: true,
        clients: true,
        reviews: true,
        tasks: true,
        pointsProgram: true,
        loyalty: true,
        inventory: true,
        messages: true,
        coupons: true,
        financial: true,
        reports: true,
        settings: true,
        support: true, // Always allow support access
      }
    };

    next();
  } catch (error) {
    console.error('Error loading company plan:', error);
    next(); // Continua mesmo com erro
  }
};

// Middleware para verificar permissão do plano
export const requirePermission = (permission: keyof Plan['permissions']) => {
  return (req: RequestWithPlan, res: Response, next: NextFunction) => {
    
    const session = req.session as CompanySession;

    // Se não for sessão de empresa, permitir acesso (ex: admin)
    if (!session.companyId) {
      return next();
    }

    if (!req.companyPlan) {
      return res.status(403).json({ message: "Plano da empresa não carregado" });
    }

    const permissions = req.companyPlan.permissions || {};
    
    if (permissions[permission]) {
      next(); // Tem permissão, continua
    } else {
      res.status(403).json({ 
        message: `Acesso negado. Seu plano "${req.companyPlan.name}" não inclui a funcionalidade de "${permission}".`,
        requiredPermission: permission
      });
    }
  };
};

// Middleware para verificar limite de profissionais
export const checkProfessionalsLimit = async (req: RequestWithPlan, res: Response, next: NextFunction) => {
  try {
    const session = req.session as CompanySession;

    if (!session.companyId) {
      return next(); // Não é uma sessão de empresa
    }

    if (!req.companyPlan) {
      return res.status(403).json({ message: 'Acesso negado - plano não encontrado' });
    }

    const currentCount = await storage.getProfessionalsCount(session.companyId);
    
    if (currentCount >= req.companyPlan.maxProfessionals) {
      return res.status(403).json({ 
        message: `Limite de profissionais atingido. Seu plano permite no máximo ${req.companyPlan.maxProfessionals} profissionais.`,
        limit: req.companyPlan.maxProfessionals,
        current: currentCount
      });
    }

    next();
  } catch (error) {
    console.error('Error checking professionals limit:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

function getPermissionName(permission: string): string {
  const names: Record<string, string> = {
    dashboard: 'Dashboard',
    appointments: 'Agendamentos',
    services: 'Serviços',
    professionals: 'Profissionais',
    clients: 'Clientes',
    reviews: 'Avaliações',
    tasks: 'Tarefas',
    pointsProgram: 'Programa de Pontos',
    loyalty: 'Fidelidade',
    inventory: 'Inventário',
    messages: 'Mensagens',
    coupons: 'Cupons',
    financial: 'Financeiro',
    reports: 'Relatórios',
    settings: 'Configurações'
  };
  return names[permission] || permission;
}