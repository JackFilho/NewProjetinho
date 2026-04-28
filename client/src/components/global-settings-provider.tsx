import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GlobalSettings } from "@shared/schema";

export function GlobalSettingsProvider() {
  const { data: settings } = useQuery<GlobalSettings>({
    queryKey: ["/api/public-settings"],
  });

  useEffect(() => {
    if (settings) {
      // Atualiza o título padrão da página
      const systemName = settings.systemName || "AIDA";
      document.title = systemName;
      
      // Atualiza meta tags
      const metaTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (metaTitle) {
        metaTitle.setAttribute('content', systemName);
      }
      
      // Atualiza o favicon se configurado
      if (settings.faviconUrl) {
        // Remove favicons existentes
        const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
        existingFavicons.forEach(favicon => favicon.remove());
        
        // Adiciona o novo favicon
        const favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.type = 'image/x-icon';
        favicon.href = settings.faviconUrl;
        document.head.appendChild(favicon);
        
        // Adiciona favicon para diferentes tamanhos
        const favicon16 = document.createElement('link');
        favicon16.rel = 'icon';
        favicon16.type = 'image/png';
        favicon16.sizes = '16x16';
        favicon16.href = settings.faviconUrl;
        document.head.appendChild(favicon16);
        
        const favicon32 = document.createElement('link');
        favicon32.rel = 'icon';
        favicon32.type = 'image/png';
        favicon32.sizes = '32x32';
        favicon32.href = settings.faviconUrl;
        document.head.appendChild(favicon32);
        
        // Apple touch icon
        const appleTouchIcon = document.createElement('link');
        appleTouchIcon.rel = 'apple-touch-icon';
        appleTouchIcon.href = settings.faviconUrl;
        document.head.appendChild(appleTouchIcon);
      }
      
      // Atualiza cores do tema se configuradas
      if (settings.primaryColor) {
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', settings.primaryColor);
        }
        
        const metaTileColor = document.querySelector('meta[name="msapplication-TileColor"]');
        if (metaTileColor) {
          metaTileColor.setAttribute('content', settings.primaryColor);
        }
      }
    }
  }, [settings]);

  return null; // Este componente não renderiza nada
}