import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle, CreditCard, Calendar, Users, ArrowLeft, Check, Crown, Star, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { FloatingHelpButton } from "@/components/floating-help-button";

interface SubscriptionStatus {
  isActive: boolean;
  status: string;
  planId: number;
  planName: string;
  planPrice: string;
  planStatus?: string;
  asaasSubscriptionId?: string;
  asaasCustomerId?: string;
  nextBillingDate?: string;
  trialEndsAt?: string;
  isOnTrial: boolean;
  asaasData?: {
    id: string;
    status: string;
    value: number;
    cycle: string;
    nextDueDate: string;
    billingType: string;
    description?: string;
  };
}

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

export default function CompanySubscriptionManagement() {
  const [, setLocation] = useLocation();
  const [isAnnual, setIsAnnual] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("credit_card");
  const [installments, setInstallments] = useState<string>("1");

  // Credit card fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  // Success modal state
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [subscriptionResult, setSubscriptionResult] = useState<any>(null);

  const { data: subscription, isLoading } = useQuery<SubscriptionStatus>({
    queryKey: ['/api/company/subscription-status'],
    queryFn: () => apiRequest('/api/company/subscription-status'),
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/public-plans"],
  });

  const getFeaturesByPlan = (plan: Plan) => {
    const features: string[] = [];

    // Número de profissionais
    features.push(`Até ${plan.maxProfessionals} ${plan.maxProfessionals === 1 ? 'profissional' : 'profissionais'}`);

    // Recursos baseados nas permissões reais
    if (plan.permissions.dashboard) features.push("Dashboard completo");
    if (plan.permissions.appointments) features.push("Agendamentos ilimitados");
    if (plan.permissions.services) features.push("Gestão de serviços");
    if (plan.permissions.clients) features.push("Gestão de clientes");
    if (plan.permissions.professionals) features.push("Gestão de profissionais");
    if (plan.permissions.reviews) features.push("Sistema de avaliações");
    if (plan.permissions.tasks) features.push("Gestão de tarefas");
    if (plan.permissions.pointsProgram) features.push("Programa de pontos");
    if (plan.permissions.loyalty) features.push("Programa de fidelidade");
    if (plan.permissions.inventory) features.push("Controle de estoque");
    if (plan.permissions.messages) features.push("WhatsApp integrado");
    if (plan.permissions.coupons) features.push("Cupons de desconto");
    if (plan.permissions.financial) features.push("Gestão financeira");
    if (plan.permissions.reports) features.push("Relatórios avançados");
    if (plan.permissions.settings) features.push("Configurações");
    if (plan.permissions.support) features.push("Suporte");

    return features;
  };

  const getBadgeForPlan = (planName: string) => {
    const name = planName.toLowerCase();
    if (name.includes("premium") || name.includes("enterprise")) {
      return <Badge className="mb-2 bg-[#f18509] text-white"><Crown className="w-3 h-3 mr-1" /> Mais Popular</Badge>;
    }
    if (name.includes("profissional") || name.includes("professional")) {
      return <Badge className="mb-2 bg-blue-600"><Star className="w-3 h-3 mr-1" /> Recomendado</Badge>;
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

  const handleSubscribe = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
    setPaymentMethod("credit_card");
    setInstallments("1");
    // Clear card fields
    setCardNumber("");
    setCardName("");
    setCardExpiry("");
    setCardCvv("");
  };

  const handleConfirmSubscription = async () => {
    if (!selectedPlan) return;

    // Validate card fields
    if (!cardNumber || !cardName || !cardExpiry || !cardCvv) {
      alert("Por favor, preencha todos os dados do cartão de crédito");
      return;
    }

    try {
      const subscriptionData = {
        planId: selectedPlan.id,
        billingType: isAnnual ? "annual" : "monthly",
        paymentMethod: paymentMethod,
        installments: paymentMethod === "credit_card" ? parseInt(installments) : 1,
        creditCard: {
          holderName: cardName,
          number: cardNumber.replace(/\s/g, ''),
          expiryMonth: cardExpiry.split('/')[0],
          expiryYear: cardExpiry.split('/')[1],
          ccv: cardCvv
        }
      };

      const response = await apiRequest(
        '/api/company/subscribe',
        'POST',
        subscriptionData
      );

      if (response.success) {
        setSubscriptionResult(response);
        setIsModalOpen(false);
        setIsSuccessModalOpen(true);
      } else {
        alert("Erro ao criar assinatura: " + (response.message || "Erro desconhecido"));
      }

    } catch (error: any) {
      alert("Erro ao processar assinatura: " + (error.message || "Erro desconhecido"));
    }
  };

  const handleCancelSubscription = async () => {
    try {
      const response = await apiRequest(
        '/api/company/cancel-subscription',
        'POST'
      );

      if (response.success) {
        alert("Assinatura cancelada com sucesso!");
        // Reload page to reflect changes
        window.location.reload();
      } else {
        alert("Erro ao cancelar assinatura: " + (response.message || "Erro desconhecido"));
      }

    } catch (error: any) {
      alert("Erro ao cancelar assinatura: " + (error.message || "Erro desconhecido"));
    }
  };

  if (isLoading || plansLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Carregando informações da assinatura...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/configuracoes')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 ml-16 sm:ml-0">
                Gerenciar Assinatura
              </h1>
              <p className="text-gray-600 mt-1">
                Visualize e gerencie sua assinatura
              </p>
            </div>
          </div>
        </div>

        {/* Current Subscription */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Assinatura Atual
                </CardTitle>
                <CardDescription>
                  Detalhes do seu plano ativo
                </CardDescription>
              </div>
              {(subscription?.asaasData?.status === 'ACTIVE' || subscription?.status === 'active') && subscription?.planId ? (
                <Badge className="bg-green-500 gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Ativa
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Inativa
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                <CreditCard className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Plano</p>
                  <p className="font-semibold">
                    {subscription?.planId && (subscription?.asaasData?.status === 'ACTIVE' || subscription?.status === 'active')
                      ? subscription?.planName
                      : 'Sem plano contratado'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">
                    {subscription?.asaasData?.cycle === 'YEARLY' ? 'Valor Anual' : 'Valor Mensal'}
                  </p>
                  <p className="font-semibold">
                    R$ {(subscription?.planId && (subscription?.asaasData?.status === 'ACTIVE' || subscription?.status === 'active'))
                      ? (subscription?.asaasData?.value?.toFixed(2) || subscription?.planPrice || '0.00')
                      : '0.00'}
                  </p>
                </div>
              </div>

              {subscription?.asaasData?.nextDueDate && (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <Calendar className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Próxima Cobrança</p>
                    <p className="font-semibold">
                      {new Date(subscription.asaasData.nextDueDate).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              )}

              {subscription?.asaasData?.cycle && (
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-gray-600">Ciclo de Cobrança</p>
                    <p className="font-semibold">
                      {subscription.asaasData.cycle === 'MONTHLY' ? 'Mensal' : subscription.asaasData.cycle === 'YEARLY' ? 'Anual' : subscription.asaasData.cycle}
                    </p>
                  </div>
                </div>
              )}

              {subscription?.isOnTrial && subscription?.trialEndsAt && (
                <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-sm text-gray-600">Trial termina em</p>
                    <p className="font-semibold">
                      {new Date(subscription.trialEndsAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {subscription?.asaasData && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500">
                  ID da Assinatura: {subscription.asaasData.id}
                </p>
                {subscription.asaasData.description && (
                  <p className="text-xs text-gray-500 mt-1">
                    {subscription.asaasData.description}
                  </p>
                )}
              </div>
            )}

          </CardContent>
          {subscription?.asaasSubscriptionId && subscription?.asaasData?.status === 'ACTIVE' && (
            <CardFooter className="border-t bg-gray-50">
              <Button
                variant="outline"
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => {
                  if (window.confirm('Tem certeza que deseja cancelar sua assinatura? Esta ação não pode ser desfeita.')) {
                    handleCancelSubscription();
                  }
                }}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Cancelar Assinatura
              </Button>
            </CardFooter>
          )}
        </Card>

        {/* Billing Toggle */}
        <div className="flex justify-center items-center gap-4 mb-8">
          <button
            onClick={() => setIsAnnual(false)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              !isAnnual
                ? 'bg-[#f18509] text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setIsAnnual(true)}
            className={`px-4 py-2 rounded-lg font-medium transition-all relative ${
              isAnnual
                ? 'bg-[#f18509] text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Anual
            <Badge className="ml-2 bg-green-500">Economize até 20%</Badge>
          </button>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {plans.map((plan) => {
            const monthlyPrice = calculatePrice(plan);
            const totalPrice = calculateTotalPrice(plan);
            const savings = calculateSavings(plan);
            const isCurrentPlan = subscription?.planId === plan.id &&
              (subscription?.asaasData?.status === 'ACTIVE' || subscription?.status === 'active');

            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden transition-all hover:shadow-xl ${
                  plan.name.toLowerCase().includes('premium') || plan.name.toLowerCase().includes('profissional')
                    ? 'border-2 border-[#f18509] shadow-lg scale-105'
                    : ''
                } ${isCurrentPlan ? 'ring-2 ring-green-500' : ''}`}
              >
                {isCurrentPlan && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-green-500">Plano Atual</Badge>
                  </div>
                )}
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
                    {getFeaturesByPlan(plan).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    className={`w-full ${!isCurrentPlan && (plan.name.toLowerCase().includes('premium') || plan.name.toLowerCase().includes('profissional')) ? 'bg-[#f18509] hover:bg-[#d97508] text-white' : ''}`}
                    variant={plan.name.toLowerCase().includes('premium') || plan.name.toLowerCase().includes('profissional') ? 'default' : 'outline'}
                    disabled={isCurrentPlan}
                    onClick={() => handleSubscribe(plan)}
                  >
                    {isCurrentPlan ? 'Plano Atual' : 'Assinar Plano'}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Subscription Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assinar {selectedPlan?.name}</DialogTitle>
              <DialogDescription>
                Escolha a forma de pagamento para seu plano {isAnnual ? 'anual' : 'mensal'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Plan Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Plano selecionado</span>
                  <span className="font-semibold">{selectedPlan?.name}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Período</span>
                  <span className="font-semibold">{isAnnual ? 'Anual' : 'Mensal'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Valor</span>
                  <span className="font-bold text-lg text-[#f18509]">
                    R$ {selectedPlan ? (isAnnual ? parseFloat(selectedPlan.annualPrice || selectedPlan.price).toFixed(2) : parseFloat(selectedPlan.price).toFixed(2)) : '0.00'}
                  </span>
                </div>
              </div>

              {/* Payment Method - Only Credit Card */}
              <div className="space-y-3">
                <Label>Forma de Pagamento</Label>
                <div className="border rounded-lg p-4 bg-white">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-[#f18509]" />
                    <div>
                      <p className="font-medium">Cartão de Crédito</p>
                      <p className="text-xs text-gray-500">Parcelamento disponível</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Installments - Only for Annual */}
              {isAnnual && selectedPlan && (
                <div className="space-y-3">
                  <Label htmlFor="installments">Número de Parcelas</Label>
                  <Select value={installments} onValueChange={setInstallments}>
                    <SelectTrigger id="installments">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6].map((num) => {
                        const installmentValue = parseFloat(selectedPlan.annualPrice || selectedPlan.price) / num;
                        return (
                          <SelectItem key={num} value={num.toString()}>
                            {num}x de R$ {installmentValue.toFixed(2)} {num === 1 ? '(à vista)' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Monthly - Always 1x */}
              {!isAnnual && selectedPlan && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Pagamento mensal:</strong> R$ {parseFloat(selectedPlan.price).toFixed(2)}/mês
                  </p>
                </div>
              )}

              {/* Credit Card Fields */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-sm">Dados do Cartão de Crédito</h3>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="cardNumber">Número do Cartão</Label>
                    <Input
                      id="cardNumber"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
                        setCardNumber(value.slice(0, 19));
                      }}
                      maxLength={19}
                    />
                  </div>

                  <div>
                    <Label htmlFor="cardName">Nome no Cartão</Label>
                    <Input
                      id="cardName"
                      placeholder="Nome como está no cartão"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value.toUpperCase())}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cardExpiry">Validade</Label>
                      <Input
                        id="cardExpiry"
                        placeholder="MM/AA"
                        value={cardExpiry}
                        onChange={(e) => {
                          let value = e.target.value.replace(/\D/g, '');
                          if (value.length >= 2) {
                            value = value.slice(0, 2) + '/' + value.slice(2, 4);
                          }
                          setCardExpiry(value.slice(0, 5));
                        }}
                        maxLength={5}
                      />
                    </div>

                    <div>
                      <Label htmlFor="cardCvv">CVV</Label>
                      <Input
                        id="cardCvv"
                        placeholder="123"
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-[#f18509] hover:bg-[#d97508] text-white"
                  onClick={handleConfirmSubscription}
                >
                  Confirmar Assinatura
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Success Modal */}
        <Dialog open={isSuccessModalOpen} onOpenChange={setIsSuccessModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <div>
                  <DialogTitle className="text-2xl">Assinatura Criada com Sucesso!</DialogTitle>
                  <DialogDescription className="mt-2">
                    Sua assinatura foi ativada e já está disponível
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Subscription Details */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-orange-200">
                    <span className="text-sm font-medium text-gray-700">Plano</span>
                    <span className="font-bold text-[#f18509]">{subscriptionResult?.planName}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Valor</span>
                    <span className="font-semibold text-gray-900">R$ {subscriptionResult?.amount}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Ciclo</span>
                    <span className="font-semibold text-gray-900">
                      {subscriptionResult?.cycle === 'MONTHLY' ? 'Mensal' : 'Anual'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Primeira Cobrança</span>
                    <span className="font-semibold text-gray-900">
                      {subscriptionResult?.nextDueDate && new Date(subscriptionResult.nextDueDate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* IDs Information */}
              <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 font-medium">Cliente ID:</span>
                  <span className="text-xs text-gray-600 font-mono">{subscriptionResult?.asaasCustomerId}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 font-medium">Assinatura ID:</span>
                  <span className="text-xs text-gray-600 font-mono">{subscriptionResult?.asaasSubscriptionId}</span>
                </div>
              </div>

              {/* Success Message */}
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Sua assinatura está ativa! Você já pode aproveitar todos os recursos do seu plano.
                </AlertDescription>
              </Alert>

              {/* Action Button */}
              <Button
                className="w-full bg-[#f18509] hover:bg-[#d97508] text-white text-base font-semibold py-6"
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  window.location.reload();
                }}
              >
                Continuar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <FloatingHelpButton menuLocation="subscription" />
    </div>
  );
}
