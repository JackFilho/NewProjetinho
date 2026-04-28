# 🎨 Como Gerar Ícones Automaticamente

Este guia mostra como criar todos os tamanhos de ícone a partir de uma única imagem.

## 📋 Pré-requisitos

Instale a biblioteca `sharp` para processamento de imagens:

```bash
npm install sharp
```

## 🚀 Passo a Passo

### 1. Prepare sua imagem

- **Formato**: PNG com fundo transparente
- **Tamanho recomendado**: 512x512px ou maior
- **Nome**: `my-logo.png`

### 2. Coloque a imagem na pasta correta

Copie sua imagem para:
```
client/public/icons/my-logo.png
```

### 3. Execute o script

No terminal, execute:

```bash
node generate-icons.js
```

### 4. Resultado

O script vai gerar automaticamente todos estes tamanhos:

```
✅ icon-16x16.png
✅ icon-32x32.png
✅ icon-72x72.png
✅ icon-96x96.png
✅ icon-120x120.png
✅ icon-128x128.png
✅ icon-144x144.png
✅ icon-152x152.png
✅ icon-167x167.png
✅ icon-180x180.png
✅ icon-192x192.png
✅ icon-384x384.png
✅ icon-512x512.png
```

### 5. Limpe a cache do navegador

Depois de gerar os ícones:
1. **Reinicie o servidor** de desenvolvimento (`npm run dev`)
2. **Limpe o cache** do navegador (Ctrl+Shift+R ou Cmd+Shift+R)
3. **Recarregue a página**

## 🎯 Dicas

- Use uma imagem **quadrada** para melhores resultados
- Prefira **fundo transparente** (PNG)
- Se a imagem for muito pequena, ela será ampliada (pode perder qualidade)
- Recomendado: **512x512px ou maior**

## ⚠️ Solução de Problemas

### Erro: "Cannot find module 'sharp'"
```bash
npm install sharp
```

### Erro: "Imagem não encontrada"
Verifique se a imagem está em:
```
client/public/icons/my-logo.png
```

### Favicon não atualiza no navegador
1. Limpe o cache do navegador (Ctrl+Shift+Delete)
2. Feche e abra novamente o navegador
3. Em modo desenvolvimento, use Ctrl+Shift+R (hard refresh)
