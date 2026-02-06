import { useQuery } from "@tanstack/react-query";
import { sanitizeHtml } from "@/utils/sanitize";
import { useLocation } from "wouter";
import { useEffect } from "react";
import Sidebar from "./sidebar";
import { useGlobalTheme } from "@/hooks/use-global-theme";
import { useDocumentTitle } from "@/hooks/use-document-title";
import type { GlobalSettings } from "@shared/schema";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [, setLocation] = useLocation();

  const { data: settings } = useQuery<GlobalSettings>({
    queryKey: ["/api/settings"],
  });

  // Check admin authentication
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Aplica tema global dinamicamente
  useGlobalTheme();

  // Define o título da página
  useDocumentTitle("Administrador");

  // Redirect to login if not authenticated as admin
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/administrador/login");
    }
  }, [user, isLoading, setLocation]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  // Don't render content if not authenticated
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar 
        systemName={settings?.systemName} 
        logoUrl={settings?.logoUrl || undefined}
      />
      
      {/* Main Content */}
      <div className="flex-1 lg:ml-0">
        {/* Mobile top spacing */}
        <div className="lg:hidden h-16"></div>
        
        <main className="flex-1 pb-16">
          <div className="px-6 py-8">
            {children}
          </div>
        </main>
        
        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
          <div className="text-xs text-gray-500 text-center">
            {settings?.customHtml ? (
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(settings.customHtml) }} />
            ) : (
              <>{settings?.systemName || "AIDA"} ©2025 - Versão 1.0 - Powered by Halarum</>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
