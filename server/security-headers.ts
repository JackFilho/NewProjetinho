import type { Request, Response, NextFunction } from "express";

/**
 * Middleware de headers de segurança HTTP.
 * Substitui a necessidade do helmet para manter zero dependências extras.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Previne clickjacking - página não pode ser carregada em iframe externo
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // Previne MIME sniffing - navegador respeita Content-Type declarado
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Controla informações enviadas no header Referer
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Remove header que expõe tecnologia do servidor
  res.removeHeader("X-Powered-By");

  // Força HTTPS em produção (HSTS - 1 ano)
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // Content Security Policy - previne XSS e injeção de conteúdo
  const csp = [
    "default-src 'self'",
    // Scripts: self + inline necessários para React/Vite
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    // Estilos: self + inline para Tailwind/Shadcn
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Fontes
    "font-src 'self' https://fonts.gstatic.com data:",
    // Imagens: self + data URIs (QR codes) + uploads
    "img-src 'self' data: blob: https:",
    // Conexões API: self + serviços externos usados
    "connect-src 'self' https://api.mercadopago.com https://api.asaas.com https://api.openai.com wss: ws:",
    // Frames: apenas self (para iframes internos se necessário)
    "frame-src 'self' https://www.mercadopago.com.br",
    // Objetos embarcados: bloqueados
    "object-src 'none'",
    // Base URI: apenas self
    "base-uri 'self'",
    // Form actions: apenas self
    "form-action 'self'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);

  // Previne que o navegador abra downloads automaticamente
  res.setHeader("X-Download-Options", "noopen");

  // Controla quais APIs do navegador o site pode usar
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=(self)"
  );

  next();
}
