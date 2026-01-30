import session from "express-session";
import type { Express, RequestHandler } from "express";

export function getSession() {
  return session({
    secret: process.env.SESSION_SECRET || 'admin-system-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    },
    name: 'connect.sid',
  });
}

export async function setupAuth(app: Express) {
  app.use(getSession());
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    console.log('🔐 Admin auth check - Session ID:', req.sessionID);
    console.log('🔐 Admin auth check - Admin ID:', req.session.adminId);

    const adminId = req.session.adminId;
    if (!adminId) {
      console.log('❌ Admin auth failed - No adminId in session');
      return res.status(401).json({ message: "Não autenticado" });
    }

    console.log('✅ Admin authenticated:', adminId);
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