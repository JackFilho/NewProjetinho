#!/bin/bash
# =============================================================================
# Script de detecção de secrets em arquivos staged no Git.
# Use como pre-commit hook ou manualmente.
#
# Instalação como pre-commit hook:
#   cp scripts/detect-secrets.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
# =============================================================================

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Verificando secrets nos arquivos staged..."

# Pegar apenas arquivos staged (não deletados)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  echo "✅ Nenhum arquivo staged para verificar."
  exit 0
fi

FOUND_SECRETS=0

# Padrões de secrets para detectar
declare -a PATTERNS=(
  # API Keys genéricas
  "api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9+/=]{20,}['\"]"
  # AWS
  "AKIA[0-9A-Z]{16}"
  # OpenAI
  "sk-[A-Za-z0-9]{20,}"
  # Senhas hardcoded
  "password\s*[:=]\s*['\"][^'\"]{8,}['\"]"
  # Tokens genéricos
  "token\s*[:=]\s*['\"][A-Za-z0-9+/=_-]{20,}['\"]"
  # Private keys
  "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
  # MySQL connection strings com senha
  "mysql://[^:]+:[^@]+@"
  # PostgreSQL connection strings com senha
  "postgres(ql)?://[^:]+:[^@]+@"
  # Chaves do Asaas
  "\\\$aact_[A-Za-z0-9]+"
  # Chaves do Mercado Pago
  "APP_USR-[A-Za-z0-9-]+"
  "TEST-[0-9]+-[0-9]+-[A-Za-z0-9]+"
  # Session secrets hardcoded
  "SESSION_SECRET\s*[:=]\s*['\"][^'\"]{5,}['\"]"
)

# Arquivos a ignorar
IGNORE_PATTERNS="(\.env\.example|detect-secrets\.sh|package-lock\.json|node_modules|\.git)"

for file in $STAGED_FILES; do
  # Ignorar arquivos binários e padrões de exclusão
  if echo "$file" | grep -qE "$IGNORE_PATTERNS"; then
    continue
  fi

  # Verificar se é arquivo de texto
  if ! file "$file" 2>/dev/null | grep -q "text"; then
    continue
  fi

  for pattern in "${PATTERNS[@]}"; do
    MATCHES=$(grep -nEi "$pattern" "$file" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      if [ $FOUND_SECRETS -eq 0 ]; then
        echo ""
        echo -e "${RED}⚠️  POSSÍVEIS SECRETS DETECTADOS:${NC}"
        echo "================================================"
      fi
      FOUND_SECRETS=1
      echo ""
      echo -e "${YELLOW}📄 $file${NC}"
      echo "$MATCHES" | while read -r line; do
        echo -e "  ${RED}→ $line${NC}"
      done
    fi
  done
done

if [ $FOUND_SECRETS -eq 1 ]; then
  echo ""
  echo "================================================"
  echo -e "${RED}❌ Commit bloqueado: possíveis secrets detectados!${NC}"
  echo ""
  echo "Se estes valores são seguros (ex: placeholders, testes),"
  echo "use: git commit --no-verify"
  echo ""
  exit 1
else
  echo "✅ Nenhum secret detectado."
  exit 0
fi
