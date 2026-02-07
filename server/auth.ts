import session from "express-session";
import type { Express, RequestHandler } from "express";

export function getSession() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET é obrigatória. Defina no arquivo .env');
  }
  return session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    },
    name: 'connect.sid',
  });
}

export async function setupAuth(app: Express) {
  // Necessário quando atrás de proxy reverso (Cloudflare, Nginx, etc.)
  // para que express-session reconheça a conexão como segura via X-Forwarded-Proto
  app.set('trust proxy', 1);
  app.use(getSession());
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    const adminId = req.session.adminId;
    if (!adminId) {
      return res.status(401).json({ message: "Não autenticado" });
    }
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
};

export const isCompanyAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    const companyId = req.session.companyId;
    if (!companyId) {
      return res.status(401).json({ message: "Não autenticado" });
    }

    // Buscar dados da empresa para verificar status
    const { storage } = await import('./storage');
    const company = await storage.getCompanyById(companyId);

    if (!company) {
      req.session.destroy();
      return res.status(401).json({ message: "Empresa não encontrada" });
    }

    // Verificar se a assinatura foi cancelada
    if (company.subscriptionStatus === 'cancelled' || company.subscriptionStatus === 'canceled' ||
        company.planStatus === 'cancelled' || company.planStatus === 'canceled') {
      req.session.destroy();
      return res.status(403).json({
        message: "Assinatura Cancelada",
        redirectTo: "/company/assinatura",
        reason: "subscription_cancelled",
        details: "Sua assinatura foi cancelada. Por favor, escolha um novo plano para continuar."
      });
    }

    next();
  } catch (error) {
    console.error("Company authentication error:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
};