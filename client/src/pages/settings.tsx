import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Settings, Palette, MessageSquare, Globe, Brain, Upload, X, Image } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { settingsSchema } from "@/lib/validations";
import type { GlobalSettings } from "@shared/schema";
import { z } from "zod";
import { isUnauthorizedError } from "@/lib/authUtils";
import { FloatingHelpButton } from "@/components/floating-help-button";

type SettingsFormData = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery<GlobalSettings>({
    queryKey: ["/api/settings"],
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Tipo de arquivo inválido",
          description: "Por favor, selecione uma imagem.",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "Arquivo muito grande",
          description: "O arquivo deve ter no máximo 5MB.",
          variant: "destructive",
        });
        return;
      }

      setLogoFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return null;
    
    const formData = new FormData();
    formData.append('logo', logoFile);
    
    try {
      const response = await fetch('/api/upload/logo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Falha no upload do logo');
      }
      
      const result = await response.json();
      return result.url;
    } catch (error) {
      throw error;
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview("");
    form.setValue("logoUrl", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFaviconSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Tipo de arquivo inválido",
          description: "Por favor, selecione uma imagem.",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "Arquivo muito grande",
          description: "O arquivo deve ter no máximo 5MB.",
          variant: "destructive",
        });
        return;
      }

      setFaviconFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setFaviconPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadFavicon = async (): Promise<string | null> => {
    if (!faviconFile) return null;
    
    const formData = new FormData();
    formData.append('favicon', faviconFile);
    
    try {
      const response = await fetch('/api/upload/favicon', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Falha no upload do favicon');
      }
      
      const result = await response.json();
      return result.url;
    } catch (error) {
      throw error;
    }
  };

  const removeFavicon = () => {
    setFaviconFile(null);
    setFaviconPreview("");
    form.setValue("faviconUrl", "");
    if (faviconInputRef.current) {
      faviconInputRef.current.value = "";
    }
  };

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      systemName: "",
      logoUrl: "",
      faviconUrl: "",
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
      backgroundColor: "#f8fafc",
      textColor: "#1e293b",
      tourColor: "#b845dc",
      uazapiUrl: "",
      uazapiAdminToken: "",
      defaultAiPrompt: "",
      smtpHost: "",
      smtpPort: "",
      smtpUser: "",
      smtpPassword: "",
      smtpFromEmail: "",
      smtpFromName: "",
      smtpSecure: "tls",
      customHtml: "",
      customDomainUrl: "",
      systemUrl: "",
      supportWhatsapp: "",
    },
    values: settings ? {
      systemName: settings.systemName,
      logoUrl: settings.logoUrl || "",
      faviconUrl: settings.faviconUrl || "",
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      backgroundColor: settings.backgroundColor,
      textColor: settings.textColor,
      tourColor: (settings as any).tourColor || "#b845dc",
      uazapiUrl: settings.uazapiUrl || "",
      uazapiAdminToken: settings.uazapiAdminToken || "",
      defaultAiPrompt: (settings as any).defaultAiPrompt || "",
      smtpHost: (settings as any).smtpHost || "",
      smtpPort: (settings as any).smtpPort || "",
      smtpUser: (settings as any).smtpUser || "",
      smtpPassword: (settings as any).smtpPassword || "",
      smtpFromEmail: (settings as any).smtpFromEmail || "",
      smtpFromName: (settings as any).smtpFromName || "",
      smtpSecure: (settings as any).smtpSecure || "tls",
      customHtml: (settings as any).customHtml || "",
      customDomainUrl: (settings as any).customDomainUrl || "",
      systemUrl: (settings as any).systemUrl || "",
      supportWhatsapp: (settings as any).supportWhatsapp || "",
    } : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      return await apiRequest("/api/settings", "PUT", data);
    },
    onSuccess: () => {
      toast({
        title: "Configurações atualizadas",
        description: "As configurações foram salvas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Não autorizado",
          description: "Você foi desconectado. Fazendo login novamente...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
        return;
      }
      toast({
        title: "Erro",
        description: "Falha ao atualizar as configurações. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: SettingsFormData) => {
    try {
      // Upload logo if a new file was selected
      let logoUrl = data.logoUrl || "";
      if (logoFile) {
        const uploadedUrl = await uploadLogo();
        if (!uploadedUrl) {
          throw new Error("Falha no upload do logo");
        }
        logoUrl = uploadedUrl;
      }

      // Upload favicon if a new file was selected
      let faviconUrl = data.faviconUrl || "";
      if (faviconFile) {
        const uploadedUrl = await uploadFavicon();
        if (!uploadedUrl) {
          throw new Error("Falha no upload do favicon");
        }
        faviconUrl = uploadedUrl;
      }

      // Ensure all fields are strings for the API
      const processedData = {
        ...data,
        logoUrl,
        faviconUrl,
      };

      updateMutation.mutate(processedData);
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error.message || "Falha ao fazer upload do logo",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Configurações</h1>
        </div>
        <div className="space-y-4">
          <div className="h-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Geral
              </TabsTrigger>
              <TabsTrigger value="appearance" className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Aparência
              </TabsTrigger>
              <TabsTrigger value="uazapi" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                UAZAPI
              </TabsTrigger>
              <TabsTrigger value="smtp" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                SMTP
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Configurações Gerais
                  </CardTitle>
                  <CardDescription>
                    Configure as informações básicas do sistema.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="systemName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Sistema</FormLabel>
                        <FormControl>
                          <Input placeholder="Digite o nome do sistema" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="systemUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL do Sistema</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://agenday.gilliard.dev"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          URL base do sistema usado nos links de avaliação e comunicações externas.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supportWhatsapp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp de Suporte</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="5511999999999"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Número do WhatsApp para suporte (formato: código do país + DDD + número, ex: 5511999999999)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logo do Sistema</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            {/* Preview do logo atual */}
                            {(logoPreview || field.value || settings?.logoUrl) && (
                              <div className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
                                <div className="relative">
                                  <img
                                    src={logoPreview || field.value || settings?.logoUrl || ""}
                                    alt="Logo atual"
                                    className="h-12 w-auto max-w-[150px] object-contain rounded border bg-white px-2"
                                  />
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={removeLogo}
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">Logo atual</p>
                                  <p className="text-xs text-gray-500">
                                    {logoFile ? logoFile.name : "Logo configurado"}
                                  </p>
                                </div>
                              </div>
                            )}
                            
                            {/* Área de upload */}
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="logo-upload"
                              />
                              <label htmlFor="logo-upload" className="cursor-pointer">
                                <div className="mx-auto flex flex-col items-center">
                                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                  <p className="text-sm font-medium text-gray-700 mb-1">
                                    Clique para selecionar uma imagem
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    PNG, JPG, GIF até 5MB
                                  </p>
                                </div>
                              </label>
                            </div>

                            {/* Campo de URL alternativo */}
                            <div className="space-y-2">
                              <Label className="text-sm text-gray-600">
                                Ou insira uma URL da imagem:
                              </Label>
                              <Input 
                                placeholder="https://exemplo.com/logo.png" 
                                {...field}
                                className="text-sm"
                              />
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Favicon Upload Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="w-5 h-5" />
                    Favicon do Sistema
                  </CardTitle>
                  <CardDescription>
                    Adicione um favicon personalizado que aparecerá na aba do navegador.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="faviconUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Favicon</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            {/* Preview do favicon atual */}
                            {(faviconPreview || field.value) && (
                              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className="relative">
                                  <img 
                                    src={faviconPreview || field.value} 
                                    alt="Favicon preview" 
                                    className="w-8 h-8 rounded object-cover border"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={removeFavicon}
                                    className="absolute -top-2 -right-2 w-6 h-6 p-0 rounded-full"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-700">
                                    {faviconFile ? faviconFile.name : "Favicon configurado"}
                                  </p>
                                </div>
                              </div>
                            )}
                            
                            {/* Área de upload */}
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                              <input
                                ref={faviconInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFaviconSelect}
                                className="hidden"
                                id="favicon-upload"
                              />
                              <label htmlFor="favicon-upload" className="cursor-pointer">
                                <div className="mx-auto flex flex-col items-center">
                                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                  <p className="text-sm font-medium text-gray-700 mb-1">
                                    Clique para selecionar uma imagem
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    PNG, JPG, ICO até 5MB (recomendado: 32x32px)
                                  </p>
                                </div>
                              </label>
                            </div>

                            {/* Campo de URL alternativo */}
                            <div className="space-y-2">
                              <Label className="text-sm text-gray-600">
                                Ou insira uma URL da imagem:
                              </Label>
                              <Input 
                                placeholder="https://exemplo.com/favicon.ico" 
                                {...field}
                                className="text-sm"
                              />
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultAiPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prompt Padrão para Novas Empresas</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Digite o prompt padrão que será usado para o agente de IA das novas empresas. Este prompt será automaticamente preenchido quando uma nova empresa for criada, mas poderá ser modificado pela empresa posteriormente."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Este prompt será automaticamente aplicado às novas empresas na criação. As empresas podem modificar este prompt posteriormente em suas configurações.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    Personalização Visual
                  </CardTitle>
                  <CardDescription>
                    Customize as cores e aparência do sistema.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor Primária</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-16 h-10 p-1" {...field} />
                            <Input placeholder="#2563eb" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="secondaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor Secundária</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-16 h-10 p-1" {...field} />
                            <Input placeholder="#64748b" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="backgroundColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor de Fundo</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-16 h-10 p-1" {...field} />
                            <Input placeholder="#f8fafc" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="textColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor do Texto</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-16 h-10 p-1" {...field} />
                            <Input placeholder="#1e293b" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tourColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor do Tour Guiado</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-16 h-10 p-1" {...field} />
                            <Input placeholder="#b845dc" {...field} />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Cor utilizada para destacar elementos durante o tour guiado das empresas
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Custom HTML Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Texto HTML Personalizado
                  </CardTitle>
                  <CardDescription>
                    Adicione texto HTML personalizado que será exibido no sistema.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="customHtml"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HTML Personalizado</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="<div>Seu HTML personalizado aqui...</div>"
                            className="min-h-[120px] font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <div className="text-xs text-gray-500 mt-2">
                          Suporte completo para HTML, CSS e JavaScript inline. Use com responsabilidade.
                        </div>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Custom Domain URL Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    URL de Domínio Personalizado
                  </CardTitle>
                  <CardDescription>
                    Configure uma URL personalizada para acesso ao sistema via domínio customizado.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="customDomainUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL do Domínio Personalizado</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://meusistema.com.br"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <div className="text-xs text-gray-500 mt-2">
                          Digite a URL completa incluindo https:// para configurar um domínio personalizado.
                        </div>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="uazapi" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    UAZAPI
                  </CardTitle>
                  <CardDescription>
                    Configure a integração com a UAZAPI para WhatsApp.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="uazapiUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL da UAZAPI</FormLabel>
                        <FormControl>
                          <Input placeholder="https://api.uazapi.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="uazapiAdminToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Token</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Digite o admin token da UAZAPI"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultBirthdayMessage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mensagem Padrão de Aniversário</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="🎉 Parabéns, {NOME}! A {EMPRESA} deseja um feliz aniversário e muito sucesso! 🎂"
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Esta mensagem será aplicada como padrão para todas as novas empresas. Use <code className="bg-gray-100 px-1 rounded">{"{NOME}"}</code> para o nome do cliente e <code className="bg-gray-100 px-1 rounded">{"{EMPRESA}"}</code> para o nome da empresa.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <h4 className="font-medium text-blue-900 mb-2">Como configurar:</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• <strong>URL da API:</strong> URL base da sua instância UAZAPI</li>
                      <li>• <strong>Exemplo:</strong> https://api.uazapi.com</li>
                      <li>• <strong>Admin Token:</strong> Token de administrador da UAZAPI para gerenciar instâncias</li>
                      <li>• Se o teste falhar, verifique se a URL e o Admin Token estão corretos</li>
                    </ul>
                  </div>

                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/admin/uazapi/test', {
                            credentials: 'include'
                          });
                          const result = await response.json();
                          
                          if (result.success) {
                            toast({
                              title: "Conexão bem-sucedida!",
                              description: result.message,
                            });
                          } else {
                            toast({
                              title: "Erro na conexão",
                              description: result.message,
                              variant: "destructive"
                            });
                          }
                        } catch (error) {
                          toast({
                            title: "Erro ao testar conexão",
                            description: "Erro interno do servidor",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      Testar Conexão
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="smtp" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Configurações SMTP
                  </CardTitle>
                  <CardDescription>
                    Configure o servidor de email para recuperação de senhas e notificações.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="smtpHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Servidor SMTP</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="smtpPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Porta SMTP</FormLabel>
                        <FormControl>
                          <Input placeholder="587" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="smtpUser"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Usuário SMTP</FormLabel>
                        <FormControl>
                          <Input placeholder="seu-email@gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="smtpPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha SMTP</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Senha ou App Password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="smtpFromEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Remetente</FormLabel>
                        <FormControl>
                          <Input placeholder="noreply@empresa.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="smtpFromName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Remetente</FormLabel>
                        <FormControl>
                          <Input placeholder="Sistema de Gestão" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="smtpSecure"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Segurança</FormLabel>
                        <FormControl>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo de segurança" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tls">TLS (Recomendado)</SelectItem>
                              <SelectItem value="ssl">SSL</SelectItem>
                              <SelectItem value="none">Nenhum</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <h4 className="font-medium text-blue-900 mb-2">Configuração SMTP:</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• <strong>Gmail:</strong> smtp.gmail.com, porta 587, TLS, use App Password</li>
                      <li>• <strong>Outlook:</strong> smtp-mail.outlook.com, porta 587, TLS</li>
                      <li>• <strong>SendGrid:</strong> smtp.sendgrid.net, porta 587, TLS</li>
                      <li>• <strong>Mailgun:</strong> smtp.mailgun.org, porta 587, TLS</li>
                      <li>• <strong>TLS (587):</strong> Mais seguro e recomendado para a maioria dos provedores</li>
                      <li>• <strong>SSL (465):</strong> Para provedores que requerem SSL exclusivo</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={updateMutation.isPending}
              className="w-full md:w-auto"
            >
              {updateMutation.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </form>
      </Form>
      <FloatingHelpButton menuLocation="admin-settings" />
    </div>
  );
}