import { z } from "zod";

// Schema atual
const companyProfileSchema = z.object({
  fantasyName: z.string().min(2, "Nome fantasia deve ter pelo menos 2 caracteres"),
  document: z.string().min(11, "CNPJ/CPF é obrigatório"),
  email: z.string().email("E-mail inválido"),
  address: z.string().min(5, "Endereço é obrigatório"),
  phone: z.string().optional(),
  zipCode: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  planId: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  tourEnabled: z.boolean().optional(),
  password: z.union([
    z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    z.literal(""),
    z.undefined()
  ]).optional(),
});

console.log("🧪 Testando validação de senha...\n");

// Teste 1: Sem senha
console.log("1. Teste sem campo senha:");
try {
  const result = companyProfileSchema.parse({
    fantasyName: "Empresa Teste",
    document: "12345678901",
    email: "teste@teste.com",
    address: "Rua Teste, 123"
  });
  console.log("✅ PASSOU");
} catch (error) {
  console.log("❌ FALHOU:", error.errors[0]?.message);
}

// Teste 2: Com senha vazia
console.log("\n2. Teste com senha vazia:");
try {
  const result = companyProfileSchema.parse({
    fantasyName: "Empresa Teste",
    document: "12345678901",
    email: "teste@teste.com",
    address: "Rua Teste, 123",
    password: ""
  });
  console.log("✅ PASSOU");
} catch (error) {
  console.log("❌ FALHOU:", error.errors[0]?.message);
}

// Teste 3: Com senha curta (deve falhar)
console.log("\n3. Teste com senha curta (deve falhar):");
try {
  const result = companyProfileSchema.parse({
    fantasyName: "Empresa Teste",
    document: "12345678901",
    email: "teste@teste.com",
    address: "Rua Teste, 123",
    password: "123"
  });
  console.log("❌ PASSOU quando deveria falhar");
} catch (error) {
  console.log("✅ FALHOU corretamente:", error.errors[0]?.message);
}

// Teste 4: Com senha válida
console.log("\n4. Teste com senha válida:");
try {
  const result = companyProfileSchema.parse({
    fantasyName: "Empresa Teste",
    document: "12345678901",
    email: "teste@teste.com",
    address: "Rua Teste, 123",
    password: "123456"
  });
  console.log("✅ PASSOU");
} catch (error) {
  console.log("❌ FALHOU:", error.errors[0]?.message);
}