import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { pool } from './db';

interface CompanySession extends Request {
  session: {
    companyId?: number;
    [key: string]: any;
  };
}

// Middleware para verificar status da assinatura e gerar alertas
export const checkSubscriptionStatus = async (req: CompanySession, res: Response, next: NextFunction) => {
  try {
    const companyId = req.session?.companyId;
    
    if (!companyId) {
      return next(); // Não é sessão de empresa
    }

    // Verificar status da empresa
    const [companyRows] = await pool.execute(`
      SELECT c.*, p.free_days, p.name as plan_name
      FROM companies c 
      LEFT JOIN plans p ON c.plan_id = p.id 
      WHERE c.id = ?
    `, [companyId]);

    if (!(companyRows as any[]).length) {
      return res.status(401).json({ message: 'Empresa não encontrada' });
    }

    const company = (companyRows as any[])[0];
    const now = new Date();
    const trialExpiresAt = new Date(company.trial_expires_at);

    console.log('🔍 Subscription check - Company data:', {
      id: company.id,
      subscription_status: company.subscription_status,
      stripe_subscription_id: company.stripe_subscription_id,
      trial_expires_at: company.trial_expires_at,
      trialExpiresAt: trialExpiresAt,
      now: now,
      isTrialExpired: trialExpiresAt <= now
    });

    // Se tem assinatura ativa (com ou sem Stripe), permitir acesso
    if (company.subscription_status === 'active') {
      console.log('✅ Company has active subscription status');
      return next();
    }

    // Se empresa está ativa (liberada pelo admin) e não está bloqueada, permitir acesso
    if (company.is_active === 1 && company.subscription_status !== 'blocked') {
      console.log('✅ Company is active (released by admin)');
      // Calcular dias restantes do trial para informação
      const daysRemaining = Math.ceil((trialExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      (req as any).trialInfo = {
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        trialExpiresAt,
        planName: company.plan_name,
        showAlert: false, // Não mostrar alerta se foi liberada pelo admin
        adminReleased: true
      };
      
      return next();
    }

    // Se empresa está bloqueada, negar acesso
    if (company.subscription_status === 'blocked') {
      console.log('❌ Company is blocked');
      return res.status(403).json({ 
        message: 'Acesso bloqueado. Sua conta foi suspensa por falta de pagamento.',
        status: 'blocked',
        needsPayment: true 
      });
    }

    // Verificar se período gratuito expirou E empresa não foi liberada pelo admin
    if (trialExpiresAt <= now && !company.stripe_subscription_id && company.subscription_status !== 'active') {
      console.log('❌ Trial expired, no subscription, and not released by admin');
      
      // Bloquear empresa apenas se não foi liberada pelo admin
      await pool.execute(`
        UPDATE companies 
        SET subscription_status = 'blocked', is_active = 0 
        WHERE id = ?
      `, [companyId]);

      return res.status(403).json({ 
        message: 'Seu período gratuito expirou. Para continuar usando o sistema, escolha um plano e efetue o pagamento.',
        status: 'expired',
        needsPayment: true,
        trialExpiredAt: trialExpiresAt
      });
    }

    // Calcular dias restantes
    const daysRemaining = Math.ceil((trialExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Verificar se deve mostrar alerta (5, 4, 3, 2, 1 dias)
    if (daysRemaining <= 5 && daysRemaining > 0) {
      await generatePaymentAlert(companyId, daysRemaining);
    }

    // Adicionar informações de trial ao request para uso nas páginas
    (req as any).trialInfo = {
      daysRemaining,
      trialExpiresAt,
      planName: company.plan_name,
      showAlert: daysRemaining <= 5
    };

    console.log('✅ Trial still valid, allowing access. Days remaining:', daysRemaining);
    next();
  } catch (error) {
    console.error('Erro ao verificar status da assinatura:', error);
    next(); // Continuar mesmo com erro para não quebrar o sistema
  }
};

// Função para gerar alertas de pagamento
async function generatePaymentAlert(companyId: number, daysRemaining: number) {
  try {
    const alertType = `${daysRemaining}_day${daysRemaining > 1 ? 's' : ''}`;
    
    // Verificar se alerta já foi criado
    const [existingAlert] = await pool.execute(`
      SELECT id FROM payment_alerts 
      WHERE company_id = ? AND alert_type = ? AND DATE(created_at) = CURDATE()
    `, [companyId, alertType]);

    if (!(existingAlert as any[]).length) {
      // Criar novo alerta
      await pool.execute(`
        INSERT INTO payment_alerts (company_id, alert_type, is_shown) 
        VALUES (?, ?, FALSE)
      `, [companyId, alertType]);
    }
  } catch (error) {
    console.error('Erro ao gerar alerta de pagamento:', error);
  }
}

// Middleware para verificar se empresa está bloqueada (para rotas administrativas)
export const checkCompanyBlocked = async (req: CompanySession, res: Response, next: NextFunction) => {
  try {
    const companyId = req.session?.companyId;
    
    if (!companyId) {
      return next();
    }

    const [companyRows] = await pool.execute(`
      SELECT subscription_status, is_active FROM companies WHERE id = ?
    `, [companyId]);

    if (!(companyRows as any[]).length) {
      return res.status(401).json({ message: 'Empresa não encontrada' });
    }

    const company = (companyRows as any[])[0];

    if (company.subscription_status === 'blocked' || company.is_active === 0) {
      return res.status(403).json({ 
        message: 'Acesso negado. Empresa bloqueada.',
        status: 'blocked',
        needsPayment: true 
      });
    }

    next();
  } catch (error) {
    console.error('Erro ao verificar se empresa está bloqueada:', error);
    next();
  }
};

// Função para obter alertas de pagamento de uma empresa
export async function getCompanyPaymentAlerts(companyId: number) {
  try {
    const [alertRows] = await pool.execute(`
      SELECT * FROM payment_alerts 
      WHERE company_id = ? AND is_shown = FALSE 
      ORDER BY created_at DESC
    `, [companyId]);

    return alertRows as any[];
  } catch (error) {
    console.error('Erro ao buscar alertas de pagamento:', error);
    return [];
  }
}

// Função para marcar alerta como visualizado
export async function markAlertAsShown(alertId: number) {
  try {
    await pool.execute(`
      UPDATE payment_alerts 
      SET is_shown = TRUE, shown_at = NOW() 
      WHERE id = ?
    `, [alertId]);
  } catch (error) {
    console.error('Erro ao marcar alerta como visualizado:', error);
  }
}