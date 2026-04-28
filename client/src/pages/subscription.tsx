import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Star, Zap, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCompanyAuth } from "@/hooks/useCompanyAuth";

interface Plan {
  id: number;
  name: string;
  freeDays: number;
  price: string;
  annualPrice: string | null;
  maxProfessionals: number;
  isActive: boolean;
  permissions: {
    dashboard: boolean;
    appointments: boolean;
    services: boolean;
    professionals: boolean;
    clients: boolean;
    reviews: boolean;
    tasks: boolean;
    pointsProgram: boolean;
    loyalty: boolean;
    inventory: boolean;
    messages: boolean;
    coupons: boolean;
    financial: boolean;
    reports: boolean;
    settings: boolean;
  };
}

interface PublicSettings {
  logoUrl: string | null;
  systemName: string | null;
}

export default function Subscription() {
  const [isAnnual, setIsAnnual] = useState(false);
  const { company } = useCompanyAuth();

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/public-plans"],
  });

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/public-settings"],
  });

  const getFeaturesByPlan = (planName: string) => {
    const basePlan = planName.toLowerCase();

    if (basePlan.includes("básico") || basePlan.includes("basic")) {
      return [
        "Até 1 profissional",
        "Agendamentos ilimitados",
        "Gestão de clientes",
        "Relatórios básicos",
        "Suporte por email",
      ];
    }

    if (basePlan.includes("profissional") || basePlan.includes("professional")) {
      return [
        "Até 5 profissionais",
        "Todos os recursos do Básico",
        "WhatsApp integrado",
        "Relatórios avançados",
        "Campanhas de marketing",
        "Programa de fidelidade",
        "Cupons de desconto",
        "Suporte prioritário",
      ];
    }

    if (basePlan.includes("premium") || basePlan.includes("enterprise")) {
      return [
        "Até 15 profissionais",
        "Todos os recursos do Profissional",
        "IA para atendimento",
        "Gestão financeira completa",
        "Controle de estoque",
        "API personalizada",
        "Domínio personalizado",
        "Suporte 24/7",
      ];
    }

    return [
      "Agendamentos",
      "Clientes",
      "Serviços",
      "Profissionais",
      "Relatórios",
    ];
  };

  const getBadgeForPlan = (planName: string) => {
    const name = planName.toLowerCase();
    if (name.includes("premium") || name.includes("enterprise")) {
      return <Badge className="mb-2 bg-gradient-to-r from-purple-500 to-pink-500"><Crown className="w-3 h-3 mr-1" /> Mais Popular</Badge>;
    }
    if (name.includes("profissional") || name.includes("professional")) {
      return <Badge className="mb-2 bg-blue-500"><Star className="w-3 h-3 mr-1" /> Recomendado</Badge>;
    }
    return null;
  };

  const calculatePrice = (plan: Plan) => {
    if (isAnnual && plan.annualPrice) {
      return parseFloat(plan.annualPrice) / 12;
    }
    return parseFloat(plan.price);
  };

  const calculateTotalPrice = (plan: Plan) => {
    if (isAnnual && plan.annualPrice) {
      return parseFloat(plan.annualPrice);
    }
    return parseFloat(plan.price) * 12;
  };

  const calculateSavings = (plan: Plan) => {
    if (!plan.annualPrice) return 0;
    const monthlyTotal = parseFloat(plan.price) * 12;
    const annualPrice = parseFloat(plan.annualPrice);
    return ((monthlyTotal - annualPrice) / monthlyTotal * 100).toFixed(0);
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando planos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          {settings?.logoUrl && (
            <img
              src={settings.logoUrl}
              alt="Logo"
              className="h-12 mx-auto mb-4"
            />
          )}
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            {company ? 'Escolha seu Plano' : `Bem-vindo ao ${settings?.systemName || 'Sistema de Gestão'}`}
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Escolha o plano ideal para seu negócio e comece a transformar sua gestão hoje mesmo
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center items-center gap-4 mb-8">
          <button
            onClick={() => setIsAnnual(false)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              !isAnnual
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setIsAnnual(true)}
            className={`px-4 py-2 rounded-lg font-medium transition-all relative ${
              isAnnual
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Anual
            <Badge className="ml-2 bg-green-500">Economize até 20%</Badge>
          </button>
        </div>

        {/* Temporary Notice */}
        <Alert className="mb-8 max-w-3xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Sistema de pagamentos em manutenção</strong>
            <br />
            Estamos migrando para uma nova plataforma de pagamentos para oferecer mais opções (PIX, Boleto e Cartão).
            Para contratar um plano, entre em contato conosco por email ou WhatsApp.
          </AlertDescription>
        </Alert>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {plans.map((plan) => {
            const monthlyPrice = calculatePrice(plan);
            const totalPrice = calculateTotalPrice(plan);
            const savings = calculateSavings(plan);

            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden transition-all hover:shadow-xl ${
                  plan.name.toLowerCase().includes('premium') || plan.name.toLowerCase().includes('profissional')
                    ? 'border-2 border-purple-500 shadow-lg scale-105'
                    : ''
                }`}
              >
                <CardHeader>
                  {getBadgeForPlan(plan.name)}
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>
                    {plan.freeDays > 0 && (
                      <Badge variant="secondary" className="mr-2">
                        <Zap className="w-3 h-3 mr-1" />
                        {plan.freeDays} dias grátis
                      </Badge>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Pricing */}
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-gray-900">
                        R$ {monthlyPrice.toFixed(2)}
                      </span>
                      <span className="text-gray-600">/mês</span>
                    </div>
                    {isAnnual && plan.annualPrice && (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-gray-600">
                          Total: R$ {totalPrice.toFixed(2)}/ano
                        </p>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Economize {savings}%
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-3">
                    {getFeaturesByPlan(plan.name).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.name.toLowerCase().includes('premium') || plan.name.toLowerCase().includes('profissional') ? 'default' : 'outline'}
                    disabled
                  >
                    Entre em Contato
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Contact Information */}
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Precisa de Ajuda?</CardTitle>
            <CardDescription>
              Entre em contato conosco para contratar um plano ou tirar dúvidas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-gray-600">
              <p>📧 Email: suporte@seusite.com</p>
              <p>💬 WhatsApp: (11) 99999-9999</p>
              <p>⏰ Horário de atendimento: Segunda a Sexta, 9h às 18h</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
