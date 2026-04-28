import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalTheme } from "@/hooks/use-global-theme";
import { 
  BarChart3, 
  Building, 
  Tags, 
  Settings, 
  LogOut, 
  User,
  X,
  Menu,
  Circle,
  Users,
  CreditCard,
  TestTube,
  Bell,
  Ticket,
  MessageSquare,
  MapPin,
  Code,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Video
} from "lucide-react";
import { useState, useEffect } from "react";

interface SidebarProps {
  systemName?: string;
  logoUrl?: string;
}

export default function Sidebar({ systemName = "AdminPro", logoUrl }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSubscriptionsOpen, setIsSubscriptionsOpen] = useState(false);
  
  // Aplica tema global dinamicamente
  useGlobalTheme();

  const navigation = [
    { name: "Dashboard", href: "/administrador", icon: BarChart3 },
    { name: "Analytics", href: "/administrador/analytics", icon: TrendingUp },
    { name: "Empresas", href: "/administrador/empresas", icon: Building },
    { name: "Planos", href: "/administrador/planos", icon: Tags },
    { name: "Administradores", href: "/administrador/administradores", icon: Users },
    { name: "Alertas", href: "/administrador/alertas", icon: Bell },
    { name: "Suporte", href: "/administrador/suporte", icon: MessageSquare },
    { name: "Treinamentos", href: "/administrador/treinamentos", icon: Video },
    { name: "Status", href: "/administrador/status", icon: Circle },
    { name: "Configurações", href: "/administrador/configuracoes", icon: Settings },
  ];

  const subscriptionSubmenu = [
    { name: "Assinaturas", href: "/administrador/assinaturas", icon: CreditCard },
  ];

  const isActive = (href: string) => {
    if (href === "/administrador") {
      return location === "/administrador";
    }
    return location.startsWith(href);
  };

  const isSubscriptionActive = () => {
    return subscriptionSubmenu.some(item => location.startsWith(item.href));
  };

  // Abre automaticamente o submenu se estiver numa página do submenu
  useEffect(() => {
    if (isSubscriptionActive()) {
      setIsSubscriptionsOpen(true);
    }
  }, [location]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/administrador/login";
    } catch (error) {
      window.location.href = "/administrador/login";
    }
  };

  const toggleMobile = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between h-16 px-4">
          <Button variant="ghost" size="sm" onClick={toggleMobile}>
            <Menu className="h-6 w-6" />
          </Button>
          {logoUrl && (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="h-8 w-auto object-contain"
            />
          )}
          <div></div>
        </div>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200">
          <div className="flex items-center justify-center w-full">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Logo" 
                className="w-[165px] h-auto rounded object-contain"
              />
            ) : (
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Settings className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="lg:hidden"
            onClick={() => setIsMobileOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              
              return (
                <Link 
                  key={item.name} 
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                    ${active 
                      ? 'text-white bg-[var(--primary-color)]' 
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                    }
                  `}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              );
            })}
            
            {/* Menu Assinaturas com submenu */}
            <div>
              <button
                onClick={() => setIsSubscriptionsOpen(!isSubscriptionsOpen)}
                className={`
                  w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                  ${isSubscriptionActive() 
                    ? 'text-white bg-[var(--primary-color)]' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                  }
                `}
              >
                <CreditCard className="w-5 h-5 mr-3" />
                Assinaturas
                {isSubscriptionsOpen ? (
                  <ChevronDown className="w-4 h-4 ml-auto" />
                ) : (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </button>
              
              {isSubscriptionsOpen && (
                <div className="mt-1 ml-6 space-y-1">
                  {subscriptionSubmenu.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    
                    return (
                      <Link 
                        key={item.name} 
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`
                          flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                          ${active 
                            ? 'text-white bg-[var(--primary-color)]' 
                            : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                          }
                        `}
                      >
                        <Icon className="w-4 h-4 mr-3" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center px-3 py-2">
              <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-slate-600" />
              </div>
              <div className="ml-3 min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {user && typeof user === 'object' && 'firstName' in user ? 
                    `${user.firstName || ''} ${(user as any).lastName || ''}`.trim() || 'Administrador' : 
                    'Administrador'
                  }
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {user && typeof user === 'object' && 'email' in user ? 
                    String((user as any).email) : 
                    'admin@sistema.com'
                  }
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="mt-2 w-full justify-start text-slate-600 hover:text-slate-800 hover:bg-slate-100"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sair
            </Button>
          </div>
        </nav>
      </aside>
    </>
  );
}
