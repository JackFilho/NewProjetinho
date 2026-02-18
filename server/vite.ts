import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { storage } from "./storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const viteLogger = createLogger();

interface MetaTags {
  title: string;
  description: string;
  image?: string;
}

// Cache for global settings (refreshes every 5 minutes)
let globalSettingsCache: any = null;
let globalSettingsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getMetaTagsForRoute(url: string, req: any): Promise<MetaTags> {
  const baseUrl = process.env.BASE_URL || "https://sistema.inhousesaude.com";

  // Fetch global settings from database with caching
  let globalSettings = globalSettingsCache;
  const now = Date.now();

  if (!globalSettings || (now - globalSettingsCacheTime) > CACHE_DURATION) {
    try {
      globalSettings = await storage.getGlobalSettings();
      globalSettingsCache = globalSettings;
      globalSettingsCacheTime = now;
    } catch (error) {
      console.error("Error fetching global settings:", error);
      // Use cached settings if available even if expired
      globalSettings = globalSettingsCache;
    }
  }

  // Use settings from database or fallback to defaults
  const systemName = globalSettings?.systemName || "AIDA - Inhouse Company";
  const systemDescription = globalSettings?.systemDescription ||
    "Sistema completo de agendamento para profissionais e empresas. Gerencie consultas, clientes e horários de forma eficiente.";
  const systemUrl = globalSettings?.systemUrl || baseUrl;
  const logoUrl = globalSettings?.logoUrl
    ? (globalSettings.logoUrl.startsWith('http') ? globalSettings.logoUrl : `${systemUrl}${globalSettings.logoUrl}`)
    : `${baseUrl}/icons/icon-512x512.png`;

  const defaultMeta: MetaTags = {
    title: `${systemName} - Sistema de Agendamento`,
    description: systemDescription,
    image: logoUrl,
  };

  // Match specific routes for custom meta tags
  if (url.startsWith("/company/")) {
    return {
      title: `Área da Empresa - ${systemName}`,
      description: "Gerencie seu negócio, profissionais, clientes e agendamentos em um só lugar.",
      image: logoUrl,
    };
  }

  if (url.startsWith("/admin")) {
    return {
      title: `Administração - ${systemName}`,
      description: `Painel administrativo do sistema ${systemName}.`,
      image: logoUrl,
    };
  }

  if (url.startsWith("/professional/")) {
    return {
      title: `Área do Profissional - ${systemName}`,
      description: "Acesse seus agendamentos, clientes e gerencie sua agenda.",
      image: logoUrl,
    };
  }

  // Check if it's a company public page (example: /empresas/:slug or /c/:slug)
  const companyPageMatch = url.match(/^\/(empresas?|c)\/([^/?]+)/);
  if (companyPageMatch) {
    const slug = companyPageMatch[2];
    try {
      // Try to fetch company data by slug
      const companies = await storage.getCompanies();
      const company = companies.find(c =>
        c.name?.toLowerCase().replace(/\s+/g, '-') === slug ||
        c.id.toString() === slug
      );

      if (company) {
        return {
          title: `${company.name} - Agende Online`,
          description: `Agende seu horário com ${company.name} de forma rápida e fácil.`,
          image: company.logoUrl || logoUrl,
        };
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
    }

    // Fallback for company pages
    return {
      title: `Agende Online - ${systemName}`,
      description: `Faça seu agendamento online de forma rápida e fácil através do ${systemName}.`,
      image: logoUrl,
    };
  }

  return defaultMeta;
}

async function injectDynamicMetaTags(template: string, url: string, req: any): Promise<string> {
  const meta = await getMetaTagsForRoute(url, req);
  const baseUrl = process.env.BASE_URL || "https://sistema.inhousesaude.com";

  // Replace title
  template = template.replace(
    /<title>.*?<\/title>/,
    `<title>${meta.title}</title>`
  );

  // Replace or add meta description
  template = template.replace(
    /<meta name="description" content=".*?"\/>/,
    `<meta name="description" content="${meta.description}" />`
  );

  // Replace OG tags
  template = template.replace(
    /<meta property="og:title" content=".*?"\/>/,
    `<meta property="og:title" content="${meta.title}" />`
  );
  template = template.replace(
    /<meta property="og:description" content=".*?"\/>/,
    `<meta property="og:description" content="${meta.description}" />`
  );
  template = template.replace(
    /<meta property="og:image" content=".*?"\/>/,
    `<meta property="og:image" content="${meta.image}" />`
  );
  template = template.replace(
    /<meta property="og:url" content=".*?"\/>/,
    `<meta property="og:url" content="${baseUrl}${url}" />`
  );

  // Replace Twitter tags
  template = template.replace(
    /<meta property="twitter:title" content=".*?"\/>/,
    `<meta property="twitter:title" content="${meta.title}" />`
  );
  template = template.replace(
    /<meta property="twitter:description" content=".*?"\/>/,
    `<meta property="twitter:description" content="${meta.description}" />`
  );
  template = template.replace(
    /<meta property="twitter:image" content=".*?"\/>/,
    `<meta property="twitter:image" content="${meta.image}" />`
  );
  template = template.replace(
    /<meta property="twitter:url" content=".*?"\/>/,
    `<meta property="twitter:url" content="${baseUrl}${url}" />`
  );

  return template;
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function clearMetaTagsCache() {
  globalSettingsCache = null;
  globalSettingsCacheTime = 0;
  log("Meta tags cache cleared");
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    fs: {
      strict: false,
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, ".."),
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "node_modules"),
        path.resolve(__dirname, "../node_modules"),
        path.resolve(__dirname, "../../node_modules"),
        // Allow specific path that's causing the error
        "E:\\site-halarum\\node_modules",
        "E:\\brelli\\node_modules",
        // Allow all node_modules directories
        "**\\node_modules\\**",
      ],
    },
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");

      // Inject dynamic meta tags based on route
      template = await injectDynamicMetaTags(template, url, req);

      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res) => {
    const url = req.originalUrl;
    const indexPath = path.resolve(distPath, "index.html");

    try {
      let template = await fs.promises.readFile(indexPath, "utf-8");

      // Inject dynamic meta tags based on route
      template = await injectDynamicMetaTags(template, url, req);

      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      res.sendFile(indexPath);
    }
  });
}
