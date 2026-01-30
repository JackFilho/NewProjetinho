import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Copy, Code, Eye, Settings } from "lucide-react";
import type { Plan, GlobalSettings } from "@shared/schema";
import { FloatingHelpButton } from "@/components/floating-help-button";

export default function AdminPlanEmbed() {
  const { toast } = useToast();
  const [selectedPlans, setSelectedPlans] = useState<number[]>([]);
  const [embedConfig, setEmbedConfig] = useState({
    theme: 'light',
    showTrialDays: true,
    showPricing: true,
    showFeatures: true,
    buttonText: 'Assinar Plano',
    layout: 'grid',
    maxWidth: '1200px',
    primaryColor: '#6366f1',
    accentColor: '#8b5cf6'
  });

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: settings } = useQuery<GlobalSettings>({
    queryKey: ["/api/settings"],
  });

  const activePlans = plans.filter(plan => plan.isActive);

  const handlePlanSelection = (planId: number, selected: boolean) => {
    if (selected) {
      setSelectedPlans(prev => [...prev, planId]);
    } else {
      setSelectedPlans(prev => prev.filter(id => id !== planId));
    }
  };

  const generateEmbedCode = () => {
    const planIds = selectedPlans.length > 0 ? selectedPlans : activePlans.map(p => p.id);
    const config = {
      plans: planIds,
      ...embedConfig
    };

    // Use custom domain if configured, otherwise fall back to current origin
    const baseUrl = settings?.systemUrl && settings.systemUrl.trim() 
      ? settings.systemUrl.replace(/\/+$/, '') // Remove trailing slashes
      : window.location.origin;
    
    const embedUrl = `${baseUrl}/embed/plans?config=${encodeURIComponent(btoa(JSON.stringify(config)))}`;
    
    return {
      iframe: `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" style="max-width: ${embedConfig.maxWidth}; margin: 0 auto; display: block;"></iframe>`,
      script: `<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${embedUrl}';
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    iframe.style.maxWidth = '${embedConfig.maxWidth}';
    iframe.style.margin = '0 auto';
    iframe.style.display = 'block';
    
    var container = document.getElementById('agenday-plans');
    if (container) {
      container.appendChild(iframe);
    }
  })();
</script>
<div id="agenday-plans"></div>`,
      url: embedUrl
    };
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: `Código ${type} copiado para a área de transferência`,
    });
  };

  const previewEmbed = () => {
    const { url } = generateEmbedCode();
    window.open(url, '_blank', 'width=1200,height=700');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const embedCodes = generateEmbedCode();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Embed de Planos</h1>
        <p className="text-muted-foreground">
          Gere códigos para incorporar os planos em sites externos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configurações */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configurações
              </CardTitle>
              <CardDescription>
                Personalize a aparência do embed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Seleção de Planos */}
              <div>
                <Label className="text-sm font-medium">Planos para Exibir</Label>
                <div className="space-y-2 mt-2">
                  {activePlans.map((plan) => (
                    <div key={plan.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`plan-${plan.id}`}
                        checked={selectedPlans.length === 0 || selectedPlans.includes(plan.id)}
                        onChange={(e) => handlePlanSelection(plan.id, e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor={`plan-${plan.id}`} className="text-sm">
                        {plan.name} - R$ {plan.price}/mês
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedPlans.length === 0 ? 'Todos os planos ativos serão exibidos' : `${selectedPlans.length} planos selecionados`}
                </p>
              </div>

              {/* Tema */}
              <div>
                <Label htmlFor="theme">Tema</Label>
                <Select value={embedConfig.theme} onValueChange={(value) => setEmbedConfig(prev => ({ ...prev, theme: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Escuro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Layout */}
              <div>
                <Label htmlFor="layout">Layout</Label>
                <Select value={embedConfig.layout} onValueChange={(value) => setEmbedConfig(prev => ({ ...prev, layout: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Grade</SelectItem>
                    <SelectItem value="list">Lista</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Largura Máxima */}
              <div>
                <Label htmlFor="maxWidth">Largura Máxima</Label>
                <Input
                  id="maxWidth"
                  value={embedConfig.maxWidth}
                  onChange={(e) => setEmbedConfig(prev => ({ ...prev, maxWidth: e.target.value }))}
                  placeholder="1200px"
                />
              </div>

              {/* Cor Primária */}
              <div>
                <Label htmlFor="primaryColor">Cor Primária</Label>
                <div className="flex gap-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={embedConfig.primaryColor}
                    onChange={(e) => setEmbedConfig(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="w-16 h-10"
                  />
                  <Input
                    value={embedConfig.primaryColor}
                    onChange={(e) => setEmbedConfig(prev => ({ ...prev, primaryColor: e.target.value }))}
                    placeholder="#6366f1"
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Texto do Botão */}
              <div>
                <Label htmlFor="buttonText">Texto do Botão</Label>
                <Input
                  id="buttonText"
                  value={embedConfig.buttonText}
                  onChange={(e) => setEmbedConfig(prev => ({ ...prev, buttonText: e.target.value }))}
                  placeholder="Assinar Plano"
                />
              </div>

              {/* Opções de Exibição */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="showTrialDays">Mostrar Dias de Teste</Label>
                  <Switch
                    id="showTrialDays"
                    checked={embedConfig.showTrialDays}
                    onCheckedChange={(checked) => setEmbedConfig(prev => ({ ...prev, showTrialDays: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="showPricing">Mostrar Preços</Label>
                  <Switch
                    id="showPricing"
                    checked={embedConfig.showPricing}
                    onCheckedChange={(checked) => setEmbedConfig(prev => ({ ...prev, showPricing: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="showFeatures">Mostrar Recursos</Label>
                  <Switch
                    id="showFeatures"
                    checked={embedConfig.showFeatures}
                    onCheckedChange={(checked) => setEmbedConfig(prev => ({ ...prev, showFeatures: checked }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Códigos de Embed */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5" />
                Códigos de Incorporação
              </CardTitle>
              <CardDescription>
                Copie e cole um dos códigos abaixo no seu site
              </CardDescription>
              <div className="flex gap-2">
                <Button onClick={previewEmbed} variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  Visualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="iframe" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="iframe">iFrame</TabsTrigger>
                  <TabsTrigger value="script">JavaScript</TabsTrigger>
                  <TabsTrigger value="url">URL Direta</TabsTrigger>
                </TabsList>
                
                <TabsContent value="iframe" className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Código iFrame</Label>
                      <Button
                        onClick={() => copyToClipboard(embedCodes.iframe, 'iFrame')}
                        size="sm"
                        variant="outline"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      value={embedCodes.iframe}
                      className="w-full h-32 p-3 font-mono text-sm bg-muted rounded-md"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Cole este código diretamente no HTML do seu site
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="script" className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Código JavaScript</Label>
                      <Button
                        onClick={() => copyToClipboard(embedCodes.script, 'JavaScript')}
                        size="sm"
                        variant="outline"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      value={embedCodes.script}
                      className="w-full h-40 p-3 font-mono text-sm bg-muted rounded-md"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Este código criará automaticamente o embed na div com id "agenday-plans"
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="url" className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>URL Direta</Label>
                      <Button
                        onClick={() => copyToClipboard(embedCodes.url, 'URL')}
                        size="sm"
                        variant="outline"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                    <Input
                      readOnly
                      value={embedCodes.url}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Use esta URL diretamente em iframes ou para criar suas próprias integrações
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      <FloatingHelpButton menuLocation="admin-plan-embed" />
    </div>
  );
}