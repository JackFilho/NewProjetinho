// Script para debugar o problema das configurações
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
  smtpSecure: false,
  smtpFromName: "",
  smtpFromEmail: ""
};

console.log("Dados de teste para configurações:");
console.log(JSON.stringify(testData, null, 2));

// Teste de fetch
async function testSettingsUpdate() {
  try {
    const response = await fetch('http://localhost:3000/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(testData)
    });

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('Response:', responseText);
    
    if (!response.ok) {
      console.error('Erro na requisição:', response.status, responseText);
    }
  } catch (error) {
    console.error('Erro de rede:', error);
  }
}

// Descomente a linha abaixo para executar o teste
// testSettingsUpdate();