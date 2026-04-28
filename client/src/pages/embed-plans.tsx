import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Crown, Zap } from "lucide-react";
import type { Plan } from "@shared/schema";

interface EmbedConfig {
  plans: number[];
  theme: 'light' | 'dark';
  showTrialDays: boolean;
  showPricing: boolean;
  showFeatures: boolean;
  buttonText: string;
  layout: 'grid' | 'list';
  maxWidth: string;
  primaryColor: string;
  accentColor: string;
}

const defaultConfig: EmbedConfig = {
  plans: [],
  theme: 'light',
  showTrialDays: true,
  showPricing: true,
  showFeatures: true,
  buttonText: 'Assinar Plano',
  layout: 'grid',
  maxWidth: '1200px',
  primaryColor: '#6366f1',
  accentColor: '#8b5cf6'
};

export default function EmbedPlans() {
  const [location] = useLocation();
  const [config, setConfig] = useState<EmbedConfig>(defaultConfig);

  const { data: allPlans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/public-plans"],
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const configParam = urlParams.get('config');
    
    if (configParam) {
      try {
        const decodedConfig = JSON.parse(atob(configParam));
        setConfig({ ...defaultConfig, ...decodedConfig });
      } catch (error) {
        // Silently handle decoding errors
      }
    }
  }, [location]);

  // Aplicar tema dinamicamente
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme);
    
    // Aplicar cores personalizadas
    const root = document.documentElement;
    root.style.setProperty('--embed-primary', config.primaryColor);
    root.style.setProperty('--embed-accent', config.accentColor);
  }, [config]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Filtrar planos baseado na configuração
  const displayPlans = config.plans.length > 0 
    ? allPlans.filter(plan => config.plans.includes(plan.id))
    : allPlans.filter(plan => plan.isActive);

  const getPlanIcon = (planName: string) => {
    const name = planName.toLowerCase();
    if (name.includes('básico')) return <Star className="w-6 h-6" />;
    if (name.includes('profissional')) return <Zap className="w-6 h-6" />;
    if (name.includes('premium')) return <Crown className="w-6 h-6" />;
    return <Check className="w-6 h-6" />;
  };

  const getPlanFeatures = (plan: Plan) => {
    const features = [];
    
    if (plan.maxProfessionals) {
      features.push(`Até ${plan.maxProfessionals} profissionais`);
    }
    
    // Adicionar recursos baseado nas permissões
    if (plan.permissions) {
      const permissions = typeof plan.permissions === 'string' 
        ? JSON.parse(plan.permissions) 
        : plan.permissions;
      
      if (permissions.dashboard) features.push('Dashboard completo');
      if (permissions.appointments) features.push('Agendamentos');
      if (permissions.services) features.push('Gestão de serviços');
      if (permissions.professionals) features.push('Gestão de profissionais');
      if (permissions.clients) features.push('Gestão de clientes');
      if (permissions.reviews) features.push('Sistema de avaliações');
      if (permissions.tasks) features.push('Gestão de tarefas');
      if (permissions.messages) features.push('Sistema de mensagens');
      if (permissions.financial) features.push('Gestão financeira');
      if (permissions.reports) features.push('Relatórios avançados');
      if (permissions.coupons) features.push('Gestão de cupons');
      if (permissions.loyalty) features.push('Programa de fidelidade');
      if (permissions.inventory) features.push('Controle de estoque');
    }
    
    return features.slice(0, 8); // Limitar a 8 recursos
  };

  const handlePlanSelect = (planId: number) => {
    // Redirecionar para a página de assinatura
    const baseUrl = window.location.origin;
    const subscriptionUrl = `${baseUrl}/assinatura?plan=${planId}`;
    window.open(subscriptionUrl, '_blank');
  };

  const formatPrice = (price: string) => {
    const numPrice = parseFloat(price);
    return numPrice.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    });
  };

  return (
    <div 
      className={`min-h-screen p-4 ${config.theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}
      style={{ maxWidth: config.maxWidth, margin: '0 auto' }}
    >
      <style>{`
        .embed-button {
          background-color: var(--embed-primary);
          border-color: var(--embed-primary);
        }
        .embed-button:hover {
          background-color: var(--embed-accent);
          border-color: var(--embed-accent);
        }
        .embed-accent {
          color: var(--embed-accent);
        }
      `}</style>

      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Escolha seu Plano</h1>
          <p className={`text-lg ${config.theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
            Selecione o plano ideal para o seu negócio
          </p>
        </div>

        <div className={`grid gap-6 ${config.layout === 'grid' 
          ? displayPlans.length === 1 ? 'grid-cols-1 max-w-md mx-auto' 
          : displayPlans.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-1 max-w-2xl mx-auto'
        }`}>
          {displayPlans.map((plan, index) => (
            <Card 
              key={plan.id} 
              className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${
                config.theme === 'dark' 
                  ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                  : 'bg-white border-gray-200 hover:border-gray-300'
              } ${index === 1 && displayPlans.length === 3 ? 'scale-105 border-2' : ''}`}
              style={index === 1 && displayPlans.length === 3 ? { borderColor: config.primaryColor } : {}}
            >
              {index === 1 && displayPlans.length === 3 && (
                <div 
                  className="absolute top-0 left-0 right-0 text-center text-white text-sm font-medium py-2"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  Mais Popular
                </div>
              )}
              
              <CardHeader className={`text-center ${index === 1 && displayPlans.length === 3 ? 'pt-8' : ''}`}>
                <div className="flex justify-center mb-4">
                  <div 
                    className="p-3 rounded-full"
                    style={{ backgroundColor: `${config.primaryColor}20`, color: config.primaryColor }}
                  >
                    {getPlanIcon(plan.name)}
                  </div>
                </div>
                
                <CardTitle className="text-xl font-bold mb-2">{plan.name}</CardTitle>
                
                {config.showPricing && (
                  <div className="space-y-1">
                    <div className="text-3xl font-bold" style={{ color: config.primaryColor }}>
                      {formatPrice(plan.price)}
                      <span className={`text-sm font-normal ${config.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        /mês
                      </span>
                    </div>
                    {plan.annualPrice && parseFloat(plan.annualPrice) > 0 && (
                      <div className={`text-sm ${config.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        ou {formatPrice(plan.annualPrice)}/ano
                      </div>
                    )}
                  </div>
                )}
                
                {config.showTrialDays && plan.freeDays > 0 && (
                  <Badge variant="outline" className="mt-2">
                    {plan.freeDays} dias grátis para testar
                  </Badge>
                )}
              </CardHeader>
              
              <CardContent className="space-y-4">
                {config.showFeatures && (
                  <div className="space-y-2">
                    {getPlanFeatures(plan).map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-start gap-2">
                        <Check 
                          className="w-4 h-4 mt-0.5 flex-shrink-0" 
                          style={{ color: config.primaryColor }}
                        />
                        <span className={`text-sm ${config.theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                
                <Button 
                  onClick={() => handlePlanSelect(plan.id)}
                  className="w-full embed-button text-white font-medium"
                  style={{ 
                    backgroundColor: config.primaryColor,
                    borderColor: config.primaryColor
                  }}
                >
                  {config.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className={`text-center mt-8 text-sm ${config.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          Powered by In House Company
        </div>
      </div>
    </div>
  );
}