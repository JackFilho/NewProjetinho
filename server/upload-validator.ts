/**
 * Validação de uploads por conteúdo (magic bytes).
 * Verifica os primeiros bytes do arquivo para confirmar o tipo real,
 * não confiando apenas na extensão ou MIME type declarado.
 */
import type { Request, Response, NextFunction } from "express";
import fs from "fs";

// Magic bytes (file signatures) para tipos de arquivo permitidos
const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
  // Imagens
  "image/jpeg": [{ bytes: [0xFF, 0xD8, 0xFF] }],
  "image/png": [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }],
  "image/gif": [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  "image/webp": [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header
    // Seguido por tamanho (4 bytes) e depois "WEBP"
  ],
  "image/svg+xml": [], // SVG é texto, verificado separadamente
  // PDF
  "application/pdf": [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
};

/**
 * Verifica se os bytes iniciais do arquivo correspondem ao MIME type declarado.
 */
function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  const signatures = MAGIC_BYTES[declaredMime];

  // Se não temos assinatura para esse tipo, rejeitar por segurança
  if (!signatures) return false;

  // SVG precisa de validação especial (é texto XML)
  if (declaredMime === "image/svg+xml") {
    const text = buffer.subarray(0, 500).toString("utf-8").trim();
    return text.startsWith("<?xml") || text.startsWith("<svg");
  }

  // WebP tem verificação especial (RIFF + WEBP)
  if (declaredMime === "image/webp") {
    if (buffer.length < 12) return false;
    const isRIFF =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46;
    const isWEBP =
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    return isRIFF && isWEBP;
  }

  // Verificar assinaturas conhecidas
  for (const sig of signatures) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;

    let matches = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[offset + i] !== sig.bytes[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}

/**
 * Middleware que valida arquivos após upload pelo multer.
 * Verifica magic bytes de cada arquivo e remove os que falharem.
 *
 * Uso: app.post('/upload', multerMiddleware, validateUploadContent(['image/jpeg', 'image/png']), handler)
 */
export function validateUploadContent(allowedMimes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = req.file;

    const filesToValidate: Express.Multer.File[] = [];
    if (files && Array.isArray(files)) {
      filesToValidate.push(...files);
    } else if (file) {
      filesToValidate.push(file);
    }

    if (filesToValidate.length === 0) {
      return next();
    }

    for (const f of filesToValidate) {
      try {
        // Ler os primeiros 512 bytes do arquivo
        const fd = fs.openSync(f.path, "r");
        const headerBuffer = Buffer.alloc(512);
        fs.readSync(fd, headerBuffer, 0, 512, 0);
        fs.closeSync(fd);

        // Verificar se o MIME declarado é permitido
        if (!allowedMimes.includes(f.mimetype)) {
          // Remover arquivo inválido
          fs.unlinkSync(f.path);
          return res.status(400).json({
            message: `Tipo de arquivo não permitido: ${f.mimetype}`,
          });
        }

        // Verificar magic bytes
        if (!validateMagicBytes(headerBuffer, f.mimetype)) {
          // Conteúdo não corresponde ao tipo declarado - possível ataque
          fs.unlinkSync(f.path);
          return res.status(400).json({
            message: "Arquivo rejeitado: conteúdo não corresponde ao tipo declarado",
          });
        }
      } catch (err) {
        // Se não conseguir ler o arquivo, rejeitar
        try {
          fs.unlinkSync(f.path);
        } catch {}
        return res.status(400).json({
          message: "Erro ao validar arquivo enviado",
        });
      }
    }

    next();
  };
}

/**
 * Mimes permitidos para upload de imagens
 */
export const IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * Mimes permitidos para upload de documentos de curso
 */
export const COURSE_FILE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];
