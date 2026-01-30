// Debug para testar a validação do schema
import { insertGlobalSettingsSchema } from './shared/schema.js';

const testData = {
  systemName: "AdminPro",
  logoUrl: "http://localhost:3000/uploads/logo-1234567890-123456789.png",
  faviconUrl: "http://localhost:3000/uploads/logo-1234567890-123456789.png",
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  backgroundColor: "#f8fafc",
  textColor: "#1e293b",
  evolutionApiUrl: "",
  evolutionApiGlobalKey: "",
  defaultBirthdayMessage: "",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiTemperature: "0.7",
  openaiMaxTokens: "4000",
  defaultAiPrompt: "",
  smtpHost: "",
  smtpPort: "",
  smtpUser: "",
  smtpPassword: "",
  smtpSecure: "tls",
  smtpFromName: "",
  smtpFromEmail: "",
  customHtml: "",
  customDomainUrl: "",
  systemUrl: ""
};

console.log('🧪 Testando validação do schema...\n');

try {
  const validatedData = insertGlobalSettingsSchema.partial().parse(testData);
  console.log('✅ Validação passou!');
  console.log('Dados validados:', JSON.stringify(validatedData, null, 2));
} catch (error) {
  console.error('❌ Erro na validação:', error);
  if (error.errors) {
    console.log('\nDetalhes dos erros:');
    error.errors.forEach((err, index) => {
      console.log(`${index + 1}. ${err.path.join('.')}: ${err.message}`);
    });
  }
}