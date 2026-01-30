// Teste para verificar se a atualização das configurações está funcionando
import fetch from 'node-fetch';

async function testSettingsUpdate() {
  const testData = {
    systemName: "AdminPro Teste",
    logoUrl: "http://localhost:3000/uploads/logo-test.png",
    faviconUrl: "http://localhost:3000/uploads/favicon-test.png",
    primaryColor: "#2563eb",
    secondaryColor: "#64748b",
    backgroundColor: "#f8fafc",
    textColor: "#1e293b",
    evolutionApiUrl: "https://api.test.com",
    evolutionApiGlobalKey: "test-key",
    defaultBirthdayMessage: "Feliz aniversário!",
    openaiApiKey: "sk-test-key",
    openaiModel: "gpt-4o",
    openaiTemperature: "0.7",
    openaiMaxTokens: "4000",
    defaultAiPrompt: "Você é um assistente útil.",
    smtpHost: "smtp.gmail.com",
    smtpPort: "587",
    smtpUser: "test@gmail.com",
    smtpPassword: "test-password",
    smtpFromEmail: "test@gmail.com",
    smtpFromName: "Test System",
    smtpSecure: "tls",
    customHtml: "<p>Custom HTML</p>",
    customDomainUrl: "https://custom.domain.com",
    systemUrl: "https://system.url.com"
  };

  try {
    console.log('🧪 Testando atualização das configurações...\n');
    console.log('Dados de teste:', JSON.stringify(testData, null, 2));
    
    const response = await fetch('http://localhost:3000/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3A...' // Você precisará de uma sessão válida
      },
      body: JSON.stringify(testData)
    });

    console.log('\n📊 Resposta do servidor:');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    const responseText = await response.text();
    console.log('Body:', responseText);
    
    if (response.ok) {
      console.log('\n✅ Teste passou! As configurações foram atualizadas com sucesso.');
    } else {
      console.log('\n❌ Teste falhou. Erro:', response.status, responseText);
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Descomente para executar o teste
// testSettingsUpdate();