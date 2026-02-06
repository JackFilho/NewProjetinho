import DOMPurify from "dompurify";

/**
 * Sanitiza HTML para prevenir ataques XSS.
 * Remove scripts, event handlers e outros vetores de ataque.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'style'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'id'],
    ALLOW_DATA_ATTR: false,
  });
}
