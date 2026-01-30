import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface GlobalSettings {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
}

export function useGlobalTheme() {
  const { data: settings } = useQuery<GlobalSettings>({
    queryKey: ['/api/public-settings'],
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (settings) {
      const root = document.documentElement;
      
      // Converte hex para hsl
      const hexToHsl = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
            default: h = 0;
          }
          h /= 6;
        }

        return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
      };

      // Aplica as cores do sistema
      if (settings.primaryColor) {
        const primaryHsl = hexToHsl(settings.primaryColor);
        root.style.setProperty('--primary', `hsl(${primaryHsl})`);
        root.style.setProperty('--ring', `hsl(${primaryHsl})`);
        root.style.setProperty('--sidebar-primary', `hsl(${primaryHsl})`);
        root.style.setProperty('--sidebar-ring', `hsl(${primaryHsl})`);
        root.style.setProperty('--chart-1', `hsl(${primaryHsl})`);
        root.style.setProperty('--primary-color', settings.primaryColor);
        
        // Cria versão clara para accent
        const [h, s] = primaryHsl.split(',');
        root.style.setProperty('--accent', `hsl(${h}, ${s}, 96%)`);
        root.style.setProperty('--accent-foreground', `hsl(${primaryHsl})`);
        root.style.setProperty('--sidebar-accent', `hsl(${h}, ${s}, 96%)`);
        root.style.setProperty('--sidebar-accent-foreground', `hsl(${primaryHsl})`);
        
        // Força aplicação em botões e elementos interativos
        root.style.setProperty('--primary-button-bg', `hsl(${primaryHsl})`);
        root.style.setProperty('--primary-button-hover', `hsl(${h}, ${s}, ${Math.max(parseInt(primaryHsl.split(', ')[2]) - 10, 10)}%)`);
      }

      if (settings.backgroundColor) {
        const backgroundHsl = hexToHsl(settings.backgroundColor);
        root.style.setProperty('--background', `hsl(${backgroundHsl})`);
        root.style.setProperty('--muted', `hsl(${backgroundHsl})`);
        root.style.setProperty('--popover', `hsl(${backgroundHsl})`);
      }

      if (settings.textColor) {
        const textHsl = hexToHsl(settings.textColor);
        root.style.setProperty('--foreground', `hsl(${textHsl})`);
        root.style.setProperty('--popover-foreground', `hsl(${textHsl})`);
        root.style.setProperty('--card-foreground', `hsl(${textHsl})`);
        root.style.setProperty('--sidebar-foreground', `hsl(${textHsl})`);
      }
    }
  }, [settings]);

  return settings;
}