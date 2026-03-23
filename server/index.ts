import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { ensureConversationTables, ensureProfessionalPasswordColumn, storage } from "./storage";
import { ensureReviewTables } from "./create-reviews-tables";
import { startCampaignScheduler } from "./campaign-scheduler";
import { ensureSmtpColumns } from "./ensure-smtp-columns";
import { ensureResetColumns } from "./ensure-reset-columns";
import { ensureCustomHtmlColumn } from "./ensure-custom-html-column";
import { ensureCustomDomainColumn } from "./ensure-custom-domain-column";
import { ensureSystemUrlColumn } from "./ensure-system-url-column";
import { ensureAddressColumns } from "./ensure-address-columns";
import { ensureAdminAlertsTables } from "./ensure-admin-alerts-tables";
import { ensureSupportTables } from "./ensure-support-tables";
import { createInstagramWebhookRouter } from "./services/meta-instagram-webhook-handler";
import { db } from "./db";
import path from "path";

const app = express();
// Trust proxy headers (needed for secure cookies behind reverse proxy)
app.set('trust proxy', 1);
// Increase body parser limit to support large AI prompts
app.use(express.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    // Preserve raw body for webhook signature validation (X-Hub-Signature-256)
    if (req.url?.includes('/webhooks/meta/') || req.url?.includes('/api/webhook/meta') || req.url?.includes('/api/webhook/whatsapp/')) {
      req.rawBody = buf.toString('utf8');
    }
  },
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// === Diagnostic route to test Express routing ===
app.get('/webhooks/meta/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// As rotas /webhooks/meta/whatsapp (GET verification + POST bridge) estão registradas
// diretamente em registerRoutes (routes.ts) junto com o handler completo.
// Não é mais necessário o meta-webhook-handler.ts nem o ai-agent-handler.ts.

// === Instagram webhook router (BEFORE session — webhooks don't need sessions) ===
// O onMessageReceived chama a função processInstagramAIMessage exposta em routes.ts
const instagramWebhookRouter = createInstagramWebhookRouter({
  getGlobalSettings: () => storage.getGlobalSettings(),
  findInstagramInstanceByIgAccountId: (igAccountId: string) => storage.findInstagramInstanceByIgAccountId(igAccountId),
  getCompany: (companyId: number) => storage.getCompany(companyId),
  findOrCreateConversation: async (companyId, instanceId, senderId, contactName, providerType) => {
    let conv = await storage.getConversation(companyId, instanceId, senderId);
    if (!conv) {
      conv = await storage.createConversation({
        companyId,
        whatsappInstanceId: instanceId,
        phoneNumber: senderId,
        contactName,
        providerType,
      });
    }
    return conv;
  },
  saveMessage: async (conversationId, role, content, messageId, messageType) => {
    return storage.createMessage({
      conversationId,
      role,
      content,
      messageId,
      messageType,
    });
  },
  onMessageReceived: async (params) => {
    // Chama a função de IA do Instagram registrada em routes.ts
    const handler = (app as any).handleInstagramAIMessage;
    if (handler) {
      await handler(params);
    } else {
      console.warn('[ig-webhook] handleInstagramAIMessage not yet registered (routes not loaded?)');
    }
  },
});
app.use(instagramWebhookRouter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize conversation tables at startup
  await ensureConversationTables();
  
  // Initialize review tables
  await ensureReviewTables();
  
  // Ensure SMTP columns exist
  await ensureSmtpColumns();
  
  // Ensure reset token columns exist
  await ensureResetColumns();
  
  // Ensure custom HTML column exists
  await ensureCustomHtmlColumn();
  
  // Ensure custom domain URL column exists
  await ensureCustomDomainColumn();
  
  // Ensure system URL column exists
  await ensureSystemUrlColumn();
  
  // Ensure address columns exist
  await ensureAddressColumns();

  // Ensure admin alerts tables exist
  await ensureAdminAlertsTables();
  
  // Ensure support tables exist
  await ensureSupportTables();

  // Ensure professional password column exists
  await ensureProfessionalPasswordColumn();
  
  // Start campaign scheduler
  startCampaignScheduler();

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // this serves both the API and the client.
  const port = parseInt(process.env.PORT || '5001', 10);
  server.listen({
    port,
    host: "0.0.0.0"
  }, () => {
    log(`serving on port ${port}`);
  });
})();
