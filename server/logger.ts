/**
 * Logger estruturado com redação automática de dados sensíveis.
 * Substitui console.log direto com formatação JSON estruturada em produção
 * e formatação legível em desenvolvimento.
 */

// Padrões de dados sensíveis para redação automática
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Senhas
  { pattern: /"password"\s*:\s*"[^"]*"/gi, replacement: '"password":"[REDACTED]"' },
  { pattern: /"currentPassword"\s*:\s*"[^"]*"/gi, replacement: '"currentPassword":"[REDACTED]"' },
  { pattern: /"newPassword"\s*:\s*"[^"]*"/gi, replacement: '"newPassword":"[REDACTED]"' },
  // API Keys
  { pattern: /"(api[_-]?key|apikey|openai[_-]?api[_-]?key|asaas[_-]?api[_-]?key)"\s*:\s*"[^"]*"/gi, replacement: '"$1":"[REDACTED]"' },
  // Tokens
  { pattern: /"(token|access[_-]?token|refresh[_-]?token|reset[_-]?token|session[_-]?secret)"\s*:\s*"[^"]*"/gi, replacement: '"$1":"[REDACTED]"' },
  // CPF/CNPJ (formatos brasileiros)
  { pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, replacement: "***.***.***-**" },
  { pattern: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, replacement: "**.***.***\/****-**" },
  // Emails parciais em logs (mantém domínio)
  { pattern: /"email"\s*:\s*"([^@"]{1,3})[^@"]*@([^"]+)"/gi, replacement: '"email":"$1***@$2"' },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, replacement: "Bearer [REDACTED]" },
  // sk- OpenAI keys
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: "sk-[REDACTED]" },
];

/**
 * Redige dados sensíveis de uma string
 */
function redact(message: string): string {
  let result = message;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Nível mínimo de log (em produção, ignora debug)
const MIN_LEVEL: LogLevel = process.env.NODE_ENV === "production" ? "info" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Escreve um log estruturado.
 * - Em produção: JSON de uma linha (para integração com agregadores)
 * - Em desenvolvimento: formato legível com cores
 */
function writeLog(entry: LogEntry) {
  const redactedMessage = redact(entry.message);
  const redactedEntry = { ...entry, message: redactedMessage };

  if (process.env.NODE_ENV === "production") {
    // JSON estruturado para produção
    const output = JSON.stringify(redactedEntry);
    if (entry.level === "error") {
      console.error(output);
    } else if (entry.level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  } else {
    // Formato legível para desenvolvimento
    const time = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    const prefix = `${time} [${entry.source}]`;

    if (entry.level === "error") {
      console.error(`${prefix} ERROR: ${redactedMessage}`);
    } else if (entry.level === "warn") {
      console.warn(`${prefix} WARN: ${redactedMessage}`);
    } else {
      console.log(`${prefix} ${redactedMessage}`);
    }
  }
}

/**
 * Cria um logger com source específico
 */
export function createLogger(source: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("debug")) return;
      writeLog({ timestamp: formatTimestamp(), level: "debug", source, message, ...meta });
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("info")) return;
      writeLog({ timestamp: formatTimestamp(), level: "info", source, message, ...meta });
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("warn")) return;
      writeLog({ timestamp: formatTimestamp(), level: "warn", source, message, ...meta });
    },
    error(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog("error")) return;
      writeLog({ timestamp: formatTimestamp(), level: "error", source, message, ...meta });
    },
  };
}

/**
 * Logger padrão para uso geral
 */
export const logger = createLogger("app");

/**
 * Redige dados sensíveis de um objeto (para serialização segura)
 */
export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(obj);
  return JSON.parse(redact(json));
}
