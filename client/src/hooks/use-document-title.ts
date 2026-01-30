import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GlobalSettings } from "@shared/schema";

export function useDocumentTitle(pageTitle?: string) {
    const { data: settings } = useQuery<GlobalSettings>({
        queryKey: ["/api/public-settings"],
    });

    useEffect(() => {
        const systemName = settings?.systemName || "AIDA";

        // Atualiza o título da página
        if (pageTitle) {
            document.title = `${pageTitle} - ${systemName}`;
        } else {
            document.title = systemName;
        }

        // Atualiza o favicon se configurado
        if (settings?.faviconUrl) {
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
        }
    }, [pageTitle, settings?.systemName, settings?.faviconUrl]);
}