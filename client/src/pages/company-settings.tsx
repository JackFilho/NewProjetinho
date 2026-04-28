import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Building2, Lock, User, MessageSquare, Trash2, Plus, Smartphone, QrCode, RefreshCw, Bot, Key, Gift, Calendar, Bell, Clock, CheckCircle, Send, XCircle, LogOut, CreditCard, DollarSign, PhoneOff, PauseCircle, Upload, X, GraduationCap, Palette } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCompanyAuth } from "@/hooks/useCompanyAuth";
import { FloatingHelpButton } from "@/components/floating-help-button";
import { z } from "zod";
import { companyProfileSchema, companyPasswordSchema, companyAiAgentSchema, companyHumanRequestSchema, companyCourseNotificationSchema, companyIgnoredNumbersSchema, whatsappInstanceSchema, webhookConfigSchema, companySettingsSchema, asaasConfigSchema } from "@/lib/validations";
import { MetaEmbeddedSignup } from "@/components/meta-embedded-signup";
import { MetaManualConnect } from "@/components/meta-manual-connect";

// Função formatDocument local para evitar problemas de importação
function formatDocument(value: string): string {
  if (!value) return "";
  // Remove all non-numeric characters
  const numbers = value.replace(/\D/g, '');
  
  // If length is 11, format as CPF: 000.000.000-00
  if (numbers.length <= 11) {
    return numbers
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  }
  
  // If length is 14, format as CNPJ: 00.000.000/0000-00
  return numbers
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
}

const birthdayMessageSchema = z.object({
  messageTemplate: z.string().min(10, "A mensagem deve ter pelo menos 10 caracteres"),
  isActive: z.boolean().default(true),
});



type CompanyProfileData = z.infer<typeof companyProfileSchema>;
type CompanyPasswordData = z.infer<typeof companyPasswordSchema>;
type CompanyAiAgentData = z.infer<typeof companyAiAgentSchema>;
type CompanyHumanRequestData = z.infer<typeof companyHumanRequestSchema>;
type CompanyCourseNotificationData = z.infer<typeof companyCourseNotificationSchema>;
type CompanyIgnoredNumbersData = z.infer<typeof companyIgnoredNumbersSchema>;
type WhatsappInstanceData = z.infer<typeof whatsappInstanceSchema>;
type WebhookConfigData = z.infer<typeof webhookConfigSchema>;
type BirthdayMessageData = z.infer<typeof birthdayMessageSchema>;
type CompanySettingsData = z.infer<typeof companySettingsSchema>;
type AsaasConfigData = z.infer<typeof asaasConfigSchema>;

export default function CompanySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompanyAuth();

  // Company logo upload states
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: "O arquivo deve ter no máximo 5MB.",
          variant: "destructive",
        });
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadCompanyLogo = async (): Promise<string | null> => {
    if (!logoFile) return null;
    const formData = new FormData();
    formData.append('logo', logoFile);
    try {
      const response = await fetch('/api/company/upload/logo', {
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

  const removeCompanyLogo = () => {
    setLogoFile(null);
    setLogoPreview("");
    companySettingsForm.setValue("logoUrl", "");
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  // Company data loaded effect (logging removed for security)
  useEffect(() => {
    if (company) {
      // Company data loaded
    }
  }, [company]);

  // Load existing course files when company data is available
  // Use a ref to track if we should reload files (only on initial load or after successful save)
  const shouldReloadFiles = useRef(true);

  useEffect(() => {
    if (company && shouldReloadFiles.current) {
      // Loading course files from company data

      const existingFiles: Array<{url: string, type: string, name: string}> = [];

      // Load existing images
      if (company.coursesImages) {
        const imageUrls = company.coursesImages.split(',').map(url => url.trim()).filter(url => url);
        // Parsed image URLs
        imageUrls.forEach((url, index) => {
          existingFiles.push({
            url,
            type: 'image',
            name: `Imagem ${index + 1}`
          });
        });
      }

      // Load existing PDFs
      if (company.coursesPdfs) {
        const pdfUrls = company.coursesPdfs.split(',').map(url => url.trim()).filter(url => url);
        // Parsed PDF URLs
        pdfUrls.forEach((url, index) => {
          existingFiles.push({
            url,
            type: 'pdf',
            name: `PDF ${index + 1}`
          });
        });
      }

      // Course files loaded
      setCourseFiles(existingFiles);
      shouldReloadFiles.current = false; // Prevent reloading until next save
    }
  }, [company]);

  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [numberToRemove, setNumberToRemove] = useState<string | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  // Estados para Pairing Code
  const [connectionMode, setConnectionMode] = useState<'qrcode' | 'pairingcode'>('qrcode');
  const [pairingPhoneNumber, setPairingPhoneNumber] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string>('');
  const [isPairingCodeLoading, setIsPairingCodeLoading] = useState(false);

  // States for course files upload
  const [courseFiles, setCourseFiles] = useState<Array<{url: string, type: string, name: string}>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Query for OpenAI models
  const { data: openaiModels, isLoading: isLoadingModels, refetch: refetchModels } = useQuery<{ models: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/openai/models"],
    enabled: false, // Only fetch when explicitly triggered
  });

  // Function to fetch OpenAI models
  const fetchModels = async () => {
    setFetchingModels(true);
    try {
      await refetchModels();
      toast({
        title: "Modelos carregados",
        description: "Lista de modelos OpenAI atualizada com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao carregar modelos",
        description: error.message || "Não foi possível carregar os modelos da OpenAI",
        variant: "destructive",
      });
    } finally {
      setFetchingModels(false);
    }
  };

  // Function to handle course file selection and upload
  const handleCourseFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Por favor, selecione uma imagem ou PDF.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/course-file', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Falha no upload do arquivo');
      }

      const result = await response.json();

      // Add the uploaded file to the list
      setCourseFiles(prev => [...prev, {
        url: result.url,
        type: isImage ? 'image' : 'pdf',
        name: file.name
      }]);

      toast({
        title: "Upload concluído",
        description: `${isImage ? 'Imagem' : 'PDF'} enviado com sucesso.`,
      });

      // Reset the input
      event.target.value = '';
    } catch (error) {
      toast({
        title: "Erro no upload",
        description: "Falha ao fazer upload do arquivo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  // Function to remove a course file
  const removeCourseFile = (index: number) => {
    setCourseFiles(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "Arquivo removido",
      description: "O arquivo foi removido da lista.",
    });
  };

  const profileForm = useForm<CompanyProfileData>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      fantasyName: "",
      document: "",
      address: "",
      googleMapsLocation: "",
      coursesDescription: "",
      coursesImages: "",
      coursesPdfs: "",
      email: "",
    },
    values: company ? {
      fantasyName: company.fantasyName || "",
      document: company.document || "",
      address: company.address || "",
      googleMapsLocation: company.googleMapsLocation || "",
      coursesDescription: company.coursesDescription || "",
      coursesImages: company.coursesImages || "",
      coursesPdfs: company.coursesPdfs || "",
      email: company.email || "",
    } : undefined,
  });

  const passwordForm = useForm<CompanyPasswordData>({
    resolver: zodResolver(companyPasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const whatsappForm = useForm<WhatsappInstanceData>({
    resolver: zodResolver(whatsappInstanceSchema),
    defaultValues: {
      instanceName: "",
      phoneNumber: "",
    },
  });

  const aiAgentForm = useForm<CompanyAiAgentData>({
    resolver: zodResolver(companyAiAgentSchema),
    defaultValues: {
      aiAgentPrompt: "",
      agentInactivityTimeout: 30,
      autoSelectProfessional: false,
      openaiApiKey: "",
      openaiModel: "gpt-4o-mini",
      openaiTemperature: 0.7,
      openaiMaxTokens: 180,
    },
    values: company ? {
      aiAgentPrompt: company.aiAgentPrompt || "",
      agentInactivityTimeout: company.agentInactivityTimeout ? Number(company.agentInactivityTimeout) : 30,
      autoSelectProfessional: company.autoSelectProfessional === true,
      openaiApiKey: "",
      openaiModel: company.openaiModel || "gpt-4o-mini",
      openaiTemperature: company.openaiTemperature ? Number(company.openaiTemperature) : 0.7,
      openaiMaxTokens: company.openaiMaxTokens ? Number(company.openaiMaxTokens) : 180,
    } : undefined,
  });

  const humanRequestForm = useForm<CompanyHumanRequestData>({
    resolver: zodResolver(companyHumanRequestSchema),
    defaultValues: {
      humanRequestEnabled: false,
      humanRequestContact: "",
      humanRequestMessage: "",
      humanRequestKeywords: "",
      humanRequestTimeout: 30,
    },
    values: company ? {
      humanRequestEnabled: company.humanRequestEnabled === true,
      humanRequestContact: company.humanRequestContact || "",
      humanRequestMessage: company.humanRequestMessage || "",
      humanRequestKeywords: company.humanRequestKeywords || "",
      humanRequestTimeout: company.humanRequestTimeout ?? 30,
    } : undefined,
  });

  const courseNotificationForm = useForm<CompanyCourseNotificationData>({
    resolver: zodResolver(companyCourseNotificationSchema),
    defaultValues: {
      courseNotificationEnabled: false,
      courseNotificationContact: "",
      courseNotificationMessage: "",
      courseNotificationKeywords: "",
      courseNotificationTimeout: 30,
    },
    values: company ? {
      courseNotificationEnabled: company.courseNotificationEnabled === true,
      courseNotificationContact: company.courseNotificationContact || "",
      courseNotificationMessage: company.courseNotificationMessage || "",
      courseNotificationKeywords: company.courseNotificationKeywords || "",
      courseNotificationTimeout: company.courseNotificationTimeout ?? 30,
    } : undefined,
  });

  const ignoredNumbersForm = useForm<CompanyIgnoredNumbersData>({
    resolver: zodResolver(companyIgnoredNumbersSchema),
    defaultValues: {
      ignoredNumbers: "",
    },
    values: company ? {
      ignoredNumbers: company.ignoredNumbers || "",
    } : undefined,
  });

  const webhookForm = useForm<WebhookConfigData>({
    resolver: zodResolver(webhookConfigSchema),
    defaultValues: {
      apiUrl: "",
      apiKey: "",
    },
  });

  const companySettingsForm = useForm<CompanySettingsData>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      birthdayMessage: "",
      aiAgentPrompt: "",
      logoUrl: "",
      primaryColor: "",
    },
    values: company ? {
      birthdayMessage: company.birthdayMessage || "",
      aiAgentPrompt: company.aiAgentPrompt || "",
      logoUrl: company.logoUrl || "",
      primaryColor: (company as any).primaryColor || "",
    } : undefined,
  });

  const asaasForm = useForm<AsaasConfigData>({
    resolver: zodResolver(asaasConfigSchema),
    defaultValues: {
      asaasApiKey: "",
      asaasEnvironment: "sandbox",
      asaasEnabled: false,
    },
    values: company ? {
      asaasApiKey: "",
      asaasEnvironment: company.asaasEnvironment || "sandbox",
      asaasEnabled: company.asaasEnabled || false,
    } : undefined,
  });

  // Update form when company data loads
  useEffect(() => {
    if (company?.aiAgentPrompt) {
      aiAgentForm.reset({
        aiAgentPrompt: company.aiAgentPrompt,
      });
    }
  }, [company?.aiAgentPrompt, aiAgentForm]);

  // Force update agentInactivityTimeout when company data changes
  useEffect(() => {
    if (company?.agentInactivityTimeout !== undefined) {
      aiAgentForm.setValue('agentInactivityTimeout', Number(company.agentInactivityTimeout), { shouldValidate: false, shouldDirty: false });
    }
  }, [company?.agentInactivityTimeout, aiAgentForm]);

  // Force update autoSelectProfessional when company data changes
  useEffect(() => {
    if (company) {
      aiAgentForm.setValue('autoSelectProfessional', company.autoSelectProfessional === true, { shouldValidate: false, shouldDirty: false });
    }
  }, [company?.autoSelectProfessional, aiAgentForm]);

  // Force update OpenAI fields when company data changes
  useEffect(() => {
    if (company) {
      // API key não é mais retornada pelo backend por segurança - o campo fica vazio até o usuário digitar uma nova
      if (company.openaiModel) aiAgentForm.setValue('openaiModel', company.openaiModel, { shouldValidate: false, shouldDirty: false });
      if (company.openaiTemperature !== undefined) aiAgentForm.setValue('openaiTemperature', Number(company.openaiTemperature), { shouldValidate: false, shouldDirty: false });
      if (company.openaiMaxTokens !== undefined) aiAgentForm.setValue('openaiMaxTokens', Number(company.openaiMaxTokens), { shouldValidate: false, shouldDirty: false });
    }
  }, [company?.hasOpenaiApiKey, company?.openaiModel, company?.openaiTemperature, company?.openaiMaxTokens, aiAgentForm]);

  // WhatsApp instances query
  const { data: whatsappInstances = [], isLoading: isLoadingInstances } = useQuery<any[]>({
    queryKey: ["/api/company/whatsapp/instances"],
  });

  // Global settings query for system URL
  const { data: globalSettings } = useQuery({
    queryKey: ["/api/admin/settings"],
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: CompanyProfileData) => {
      const response = await apiRequest("/api/company/profile", "PUT", data);
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Perfil atualizado",
        description: "As informações da empresa foram atualizadas com sucesso.",
      });
      // Atualiza diretamente o cache com os dados retornados pelo servidor
      queryClient.setQueryData(["/api/company/auth/profile"], data);
      // Allow files to be reloaded from the updated company data
      shouldReloadFiles.current = true;
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar perfil.",
        variant: "destructive",
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: CompanyPasswordData) => {
      await apiRequest("/api/company/password", "PUT", data);
    },
    onSuccess: () => {
      toast({
        title: "Senha alterada",
        description: "Sua senha foi alterada com sucesso.",
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao alterar senha.",
        variant: "destructive",
      });
    },
  });

  const onProfileSubmit = (data: CompanyProfileData) => {
    // Separate files into images and PDFs
    const images = courseFiles.filter(f => f.type === 'image').map(f => f.url);
    const pdfs = courseFiles.filter(f => f.type === 'pdf').map(f => f.url);

    // Update the data with the file URLs
    const updatedData = {
      ...data,
      coursesImages: images.join(', '),
      coursesPdfs: pdfs.join(', ')
    };

    updateProfileMutation.mutate(updatedData);
  };

  const onPasswordSubmit = (data: CompanyPasswordData) => {
    updatePasswordMutation.mutate(data);
  };

  const onCompanySettingsSubmit = (data: CompanySettingsData) => {
    updateCompanySettingsMutation.mutate(data);
  };

  const updateAsaasConfigMutation = useMutation({
    mutationFn: async (data: AsaasConfigData) => {
      return await apiRequest("/api/company/asaas-config", "PUT", data);
    },
    onSuccess: () => {
      toast({
        title: "Configurações do Mercado Pago atualizadas",
        description: "As configurações do gateway de pagamento foram salvas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/auth/profile"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar configurações do Mercado Pago.",
        variant: "destructive",
      });
    },
  });

  const onAsaasSubmit = (data: AsaasConfigData) => {
    updateAsaasConfigMutation.mutate(data);
  };

  const createInstanceMutation = useMutation({
    mutationFn: async (data: WhatsappInstanceData) => {
      return await apiRequest("/api/company/whatsapp/instances", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Instância criada",
        description: "Instância do WhatsApp criada com sucesso.",
      });
      whatsappForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar instância",
        variant: "destructive",
      });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: async (instanceId: number) => {
      await apiRequest(`/api/company/whatsapp/instances/${instanceId}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Instância excluída",
        description: "Instância do WhatsApp excluída com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao excluir instância",
        variant: "destructive",
      });
    },
  });

  const updateAiAgentMutation = useMutation({
    mutationFn: async (data: CompanyAiAgentData) => {
      const response = await apiRequest("/api/company/ai-agent", "PUT", data);
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Agente IA configurado",
        description: "As configurações do agente IA foram atualizadas com sucesso.",
      });
      // Invalidate profile to refetch latest data from server
      // Form will automatically update via the 'values' prop
      queryClient.invalidateQueries({ queryKey: ["/api/company/auth/profile"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar configurações do agente IA. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const updateHumanRequestMutation = useMutation({
    mutationFn: async (data: CompanyHumanRequestData) => {
      const response = await apiRequest("/api/company/human-request", "PUT", data);
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Configurações salvas",
        description: "As configurações de solicitação de atendimento humano foram atualizadas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/auth/profile"] });
      humanRequestForm.reset({
        humanRequestEnabled: data.humanRequestEnabled || false,
        humanRequestContact: data.humanRequestContact || "",
        humanRequestMessage: data.humanRequestMessage || "",
        humanRequestKeywords: data.humanRequestKeywords || "",
        humanRequestTimeout: data.humanRequestTimeout ?? 30,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar configurações. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const updateCourseNotificationMutation = useMutation({
    mutationFn: async (data: CompanyCourseNotificationData) => {
      const response = await apiRequest("/api/company/course-notification", "PUT", data);
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Configurações salvas",
        description: "As configurações de notificação de cursos foram atualizadas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/auth/profile"] });
      courseNotificationForm.reset({
        courseNotificationEnabled: data.courseNotificationEnabled || false,
        courseNotificationContact: data.courseNotificationContact || "",
        courseNotificationMessage: data.courseNotificationMessage || "",
        courseNotificationKeywords: data.courseNotificationKeywords || "",
        courseNotificationTimeout: data.courseNotificationTimeout ?? 30,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar configurações de cursos. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const resumeAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/company/agent/resume", "POST", {});
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Atendimento retomado",
        description: "O agente IA voltará a responder as próximas mensagens dos clientes.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao retomar atendimento. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const pauseAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/company/agent/pause", "POST", {});
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Atendimento pausado",
        description: "O agente IA foi pausado e não responderá até ser retomado.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao pausar atendimento. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const updateIgnoredNumbersMutation = useMutation({
    mutationFn: async (data: CompanyIgnoredNumbersData) => {
      const response = await apiRequest("/api/company/human-request", "PUT", data);
      return response;
    },
    onSuccess: async (data: any) => {
      // Refetch company profile to update UI
      await queryClient.refetchQueries({ queryKey: ["/api/company/auth/profile"] });

      // Clear the textarea after successful save
      ignoredNumbersForm.reset({
        ignoredNumbers: "",
      });

      // Count numbers from returned data
      const savedNumbers = (data.ignoredNumbers || "")
        .split('\n')
        .map((num: string) => num.trim())
        .filter((num: string) => num.length > 0);
      const count = savedNumbers.length;

      toast({
        title: "Números atualizados",
        description: `${count} número${count !== 1 ? 's' : ''} ignorado${count !== 1 ? 's' : ''} no total.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar números ignorados. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const onWhatsappSubmit = (data: WhatsappInstanceData) => {
    createInstanceMutation.mutate(data);
  };

  const onAiAgentSubmit = (data: CompanyAiAgentData) => {
    updateAiAgentMutation.mutate(data);
  };

  const onHumanRequestSubmit = (data: CompanyHumanRequestData) => {
    updateHumanRequestMutation.mutate(data);
  };

  const onCourseNotificationSubmit = (data: CompanyCourseNotificationData) => {
    updateCourseNotificationMutation.mutate(data);
  };

  const onBirthdayMessageSubmit = (data: BirthdayMessageData) => {
    createBirthdayMessageMutation.mutate(data);
  };

  // Helper functions for ignored numbers
  const getSavedNumbersList = (): string[] => {
    if (!company?.ignoredNumbers) return [];
    return company.ignoredNumbers
      .split('\n')
      .map(num => num.trim())
      .filter(num => num.length > 0);
  };

  const handleRemoveNumber = (numberToRemove: string) => {
    setNumberToRemove(numberToRemove);
    setShowRemoveDialog(true);
  };

  const confirmRemoveNumber = () => {
    if (!numberToRemove) return;

    const currentNumbers = getSavedNumbersList();
    const updatedNumbers = currentNumbers.filter(num => num !== numberToRemove);
    const updatedValue = updatedNumbers.join('\n');

    updateIgnoredNumbersMutation.mutate({ ignoredNumbers: updatedValue });

    setShowRemoveDialog(false);
    setNumberToRemove(null);
  };

  const handleAddNumbers = (data: CompanyIgnoredNumbersData) => {
    const newNumbers = (data.ignoredNumbers || "")
      .split('\n')
      .map(num => num.trim())
      .filter(num => num.length > 0);

    if (newNumbers.length === 0) {
      toast({
        title: "Atenção",
        description: "Digite pelo menos um número para adicionar.",
        variant: "destructive",
      });
      return;
    }

    // Get existing saved numbers
    const existingNumbers = getSavedNumbersList();

    // Check for duplicates
    const actuallyNew = newNumbers.filter(num => !existingNumbers.includes(num));

    if (actuallyNew.length === 0) {
      toast({
        title: "Números já existentes",
        description: `Todos os números informados já estão na lista de ignorados.`,
        variant: "destructive",
      });
      return;
    }

    // Combine and remove duplicates
    const allNumbers = [...existingNumbers, ...actuallyNew];

    // Save
    const updatedValue = allNumbers.join('\n');
    updateIgnoredNumbersMutation.mutate({ ignoredNumbers: updatedValue });
  };

  const configureWebhookMutation = useMutation({
    mutationFn: async (instanceId: number) => {
      const webhookPayload = {
        webhook: {
          enabled: true,
          url: `${window.location.origin}/api/webhook/whatsapp/${selectedInstance?.instanceName}`,
          headers: {
            "autorization": "Bearer TOKEN",
            "Content-Type": "application/json"
          },
          byEvents: true,
          base64: true,
          events: [
            "CHATS_UPSERT"
          ]
        }
      };
      const response = await apiRequest(`/api/company/whatsapp/instances/${instanceId}/configure-webhook`, "POST", webhookPayload);
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
      setShowWebhookDialog(false);
      setSelectedInstance(null);
      toast({
        title: "Agente IA configurado",
        description: "Webhook configurado com sucesso na Meta API.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na configuração",
        description: error.message || "Erro ao configurar webhook do agente IA",
        variant: "destructive",
      });
    },
  });

  const fetchInstanceDetailsMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      const response = await apiRequest("GET", `/api/company/whatsapp/instances/${instanceName}/details`);
      return response;
    },
    onSuccess: (data: any) => {
      const instance = data.instance || data;
      const apiKey = instance?.apiKey;
      const apiUrl = instance?.apiUrl;

      toast({
        title: "Detalhes da Instância",
        description: `URL da API: ${apiUrl || 'Não configurada'}\nChave da API: ${apiKey ? '••••••••••••••••••••' : 'Não configurada'}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao buscar detalhes",
        description: error.message || "Falha ao buscar detalhes da instância",
        variant: "destructive",
      });
    },
  });

  // Function to poll for QR code updates from database
  const pollForQrCode = async (instanceName: string): Promise<string | null> => {
    try {
      const instances = await apiRequest("GET", "/api/company/whatsapp/instances");
      const instance = instances.find((inst: any) => inst.instanceName === instanceName);
      return instance?.qrCode || null;
    } catch (error) {
      return null;
    }
  };

  // Function to refresh instance status from database
  const refreshInstanceStatus = async (instanceName: string) => {
    try {
      const response = await apiRequest(`/api/company/whatsapp/instances/${instanceName}/refresh-status`, "GET");
      if (response.ok) {
        const statusData = await response.json();
        // Refresh the instances list to update UI
        queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
        return statusData.status;
      }
    } catch (error) {
      // Error silently handled
    }
    return null;
  };

  const connectInstanceMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      // Trigger connection in Meta API
      const result = await apiRequest(`/api/company/whatsapp/instances/${instanceName}/connect`, "GET");
      return result;
    },
    onSuccess: async (data: any) => {
      // Show modal immediately
      setShowQrDialog(true);

      // Check for QR code in multiple possible fields
      const qrCode = data.qrcode || data.base64 || data.qr || data.qr_code ||
                    data.data?.qrcode || data.data?.base64;
      
      if (qrCode && qrCode.length > 100) {
        // QR code received directly from API
        setQrCodeData(qrCode);
        toast({
          title: "QR code gerado",
          description: "Escaneie o QR code com seu WhatsApp.",
        });
      } else {
        // QR code not available yet, start polling
        setQrCodeData("");
        toast({
          title: "Gerando QR code",
          description: "Aguarde enquanto o QR code é gerado...",
        });

        const instanceName = data.instanceName || selectedInstance?.instanceName;

        // Poll for QR code with timeout
        let attempts = 0;
        const maxAttempts = 15; // 30 seconds total

        const pollInterval = setInterval(async () => {
          attempts++;
          const updatedQrCode = await pollForQrCode(instanceName);

          if (updatedQrCode && updatedQrCode.length > 100) {
            clearInterval(pollInterval);
            setQrCodeData(updatedQrCode);
            toast({
              title: "QR code gerado",
              description: "Escaneie o QR code com seu WhatsApp.",
            });
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            toast({
              title: "Timeout",
              description: "QR code não foi gerado. Tente novamente.",
              variant: "destructive",
            });
          }
        }, 2000); // Check every 2 seconds
      }

      // Start status polling to detect when connection is established
      const instanceName = data.instanceName || selectedInstance?.instanceName;
      if (instanceName) {
        const statusPollInterval = setInterval(async () => {
          const currentStatus = await refreshInstanceStatus(instanceName);
          if (currentStatus === 'connected') {
            clearInterval(statusPollInterval);
            setShowQrDialog(false);
            toast({
              title: "WhatsApp conectado!",
              description: "Sua instância WhatsApp foi conectada com sucesso.",
            });
          }
        }, 3000); // Check every 3 seconds

        // Clear status polling after 2 minutes
        setTimeout(() => {
          clearInterval(statusPollInterval);
        }, 120000);
      }
    },
    onError: (error: any) => {
      let errorMessage = error.message || "Erro ao conectar instância";
      
      if (error.message?.includes("Meta API não configurada")) {
        errorMessage = "Configure a Meta API nas configurações do administrador antes de conectar instâncias WhatsApp.";
      } else if (error.message?.includes("Instância não encontrada")) {
        errorMessage = "Esta instância não foi encontrada na Meta API. Verifique se foi criada corretamente.";
      }
      
      toast({
        title: "Erro de Conexão",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const checkStatusMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      const response = await apiRequest("GET", `/api/company/whatsapp/instances/${instanceName}/status`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
      toast({
        title: "Status atualizado",
        description: `Status da instância: ${data.connectionStatus || 'Desconhecido'}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao verificar status",
        description: error.message || "Erro ao verificar status da instância",
        variant: "destructive",
      });
    },
  });

  const disconnectInstanceMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      const response = await apiRequest(`/api/company/whatsapp/instances/${instanceName}/disconnect`, "POST");
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
      toast({
        title: "Instância desconectada",
        description: "Instância do WhatsApp desconectada com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message || "Erro ao desconectar instância",
        variant: "destructive",
      });
    },
  });

  const getQrCodeMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      const response = await apiRequest(`/api/company/whatsapp/instances/${instanceName}/qrcode`, "GET");
      return response;
    },
    onSuccess: (data: any) => {
      if (data.qrcode) {
        setQrCodeData(data.qrcode);
        setShowQrDialog(true);
        toast({
          title: "QR Code gerado",
          description: "Escaneie o QR code com seu WhatsApp para conectar.",
        });
      } else {
        toast({
          title: "QR Code não disponível",
          description: "A instância pode já estar conectada ou não estar pronta.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao buscar QR Code",
        description: error.message || "Erro ao buscar QR code da instância",
        variant: "destructive",
      });
    },
  });

  // Mutation para obter Pairing Code
  const getPairingCodeMutation = useMutation({
    mutationFn: async ({ instanceName, phoneNumber }: { instanceName: string; phoneNumber: string }) => {
      const response = await apiRequest(`/api/company/whatsapp/instances/${instanceName}/pairingcode`, "POST", { phoneNumber });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.code) {
        setPairingCode(data.code);
        toast({
          title: "Código de pareamento gerado",
          description: "Digite o código no seu WhatsApp para conectar.",
        });
      } else {
        toast({
          title: "Erro ao gerar código",
          description: data.message || "Não foi possível gerar o código de pareamento.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar código",
        description: error.message || "Erro ao gerar código de pareamento",
        variant: "destructive",
      });
    },
  });

  // State for AI agent testing
  const [testMessage, setTestMessage] = useState("");
  const [agentResponse, setAgentResponse] = useState("");
  
  // State for birthday message testing
  const [testPhoneNumber, setTestPhoneNumber] = useState("");

  // Birthday messaging form
  const birthdayForm = useForm<BirthdayMessageData>({
    resolver: zodResolver(birthdayMessageSchema),
    defaultValues: {
      messageTemplate: "Que este novo ano de vida seja repleto de alegrias, conquistas e momentos especiais.\n\nPara comemorar, que tal agendar um horário especial conosco? 🎉✨\n\nFeliz aniversário! 🎂",
      isActive: true,
    },
  });

  // Birthday messages queries
  const { data: birthdayMessages = [] } = useQuery<any[]>({
    queryKey: ["/api/company/birthday-messages"],
  });

  const { data: birthdayHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/company/birthday-message-history"],
  });

  // Client data for birthday functionality
  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/company/clients"],
  });

  // Update form when birthday messages are loaded
  useEffect(() => {
    if (birthdayMessages.length > 0) {
      const activeMessage = birthdayMessages.find((msg: any) => msg.isActive) || birthdayMessages[0];
      birthdayForm.reset({
        messageTemplate: activeMessage.messageTemplate,
        isActive: activeMessage.isActive,
      });
    }
  }, [birthdayMessages, birthdayForm]);

  const createBirthdayMessageMutation = useMutation({
    mutationFn: async (data: BirthdayMessageData) => {
      return await apiRequest("POST", "/api/company/birthday-messages", data);
    },
    onSuccess: () => {
      toast({
        title: "Mensagem salva",
        description: "Mensagem de aniversário configurada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/birthday-messages"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar mensagem",
        description: error.message || "Erro ao configurar mensagem de aniversário",
        variant: "destructive",
      });
    },
  });

  const sendBirthdayMessageMutation = useMutation({
    mutationFn: async (clientId: number) => {
      const response = await apiRequest(`/api/company/send-birthday-message/${clientId}`, "POST");
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Mensagem enviada",
        description: `Mensagem de aniversário enviada para ${data.client}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/birthday-message-history"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message || "Erro ao enviar mensagem de aniversário",
        variant: "destructive",
      });
    },
  });

  const testBirthdayMessageMutation = useMutation({
    mutationFn: async () => {
      if (!testPhoneNumber.trim()) {
        throw new Error("Número de telefone é obrigatório para o teste");
      }
      const response = await apiRequest("POST", "/api/company/test-birthday-message", {
        testPhoneNumber: testPhoneNumber.trim()
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: data.success ? "Mensagem de teste enviada" : "Erro no teste",
        description: data.message || `Mensagem enviada para ${testPhoneNumber}`,
        variant: data.success ? "default" : "destructive",
      });
      if (data.success) {
        setTestPhoneNumber(""); // Limpar o campo apenas se bem-sucedido
      }
    },
    onError: (error: any) => {
      toast({
        title: "Erro no teste",
        description: error.message || "Erro ao testar mensagem de aniversário",
        variant: "destructive",
      });
    },
  });

  const testAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/company/ai-agent/test", "POST", {
        message: testMessage
      });
      return response;
    },
    onSuccess: (data: any) => {
      setAgentResponse(data.response);
      toast({
        title: "Teste realizado",
        description: "O agente IA respondeu com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro no teste",
        description: error.message || "Erro ao testar o agente IA",
        variant: "destructive",
      });
    },
  });

  const updateCompanySettingsMutation = useMutation({
    mutationFn: async (data: CompanySettingsData) => {
      // Se tiver um arquivo de logo selecionado, faz upload primeiro
      if (logoFile) {
        try {
          const uploadedUrl = await uploadCompanyLogo();
          if (uploadedUrl) {
            data.logoUrl = uploadedUrl;
          }
        } catch (error) {
          throw new Error("Falha ao fazer upload do logo");
        }
      }
      return await apiRequest("/api/company/settings-update", "PUT", data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/auth/profile"] });
      // Limpar estado de upload
      setLogoFile(null);
      setLogoPreview("");
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
      // Update form with saved values
      if (data) {
        companySettingsForm.reset({
          birthdayMessage: data.birthdayMessage || "",
          aiAgentPrompt: data.aiAgentPrompt || "",
          logoUrl: data.logoUrl || "",
          primaryColor: data.primaryColor || "",
        });
      }
      toast({
        title: "Sucesso",
        description: "Configurações atualizadas com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar configurações.",
        variant: "destructive",
      });
    },
  });

  const configureWhatsappMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      const settingsPayload = {
        rejectCall: false,
        msgCall: "",
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        syncFullHistory: false,
        readStatus: false
      };
      
      return await apiRequest(`/api/company/whatsapp/instances/${instanceName}/configure`, "POST", settingsPayload);
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Configurações do WhatsApp aplicadas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company/whatsapp/instances'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao configurar WhatsApp.",
        variant: "destructive",
      });
    },
  });

  if (!company) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p>Carregando informações da empresa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6 ml-16 sm:ml-0">
        <Settings className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Configurações da Empresa</h1>
      </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Empresa
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="company-settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="ai-agent" className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              IA
            </TabsTrigger>
            <TabsTrigger value="asaas" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Mercado Pago
            </TabsTrigger>
          </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Informações da Empresa
              </CardTitle>
              <CardDescription>
                Atualize as informações básicas da sua empresa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="fantasyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Fantasia</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome da empresa" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div>
                      <label className="text-sm font-medium text-gray-500">Documento</label>
                      <Input 
                        value={formatDocument(company.document)} 
                        disabled 
                        className="bg-gray-50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email</label>
                      <Input 
                        value={company.email} 
                        disabled 
                        className="bg-gray-50"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <Input 
                        value="Ativo" 
                        disabled 
                        className="bg-gray-50"
                      />
                    </div>
                  </div>

                  <FormField
                    control={profileForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Endereço completo da empresa"
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="googleMapsLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Link do Google Maps (Opcional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://maps.google.com/..."
                            {...field}
                          />
                        </FormControl>
                        <div className="text-sm text-gray-500">
                          Cole aqui o link do Google Maps da localização da sua empresa
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-6 mt-6">
                    <h3 className="text-lg font-semibold mb-4">Informações de Cursos (Opcional)</h3>

                    <FormField
                      control={profileForm.control}
                      name="coursesDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descrição dos Cursos</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Descreva os cursos oferecidos pela sua empresa..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <div className="text-sm text-gray-500">
                            Informe detalhes sobre os cursos (ex: curso iniciante, avançado, preços, duração, etc.)
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="mt-6 space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Imagens e PDFs dos Cursos</Label>
                        <p className="text-sm text-gray-500 mb-4">
                          Faça upload de imagens e PDFs dos seus cursos
                        </p>
                      </div>

                      {/* Preview dos arquivos */}
                      {courseFiles.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                          {courseFiles.map((file, index) => (
                            <div key={index} className="relative border rounded-lg p-3 bg-gray-50">
                              <button
                                type="button"
                                onClick={() => removeCourseFile(index)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10"
                              >
                                <X className="w-4 h-4" />
                              </button>

                              {file.type === 'image' ? (
                                <div className="space-y-2">
                                  <img
                                    src={file.url}
                                    alt={file.name}
                                    className="w-full h-32 object-cover rounded border"
                                  />
                                  <p className="text-xs text-gray-600 truncate">{file.name}</p>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center h-32 space-y-2">
                                  <div className="bg-red-100 p-3 rounded">
                                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                  <p className="text-xs text-gray-600 truncate w-full text-center">{file.name}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Área de upload */}
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleCourseFileSelect}
                          className="hidden"
                          id="course-file-upload"
                          disabled={uploadingFile}
                        />
                        <label htmlFor="course-file-upload" className="cursor-pointer">
                          <div className="mx-auto flex flex-col items-center">
                            {uploadingFile ? (
                              <>
                                <RefreshCw className="w-8 h-8 text-gray-400 mb-2 animate-spin" />
                                <p className="text-sm font-medium text-gray-700 mb-1">
                                  Enviando arquivo...
                                </p>
                              </>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                <p className="text-sm font-medium text-gray-700 mb-1">
                                  Clique para selecionar imagem ou PDF
                                </p>
                                <p className="text-xs text-gray-500">
                                  Imagens: PNG, JPG, GIF • PDFs até 10MB
                                </p>
                              </>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                    >
                      {updateProfileMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Alterar Senha
              </CardTitle>
              <CardDescription>
                Mantenha sua conta segura atualizando sua senha regularmente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha Atual</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="Digite sua senha atual"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nova Senha</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="Digite sua nova senha"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar Nova Senha</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="Confirme sua nova senha"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updatePasswordMutation.isPending}
                    >
                      {updatePasswordMutation.isPending ? "Alterando..." : "Alterar Senha"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>



        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Preferências do Sistema
              </CardTitle>
              <CardDescription>
                Configure suas preferências de uso do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Notificações por Email</label>
                    <p className="text-sm text-gray-500">Receber notificações importantes por email</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Configurar
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Tema do Sistema</label>
                    <p className="text-sm text-gray-500">Escolha entre modo claro ou escuro</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Claro
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Idioma</label>
                    <p className="text-sm text-gray-500">Idioma da interface do sistema</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Português (BR)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Instâncias do WhatsApp
              </CardTitle>
              <CardDescription>
                Gerencie suas instâncias de WhatsApp para envio de mensagens automáticas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...whatsappForm}>
                <form onSubmit={whatsappForm.handleSubmit(onWhatsappSubmit)} className="space-y-4">
                  <FormField
                    control={whatsappForm.control}
                    name="instanceName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Instância</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: principal" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={whatsappForm.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Telefone</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 5511999999999" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={createInstanceMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {createInstanceMutation.isPending ? "Criando..." : "Criar Instância"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Embedded Signup — fluxo oficial Meta (Login com Facebook) */}
          <MetaEmbeddedSignup
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
            }}
          />

          {/* Conexão manual WhatsApp — método alternativo (entrada manual de token) */}
          <MetaManualConnect
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/company/whatsapp/instances"] });
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notificações de Agendamentos (N8N)
              </CardTitle>
              <CardDescription>
                Receba notificações automáticas via webhook N8N quando houver novos agendamentos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Ativar Notificações N8N</p>
                  <p className="text-sm text-gray-500">Envia dados do agendamento para seu workflow N8N</p>
                </div>
                <Switch
                  checked={company?.n8nWebhookEnabled || false}
                  onCheckedChange={(checked) => {
                    fetch('/api/company/n8n-webhook', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        n8nWebhookEnabled: checked,
                        n8nWebhookUrl: company?.n8nWebhookUrl
                      })
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/company/auth/profile'] });
                      toast({
                        title: checked ? "Notificações ativadas" : "Notificações desativadas",
                        description: checked
                          ? "Agendamentos serão enviados ao N8N"
                          : "Notificações N8N foram desativadas"
                      });
                    }).catch(err => {
                      console.error('Erro ao atualizar webhook n8n');
                      toast({
                        title: "Erro",
                        description: "Falha ao atualizar configuração",
                        variant: "destructive"
                      });
                    });
                  }}
                />
              </div>

              {company?.n8nWebhookEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="n8n-webhook-url">URL do Webhook N8N</Label>
                  <Input
                    id="n8n-webhook-url"
                    type="url"
                    placeholder="https://seu-n8n.com/webhook/agendamentos"
                    defaultValue={company?.n8nWebhookUrl || ''}
                    key={company?.n8nWebhookUrl || 'empty'}
                    onBlur={(e) => {
                      const newValue = e.target.value.trim();
                      if (newValue === (company?.n8nWebhookUrl || '')) return;
                      fetch('/api/company/n8n-webhook', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          n8nWebhookUrl: newValue,
                          n8nWebhookEnabled: company.n8nWebhookEnabled
                        })
                      }).then(async (res) => {
                        if (res.ok) {
                          queryClient.invalidateQueries({ queryKey: ['/api/company/auth/profile'] });
                          toast({ title: "URL salva!", description: "Webhook N8N atualizado com sucesso" });
                        } else {
                          const data = await res.json();
                          toast({ title: "Erro", description: data.message || "URL inválida", variant: "destructive" });
                        }
                      }).catch(err => {
                        console.error('Erro ao atualizar webhook n8n');
                        toast({ title: "Erro", description: "Falha ao salvar URL", variant: "destructive" });
                      });
                    }}
                  />
                  <p className="text-xs text-gray-500">
                    Cole a URL e clique fora do campo para salvar. Exemplo: https://seu-n8n.com/webhook/agendamentos
                  </p>

                  {company?.n8nWebhookUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        fetch('/api/company/n8n-webhook/test', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                        }).then(async (res) => {
                          if (res.ok) {
                            toast({
                              title: "Teste enviado!",
                              description: "Verifique se a notificação chegou no N8N",
                            });
                          } else {
                            const data = await res.json();
                            toast({
                              title: "Erro ao enviar teste",
                              description: data.message || "Falha ao enviar webhook de teste",
                              variant: "destructive"
                            });
                          }
                        }).catch(err => {
                          console.error('Erro ao testar webhook');
                          toast({
                            title: "Erro",
                            description: "Falha ao enviar teste",
                            variant: "destructive"
                          });
                        });
                      }}
                      className="w-full"
                    >
                      <Bell className="w-4 h-4 mr-2" />
                      Enviar Teste de Webhook
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chatwoot Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Integração Chatwoot
              </CardTitle>
              <CardDescription>
                Conecte o Chatwoot como canal de atendimento. Sua IA responderá automaticamente e agentes humanos podem assumir quando necessário.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Ativar Chatwoot</p>
                  <p className="text-sm text-gray-500">Integra mensagens do Chatwoot com sua IA</p>
                </div>
                <Switch
                  checked={!!company?.chatwootEnabled}
                  onCheckedChange={(checked) => {
                    fetch('/api/company/chatwoot-config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chatwootEnabled: checked,
                        chatwootBaseUrl: company?.chatwootBaseUrl,
                        chatwootApiToken: company?.chatwootApiToken,
                        chatwootAccountId: company?.chatwootAccountId,
                        chatwootInboxId: company?.chatwootInboxId,
                      })
                    }).then((res) => {
                      if (!res.ok) throw new Error('Falha ao atualizar');
                      queryClient.invalidateQueries({ queryKey: ['/api/company/auth/profile'] });
                      toast({
                        title: checked ? "Chatwoot ativado" : "Chatwoot desativado",
                        description: checked
                          ? "Mensagens do Chatwoot serão processadas pela IA"
                          : "Integração com Chatwoot desativada"
                      });
                    }).catch(() => {
                      toast({ title: "Erro", description: "Falha ao atualizar configuração", variant: "destructive" });
                    });
                  }}
                />
              </div>

              {!!company?.chatwootEnabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="chatwoot-base-url">URL do Chatwoot</Label>
                    <Input
                      id="chatwoot-base-url"
                      type="url"
                      placeholder="https://app.chatwoot.com"
                      defaultValue={company?.chatwootBaseUrl || ''}
                      key={`cw-url-${company?.chatwootBaseUrl || 'empty'}`}
                      onBlur={(e) => {
                        const newValue = e.target.value.trim();
                        if (newValue === (company?.chatwootBaseUrl || '')) return;
                        fetch('/api/company/chatwoot-config', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            chatwootEnabled: true,
                            chatwootBaseUrl: newValue,
                            chatwootApiToken: company?.chatwootApiToken,
                            chatwootAccountId: company?.chatwootAccountId,
                            chatwootInboxId: company?.chatwootInboxId,
                          })
                        }).then(async (res) => {
                          if (res.ok) {
                            queryClient.invalidateQueries({ queryKey: ['/api/company/auth/profile'] });
                            toast({ title: "URL salva!", description: "URL do Chatwoot atualizada" });
                          } else {
                            const data = await res.json();
                            toast({ title: "Erro", description: data.message || "URL inválida", variant: "destructive" });
                          }
                        }).catch(() => {
                          toast({ title: "Erro", description: "Falha ao salvar URL", variant: "destructive" });
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">URL base da sua instalação Chatwoot</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="chatwoot-api-token">API Access Token</Label>
                    <Input
                      id="chatwoot-api-token"
                      type="password"
                      placeholder="Seu token de API do Chatwoot"
                      defaultValue={company?.chatwootApiToken || ''}
                      key={`cw-token-${company?.chatwootApiToken ? 'set' : 'empty'}`}
                      onBlur={(e) => {
                        const newValue = e.target.value.trim();
                        if (newValue === (company?.chatwootApiToken || '')) return;
                        fetch('/api/company/chatwoot-config', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            chatwootEnabled: true,
                            chatwootBaseUrl: company?.chatwootBaseUrl,
                            chatwootApiToken: newValue,
                            chatwootAccountId: company?.chatwootAccountId,
                            chatwootInboxId: company?.chatwootInboxId,
                          })
                        }).then(async (res) => {
                          if (res.ok) {
                            queryClient.invalidateQueries({ queryKey: ['/api/company/auth/profile'] });
                            toast({ title: "Token salvo!", description: "API Token do Chatwoot atualizado" });
                          } else {
                            const data = await res.json();
                            toast({ title: "Erro", description: data.message || "Token inválido", variant: "destructive" });
                          }
                        }).catch(() => {
                          toast({ title: "Erro", description: "Falha ao salvar token", variant: "destructive" });
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">Settings → Account Settings → Access Token</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="chatwoot-account-id">Account ID</Label>
                      <Input
                        id="chatwoot-account-id"
                        type="number"
                        placeholder="1"
                        defaultValue={company?.chatwootAccountId || ''}
                        key={`cw-acc-${company?.chatwootAccountId || 'empty'}`}
                        onBlur={(e) => {
                          const newValue = e.target.value.trim();
                          const numValue = newValue ? parseInt(newValue) : null;
                          if (numValue === (company?.chatwootAccountId || null)) return;
                          fetch('/api/company/chatwoot-config', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              chatwootEnabled: true,
                              chatwootBaseUrl: company?.chatwootBaseUrl,
                              chatwootApiToken: company?.chatwootApiToken,
                              chatwootAccountId: numValue,
                              chatwootInboxId: company?.chatwootInboxId,
                            })
                          }).then(async (res) => {
                            if (res.ok) {
                              queryClient.invalidateQueries({ queryKey: ['/api/company/auth/profile'] });
                              toast({ title: "Salvo!", description: "Account ID atualizado" });
                            } else {
                              const data = await res.json();
                              toast({ title: "Erro", description: data.message || "Valor inválido", variant: "destructive" });
                            }
                          }).catch(() => {
                            toast({ title: "Erro", description: "Falha ao salvar", variant: "destructive" });
                          });
                        }}
                      />
                      <p className="text-xs text-gray-500">Número na URL: /accounts/{'{ID}'}/...</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="chatwoot-inbox-id">Inbox ID</Label>
                      <Input
                        id="chatwoot-inbox-id"
                        type="number"
                        placeholder="1"
                        defaultValue={company?.chatwootInboxId || ''}
                        key={`cw-inbox-${company?.chatwootInboxId || 'empty'}`}
                        onBlur={(e) => {
                          const newValue = e.target.value.trim();
                          const numValue = newValue ? parseInt(newValue) : null;
                          if (numValue === (company?.chatwootInboxId || null)) return;
                          fetch('/api/company/chatwoot-config', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              chatwootEnabled: true,
                              chatwootBaseUrl: company?.chatwootBaseUrl,
                              chatwootApiToken: company?.chatwootApiToken,
                              chatwootAccountId: company?.chatwootAccountId,
                              chatwootInboxId: numValue,
                            })
                          }).then(async (res) => {
                            if (res.ok) {
                              queryClient.invalidateQueries({ queryKey: ['/api/company/auth/profile'] });
                              toast({ title: "Salvo!", description: "Inbox ID atualizado" });
                            } else {
                              const data = await res.json();
                              toast({ title: "Erro", description: data.message || "Valor inválido", variant: "destructive" });
                            }
                          }).catch(() => {
                            toast({ title: "Erro", description: "Falha ao salvar", variant: "destructive" });
                          });
                        }}
                      />
                      <p className="text-xs text-gray-500">Settings → Inboxes → ID do canal WhatsApp</p>
                    </div>
                  </div>

                  {company?.chatwootBaseUrl && company?.chatwootApiToken && company?.chatwootAccountId && (
                    <div className="space-y-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          fetch('/api/company/chatwoot-config/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                          }).then(async (res) => {
                            const data = await res.json();
                            if (res.ok) {
                              toast({
                                title: "Conexão OK!",
                                description: data.message,
                              });
                            } else {
                              toast({
                                title: "Falha na conexão",
                                description: data.message || "Não foi possível conectar ao Chatwoot",
                                variant: "destructive"
                              });
                            }
                          }).catch(() => {
                            toast({ title: "Erro", description: "Falha ao testar conexão", variant: "destructive" });
                          });
                        }}
                        className="w-full"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Testar Conexão
                      </Button>

                      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-xs text-blue-800 dark:text-blue-200 space-y-1">
                        <p className="font-medium">Configuração do Webhook no Chatwoot:</p>
                        <p>Settings → Integrations → Webhooks → Add Webhook</p>
                        <p className="font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                          URL: {window.location.origin}/api/webhook/chatwoot
                        </p>
                        <p>Events: message_created, conversation_updated</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Instâncias Configuradas</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/company/whatsapp/instances'] });
                    whatsappInstances.forEach(instance => {
                      refreshInstanceStatus(instance.instanceName);
                    });
                  }}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Atualizar Status
                </Button>
              </CardTitle>
              <CardDescription>
                Lista de todas as instâncias WhatsApp configuradas para sua empresa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingInstances ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 bg-gray-200 rounded-lg"></div>
                    </div>
                  ))}
                </div>
              ) : whatsappInstances.length > 0 ? (
                <div className="space-y-4">
                  {whatsappInstances.map((instance: any) => {
                    const isConnected = instance.status === "connected" || instance.status === "open";
                    const isConnecting = instance.status === "connecting";
                    
                    return (
                      <div key={instance.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="font-medium">{instance.instanceName}</h3>
                              <Badge 
                                variant={isConnected ? "default" : isConnecting ? "secondary" : "outline"}
                                className={isConnected ? "bg-green-600" : isConnecting ? "bg-yellow-500" : ""}
                              >
                                {isConnected ? "Conectado" : isConnecting ? "Conectando..." : "Desconectado"}
                              </Badge>
                            </div>

                            {instance.webhook && (
                              <p className="text-xs text-blue-600 mt-1">
                                Webhook: {instance.webhook}
                              </p>
                            )}

                            <p className="text-xs text-gray-500 mt-1">
                              Status: {instance.status || 'desconhecido'} | Última atualização: {instance.updatedAt ? new Date(instance.updatedAt).toLocaleString('pt-BR') : 'N/A'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => refreshInstanceStatus(instance.instanceName)}
                                className="flex items-center gap-2"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Verificar
                              </Button>
                              
                              {!isConnected && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedInstance(instance);
                                    getQrCodeMutation.mutate(instance.instanceName);
                                  }}
                                  disabled={getQrCodeMutation.isPending}
                                  className="flex items-center gap-2"
                                >
                                  <QrCode className="w-4 h-4" />
                                  {getQrCodeMutation.isPending ? "Gerando..." : "Gerar QR Code"}
                                </Button>
                              )}
                              
                              {isConnected && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // Add disconnect functionality
                                    fetch(`/api/company/whatsapp/instances/${instance.instanceName}/disconnect`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' }
                                    }).then(() => {
                                      queryClient.invalidateQueries({ queryKey: ['/api/company/whatsapp/instances'] });
                                      refreshInstanceStatus(instance.instanceName);
                                    });
                                  }}
                                  className="flex items-center gap-2 text-red-600 hover:text-red-700"
                                >
                                  <LogOut className="w-4 h-4" />
                                  Desconectar
                                </Button>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedInstance(instance);
                                  setShowWebhookDialog(true);
                                }}
                                className="flex items-center gap-2"
                              >
                                <Bot className="w-4 h-4" />
                                Configurar IA
                              </Button>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => configureWhatsappMutation.mutate(instance.instanceName)}
                                disabled={configureWhatsappMutation.isPending}
                                className="flex items-center gap-2"
                              >
                                <Settings className="w-4 h-4" />
                                {configureWhatsappMutation.isPending ? "Configurando..." : "Configurar WhatsApp"}
                              </Button>
                              
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteInstanceMutation.mutate(instance.id)}
                                disabled={deleteInstanceMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed">
                  <Smartphone className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">Nenhuma instância configurada</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Crie sua primeira instância WhatsApp para começar a enviar mensagens
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="company-settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Logo da Empresa
              </CardTitle>
              <CardDescription>
                Defina a logo personalizada da sua empresa que será exibida no menu lateral do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...companySettingsForm}>
                <form onSubmit={companySettingsForm.handleSubmit(onCompanySettingsSubmit)} className="space-y-6">
                  <FormField
                    control={companySettingsForm.control}
                    name="logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logo da Empresa</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            {/* Preview do logo atual */}
                            {(logoPreview || field.value) && (
                              <div className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
                                <div className="relative">
                                  <img
                                    src={logoPreview || field.value || ""}
                                    alt="Logo atual"
                                    className="h-12 w-auto max-w-[150px] object-contain rounded border bg-white px-2"
                                  />
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={removeCompanyLogo}
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
                                ref={logoInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleLogoFileSelect}
                                className="hidden"
                                id="company-logo-upload"
                              />
                              <label htmlFor="company-logo-upload" className="cursor-pointer">
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
                                placeholder="https://exemplo.com/sua-logo.png"
                                {...field}
                                className="text-sm"
                              />
                            </div>

                            <div className="text-sm text-gray-500">
                              <p>• A logo será exibida no menu lateral do sistema</p>
                              <p>• Caso não definida, será utilizada a logo padrão do sistema</p>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateCompanySettingsMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateCompanySettingsMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Configurações"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Cor Principal da Empresa
              </CardTitle>
              <CardDescription>
                Defina a cor principal da sua empresa. Essa cor será utilizada em elementos visuais personalizados do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...companySettingsForm}>
                <form onSubmit={companySettingsForm.handleSubmit(onCompanySettingsSubmit)} className="space-y-6">
                  <FormField
                    control={companySettingsForm.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor Principal</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <input
                                  type="color"
                                  value={field.value || "#2563eb"}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  className="w-12 h-12 rounded-lg border cursor-pointer"
                                />
                              </div>
                              <div className="flex-1">
                                <Input
                                  placeholder="#2563eb"
                                  value={field.value || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || /^#[0-9a-fA-F]{0,6}$/.test(val)) {
                                      field.onChange(val);
                                    }
                                  }}
                                  className="font-mono text-sm"
                                  maxLength={7}
                                />
                              </div>
                              {field.value && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => field.onChange("")}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Limpar
                                </Button>
                              )}
                            </div>

                            {field.value && /^#[0-9a-fA-F]{6}$/.test(field.value) && (
                              <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
                                <div
                                  className="w-8 h-8 rounded-full border"
                                  style={{ backgroundColor: field.value }}
                                />
                                <span className="text-sm text-gray-600">
                                  Preview: <strong>{field.value}</strong>
                                </span>
                              </div>
                            )}

                            <div className="text-sm text-gray-500">
                              <p>Caso não definida, será utilizada a cor padrão do sistema.</p>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateCompanySettingsMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateCompanySettingsMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Cor"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                Mensagem de Aniversário
              </CardTitle>
              <CardDescription>
                Configure a mensagem personalizada que será enviada aos seus clientes no aniversário deles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...companySettingsForm}>
                <form onSubmit={companySettingsForm.handleSubmit(onCompanySettingsSubmit)} className="space-y-6">
                  <FormField
                    control={companySettingsForm.control}
                    name="birthdayMessage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mensagem de Aniversário</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Exemplo: Olá {NOME}! A equipe da {EMPRESA} deseja um feliz aniversário! 🎉🎂 Que este novo ano de vida seja repleto de alegrias e conquistas!"
                            className="min-h-[120px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <div className="text-sm text-gray-500">
                          <p>• Use <code className="bg-gray-100 px-1 rounded">{"{NOME}"}</code> para inserir o nome do cliente</p>
                          <p>• Use <code className="bg-gray-100 px-1 rounded">{"{EMPRESA}"}</code> para inserir o nome da sua empresa</p>
                          <p>• A mensagem será enviada automaticamente via WhatsApp no aniversário</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateCompanySettingsMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateCompanySettingsMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Configurações"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-agent" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Configuração do Agente IA
              </CardTitle>
              <CardDescription>
                Configure o prompt personalizado para o agente de IA da sua empresa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...aiAgentForm}>
                <form onSubmit={aiAgentForm.handleSubmit(onAiAgentSubmit)} className="space-y-6">
                  <FormField
                    control={aiAgentForm.control}
                    name="aiAgentPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prompt do Agente IA</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Exemplo: Você é um assistente virtual especializado em atendimento ao cliente para uma empresa de tecnologia. Sempre seja educado, profissional e forneça respostas precisas sobre nossos produtos e serviços..."
                            className="min-h-[200px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <div className="text-sm text-gray-500">
                          <p>• O prompt deve descrever como o agente IA deve se comportar</p>
                          <p>• Inclua informações sobre sua empresa, produtos ou serviços</p>
                          <p>• Defina o tom de voz e estilo de comunicação desejado</p>
                          <p>• Mínimo de 10 caracteres</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={aiAgentForm.control}
                    name="agentInactivityTimeout"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tempo de Inatividade do Agente</FormLabel>
                        <FormControl>
                          <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={String(Number(field.value) || 30)}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          >
                            <option value="30">30 minutos</option>
                            <option value="60">1 hora</option>
                            <option value="120">2 horas</option>
                            <option value="180">3 horas</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                        <div className="text-sm text-gray-500">
                          <p>• Define quanto tempo o agente IA ficará inativo após um humano responder</p>
                          <p>• Após esse período sem mensagens humanas, o agente volta a atender automaticamente</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={aiAgentForm.control}
                    name="autoSelectProfessional"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Seleção Automática de Profissional
                          </FormLabel>
                          <div className="text-sm text-gray-500">
                            Quando há apenas um profissional ativo, o agente agendará automaticamente sem perguntar
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Configurações OpenAI */}
                  <div className="border-t pt-6 space-y-4">
                    <h3 className="text-lg font-semibold">Configurações OpenAI</h3>

                    <FormField
                      control={aiAgentForm.control}
                      name="openaiApiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chave da API OpenAI</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder={company?.hasOpenaiApiKey ? "••••••••• (chave já configurada - deixe vazio para manter)" : "sk-..."}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                          <div className="text-sm text-gray-500">
                            Obtenha sua chave em: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://platform.openai.com/api-keys</a>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={aiAgentForm.control}
                      name="openaiModel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center justify-between">
                            <span>Modelo</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={fetchModels}
                              disabled={fetchingModels || isLoadingModels}
                              className="h-6 px-2 text-xs"
                            >
                              {fetchingModels || isLoadingModels ? "Carregando..." : "Carregar Modelos"}
                            </Button>
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o modelo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {openaiModels?.models && openaiModels.models.length > 0 ? (
                                openaiModels.models.map((model: any) => (
                                  <SelectItem key={model.id} value={model.id}>
                                    {model.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <>
                                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Rápido e Econômico)</SelectItem>
                                  <SelectItem value="gpt-4o">GPT-4o (Mais Inteligente)</SelectItem>
                                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          {openaiModels?.models && openaiModels.models.length > 0 && (
                            <p className="text-xs text-green-600">
                              {openaiModels.models.length} modelos carregados da OpenAI API
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={aiAgentForm.control}
                        name="openaiTemperature"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Temperatura (0.0 - 2.0)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="2"
                                {...field}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  field.onChange(isNaN(value) ? 0 : value);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              Controla a criatividade das respostas
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={aiAgentForm.control}
                        name="openaiMaxTokens"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Máximo de Tokens</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="10"
                                min="100"
                                max="8000"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              Limite de caracteres nas respostas
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Botões de controle do agente IA */}
                  <div className="border-t pt-4 space-y-4">
                    {/* Botão para pausar atendimento */}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => pauseAgentMutation.mutate()}
                        disabled={pauseAgentMutation.isPending}
                        className="w-full sm:w-auto"
                      >
                        {pauseAgentMutation.isPending ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Pausando...
                          </>
                        ) : (
                          <>
                            <PauseCircle className="w-4 h-4 mr-2" />
                            Pausar Atendimento
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-gray-500 mt-2">
                        Clique para pausar o agente IA. Ele não responderá mensagens até ser retomado.
                      </p>
                    </div>

                    {/* Botão para retomar atendimento */}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => resumeAgentMutation.mutate()}
                        disabled={resumeAgentMutation.isPending}
                        className="w-full sm:w-auto"
                      >
                        {resumeAgentMutation.isPending ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Retomando...
                          </>
                        ) : (
                          <>
                            <Bot className="w-4 h-4 mr-2" />
                            Retomar Atendimento
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-gray-500 mt-2">
                        Clique para forçar o agente IA a voltar a responder imediatamente, mesmo durante o período de inatividade.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateAiAgentMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateAiAgentMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Configurações"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Solicitação de Atendimento Humano
              </CardTitle>
              <CardDescription>
                Configure o sistema de solicitação de atendimento humano via palavras-chave
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...humanRequestForm}>
                <form onSubmit={humanRequestForm.handleSubmit(onHumanRequestSubmit)} className="space-y-4">
                  <FormField
                    control={humanRequestForm.control}
                    name="humanRequestEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Ativar Solicitação de Atendimento Humano
                          </FormLabel>
                          <div className="text-sm text-gray-500">
                            Permite que clientes solicitem atendimento humano através de palavras-chave
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {humanRequestForm.watch("humanRequestEnabled") && (
                    <>
                      <FormField
                        control={humanRequestForm.control}
                        name="humanRequestContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número ou Grupo WhatsApp para Notificação</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ex: 120363404730378309@g.us ou 5511999999999"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>• Para grupo: cole o ID do grupo (ex: 120363404730378309@g.us)</p>
                              <p>• Para número: use formato internacional (ex: 5511999999999)</p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={humanRequestForm.control}
                        name="humanRequestMessage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mensagem de Notificação</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Ex: Olá! Um cliente está solicitando atendimento humano..."
                                rows={4}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>Variáveis disponíveis:</p>
                              <p>• {"{clientName}"} - Nome do cliente</p>
                              <p>• {"{clientPhone}"} - Telefone do cliente</p>
                              <p>• {"{time}"} - Horário da solicitação</p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={humanRequestForm.control}
                        name="humanRequestKeywords"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Palavras-chave (uma por linha)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="falar com humano&#10;falar com atendente&#10;quero falar com alguém&#10;atendimento humano"
                                rows={5}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>Digite uma palavra-chave ou frase por linha</p>
                              <p>Quando o cliente enviar uma mensagem contendo essas palavras, o sistema:</p>
                              <p>• IA responde normalmente à solicitação</p>
                              <p>• Pausa a IA automaticamente após responder</p>
                              <p>• Envia notificação para o grupo/número configurado</p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={humanRequestForm.control}
                        name="humanRequestTimeout"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tempo de Inatividade do Atendimento Humano</FormLabel>
                            <FormControl>
                              <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={field.value ?? 30}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              >
                                <option value={0}>Sem pausa (IA continua respondendo)</option>
                                <option value={10}>10 minutos</option>
                                <option value={20}>20 minutos</option>
                                <option value={30}>30 minutos</option>
                                <option value={60}>1 hora</option>
                              </select>
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>• Tempo que a IA ficará pausada após solicitar atendimento humano</p>
                              <p>• Após esse período sem mensagens humanas, a IA voltará a responder</p>
                              <p>• "Sem pausa": IA continua respondendo normalmente, apenas envia notificação ao atendente</p>
                            </div>
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateHumanRequestMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateHumanRequestMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Configurações"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5" />
                Notificação de Interesse em Cursos
              </CardTitle>
              <CardDescription>
                Configure o sistema de notificação quando clientes demonstrarem interesse em cursos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...courseNotificationForm}>
                <form onSubmit={courseNotificationForm.handleSubmit(onCourseNotificationSubmit)} className="space-y-4">
                  <FormField
                    control={courseNotificationForm.control}
                    name="courseNotificationEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Ativar Notificação de Cursos
                          </FormLabel>
                          <div className="text-sm text-gray-500">
                            Envia notificação quando cliente mencionar palavras-chave relacionadas a cursos
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {courseNotificationForm.watch("courseNotificationEnabled") && (
                    <>
                      <FormField
                        control={courseNotificationForm.control}
                        name="courseNotificationContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número ou Grupo WhatsApp para Notificação</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ex: 120363404730378309@g.us ou 5511999999999"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>• Para grupo: cole o ID do grupo (ex: 120363404730378309@g.us)</p>
                              <p>• Para número: use formato internacional (ex: 5511999999999)</p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={courseNotificationForm.control}
                        name="courseNotificationMessage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mensagem de Notificação</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Ex: 🎓 Interesse em Curso Detectado!&#10;&#10;👤 Cliente: {clientName}&#10;📞 Telefone: {clientPhone}&#10;💬 Mensagem: {message}&#10;⏰ Horário: {time}"
                                rows={6}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>Variáveis disponíveis:</p>
                              <p>• {"{clientName}"} - Nome do cliente</p>
                              <p>• {"{clientPhone}"} - Telefone do cliente</p>
                              <p>• {"{message}"} - Mensagem enviada pelo cliente</p>
                              <p>• {"{time}"} - Horário da mensagem</p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={courseNotificationForm.control}
                        name="courseNotificationKeywords"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Palavras-chave (uma por linha)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="curso&#10;cursos&#10;formação&#10;capacitação&#10;treinamento&#10;aula&#10;aulas"
                                rows={5}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>Digite uma palavra-chave ou frase por linha</p>
                              <p>Quando o cliente enviar uma mensagem contendo essas palavras, uma notificação será enviada.</p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={courseNotificationForm.control}
                        name="courseNotificationTimeout"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tempo de Inatividade do Atendimento</FormLabel>
                            <FormControl>
                              <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={field.value ?? 30}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              >
                                <option value={0}>Não pausar IA (apenas notificar)</option>
                                <option value={30}>30 minutos</option>
                                <option value={60}>1 hora</option>
                                <option value={120}>2 horas</option>
                                <option value={360}>6 horas</option>
                              </select>
                            </FormControl>
                            <FormMessage />
                            <div className="text-sm text-gray-500">
                              <p>Após detectar uma palavra-chave de curso:</p>
                              <p>• Se "Não pausar IA": apenas envia notificação, IA continua respondendo</p>
                              <p>• Se definir tempo: IA pausa e aguarda atendimento humano pelo período selecionado</p>
                            </div>
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateCourseNotificationMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateCourseNotificationMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Configurações"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneOff className="w-5 h-5" />
                Números Ignorados pelo Agente
              </CardTitle>
              <CardDescription>
                Configure números de telefone que o agente IA deve ignorar completamente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...ignoredNumbersForm}>
                <form onSubmit={ignoredNumbersForm.handleSubmit(handleAddNumbers)} className="space-y-6">
                  {/* Display saved numbers as badges */}
                  {getSavedNumbersList().length > 0 && (
                    <div className="space-y-2">
                      <FormLabel>Números Salvos</FormLabel>
                      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-md border">
                        {getSavedNumbersList().map((number) => (
                          <Badge
                            key={number}
                            variant="secondary"
                            className="px-3 py-1.5 text-sm flex items-center gap-2"
                          >
                            <span>{number}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveNumber(number)}
                              className="hover:text-destructive transition-colors"
                              aria-label={`Remover número ${number}`}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <FormField
                    control={ignoredNumbersForm.control}
                    name="ignoredNumbers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Adicionar Números para Ignorar</FormLabel>
                        <FormControl>
                          <textarea
                            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                            placeholder="Digite um número por linha&#10;Exemplo:&#10;5581999999999&#10;5511888888888"
                            value={field.value || ""}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                        <div className="text-sm text-gray-500">
                          <p>• Digite um número de telefone por linha</p>
                          <p>• Números devem estar com DDI (código do país)</p>
                          <p>• Exemplo: 5581999999999 (55 = Brasil, 81 = DDD, número)</p>
                          <p>• O agente não responderá mensagens destes números</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateIgnoredNumbersMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateIgnoredNumbersMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Adicionando...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar Números
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Testar Agente IA
              </CardTitle>
              <CardDescription>
                Teste seu agente IA para verificar como ele responde com o prompt configurado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {company?.aiAgentPrompt ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mensagem de teste</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Digite uma mensagem para testar o agente..."
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && testAgentMutation.mutate()}
                      />
                      <Button 
                        onClick={() => testAgentMutation.mutate()}
                        disabled={testAgentMutation.isPending || !testMessage.trim()}
                        className="min-w-[100px]"
                      >
                        {testAgentMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          "Testar"
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {agentResponse && (
                    <div className="bg-gray-50 p-4 rounded-lg border">
                      <div className="text-sm font-medium text-gray-700 mb-2">Resposta do Agente:</div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">{agentResponse}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center p-6 bg-gray-50 rounded-lg border border-dashed">
                  <Bot className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-2">Nenhum prompt configurado</p>
                  <p className="text-sm text-gray-500">Configure um prompt acima para testar o agente IA</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Importantes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">Como funciona o Agente IA</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• O agente utiliza as configurações globais de IA definidas pelo administrador</li>
                  <li>• Seu prompt personalizado será usado em todas as conversas</li>
                  <li>• As respostas são geradas com base no modelo de IA configurado</li>
                  <li>• O agente pode ser integrado com WhatsApp e outros canais</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <h4 className="font-semibold text-amber-900 mb-2">Dicas para um bom prompt</h4>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Seja específico sobre o papel do agente</li>
                  <li>• Inclua instruções sobre como lidar com diferentes situações</li>
                  <li>• Defina limites e diretrizes de comunicação</li>
                  <li>• Teste diferentes versões para otimizar as respostas</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="birthdays" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-600" />
                Mensagens de Aniversário
              </CardTitle>
              <CardDescription>
                Envie mensagens automáticas para clientes no dia do aniversário
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
                <h4 className="font-semibold text-pink-900 mb-3">Mensagem Personalizada</h4>
                <Form {...birthdayForm}>
                  <form onSubmit={birthdayForm.handleSubmit(onBirthdayMessageSubmit)} className="space-y-4">
                    <FormField
                      control={birthdayForm.control}
                      name="messageTemplate"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              placeholder="Digite sua mensagem de aniversário personalizada..."
                              className="min-h-[120px] bg-white"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-sm text-pink-700">
                      Use <strong>{"{NOME}"}</strong> para o nome do cliente e <strong>{"{EMPRESA}"}</strong> para o nome da empresa
                    </p>
                    <div className="flex gap-3">
                      <Button 
                        type="submit" 
                        size="sm" 
                        className="bg-pink-600 hover:bg-pink-700"
                        disabled={createBirthdayMessageMutation.isPending}
                      >
                        <Gift className="w-4 h-4 mr-2" />
                        {createBirthdayMessageMutation.isPending ? "Salvando..." : "Salvar Mensagem"}
                      </Button>
                    </div>
                    
                    {/* Test section */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
                      <h5 className="font-medium text-gray-900 mb-3">Testar Mensagem</h5>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Digite o número para teste (ex: 5511999999999)"
                          value={testPhoneNumber}
                          onChange={(e) => setTestPhoneNumber(e.target.value)}
                          className="flex-1"
                        />
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="outline"
                          onClick={() => testBirthdayMessageMutation.mutate()}
                          disabled={testBirthdayMessageMutation.isPending || !testPhoneNumber.trim()}
                        >
                          {testBirthdayMessageMutation.isPending ? "Enviando..." : "Enviar Teste"}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        A mensagem será enviada via WhatsApp para o número informado
                      </p>
                    </div>
                  </form>
                </Form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Gift className="w-5 h-5 text-pink-600" />
                      Aniversariantes de Hoje
                      <Badge variant="secondary" className="bg-pink-100 text-pink-700">
                        {clients.filter(client => {
                          if (!client.birthDate) return false;
                          const today = new Date();
                          const todayMonth = today.getMonth() + 1; // 1-12
                          const todayDay = today.getDate();
                          
                          // Extract date components directly from ISO string
                          const dateString = client.birthDate.toString();
                          if (dateString.includes('T')) {
                            const datePart = dateString.split('T')[0];
                            const [year, month, day] = datePart.split('-').map(Number);
                            return month === todayMonth && day === todayDay;
                          }
                          return false;
                        }).length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {clients.filter(client => {
                      if (!client.birthDate) return false;
                      const today = new Date();
                      const todayMonth = today.getMonth() + 1; // 1-12
                      const todayDay = today.getDate();
                      
                      // Extract date components directly from ISO string
                      const dateString = client.birthDate.toString();
                      if (dateString.includes('T')) {
                        const datePart = dateString.split('T')[0];
                        const [year, month, day] = datePart.split('-').map(Number);
                        return month === todayMonth && day === todayDay;
                      }
                      return false;
                    }).length > 0 ? (
                      <div className="space-y-3">
                        {clients.filter(client => {
                          if (!client.birthDate) return false;
                          const today = new Date();
                          const todayMonth = today.getMonth() + 1; // 1-12
                          const todayDay = today.getDate();
                          
                          // Extract date components directly from ISO string
                          const dateString = client.birthDate.toString();
                          if (dateString.includes('T')) {
                            const datePart = dateString.split('T')[0];
                            const [year, month, day] = datePart.split('-').map(Number);
                            return month === todayMonth && day === todayDay;
                          }
                          return false;
                        }).map(client => (
                          <div key={client.id} className="bg-pink-50 p-3 rounded-lg border border-pink-200">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium text-pink-900">{client.name}</p>
                                <p className="text-sm text-pink-600">{client.phone || 'Sem telefone'}</p>
                              </div>
                              <Button 
                                size="sm" 
                                className="bg-pink-600 hover:bg-pink-700"
                                onClick={() => sendBirthdayMessageMutation.mutate(client.id)}
                                disabled={sendBirthdayMessageMutation.isPending}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-gray-600">Nenhum aniversariante hoje</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Aniversariantes do Mês
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                        {clients.filter(client => {
                          if (!client.birthDate) return false;
                          const today = new Date();
                          const todayMonth = today.getMonth() + 1; // 1-12
                          
                          // Extract date components directly from ISO string
                          const dateString = client.birthDate.toString();
                          if (dateString.includes('T')) {
                            const datePart = dateString.split('T')[0];
                            const [year, month, day] = datePart.split('-').map(Number);
                            return month === todayMonth;
                          }
                          return false;
                        }).length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {clients.filter(client => {
                      if (!client.birthDate) return false;
                      const today = new Date();
                      const todayMonth = today.getMonth() + 1; // 1-12
                      
                      // Extract date components directly from ISO string
                      const dateString = client.birthDate.toString();
                      if (dateString.includes('T')) {
                        const datePart = dateString.split('T')[0];
                        const [year, month, day] = datePart.split('-').map(Number);
                        return month === todayMonth;
                      }
                      return false;
                    }).length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {clients.filter(client => {
                          if (!client.birthDate) return false;
                          const today = new Date();
                          const todayMonth = today.getMonth() + 1; // 1-12
                          
                          // Extract date components directly from ISO string
                          const dateString = client.birthDate.toString();
                          if (dateString.includes('T')) {
                            const datePart = dateString.split('T')[0];
                            const [year, month, day] = datePart.split('-').map(Number);
                            return month === todayMonth;
                          }
                          return false;
                        }).map(client => {
                          // Extract date for display
                          const dateString = client.birthDate!.toString();
                          let displayDate = '';
                          let isToday = false;
                          if (dateString.includes('T')) {
                            const datePart = dateString.split('T')[0];
                            const [year, month, day] = datePart.split('-').map(Number);
                            displayDate = `${day.toString().padStart(2, '0')} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][month - 1]}`;
                            
                            // Check if it's today
                            const today = new Date();
                            const todayMonth = today.getMonth() + 1;
                            const todayDay = today.getDate();
                            isToday = month === todayMonth && day === todayDay;
                          }
                          return (
                            <div key={client.id} className={`p-2 rounded border ${isToday ? 'bg-pink-50 border-pink-200' : 'bg-blue-50 border-blue-200'}`}>
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className={`font-medium ${isToday ? 'text-pink-900' : 'text-blue-900'}`}>{client.name}</p>
                                  <p className={`text-sm ${isToday ? 'text-pink-600' : 'text-blue-600'}`}>
                                    {displayDate}
                                    {isToday && ' - Hoje!'}
                                  </p>
                                </div>
                                <div className={`w-2 h-2 rounded-full ${isToday ? 'bg-pink-500' : 'bg-blue-500'}`}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-gray-600">Nenhum aniversariante este mês</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <Calendar className="w-5 h-5" />
                    Histórico de Aniversários
                  </CardTitle>
                  <CardDescription>
                    Mensagens de aniversário enviadas recentemente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {birthdayHistory.length > 0 ? (
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {(birthdayHistory as any[]).map((history: any) => (
                        <div key={history.id} className="bg-green-50 p-3 rounded-lg border border-green-200">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium text-green-900">{history.clientName}</p>
                              <p className="text-sm text-green-600">{history.clientPhone}</p>
                              <p className="text-xs text-green-500 mt-1">
                                Enviado em {new Date(history.sentAt).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={history.status === 'sent' ? 'default' : 'destructive'} 
                                className={history.status === 'sent' ? 'bg-green-600' : ''}
                              >
                                {history.status === 'sent' ? 'Enviado' : 'Erro'}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-2 p-2 bg-white rounded border border-green-100">
                            <p className="text-sm text-gray-700 line-clamp-2">{history.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-6 bg-gray-50 rounded-lg border border-dashed">
                      <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">Nenhuma mensagem de aniversário enviada ainda</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asaas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Configurações do Mercado Pago
              </CardTitle>
              <CardDescription>
                Configure a integração com o Mercado Pago para receber pagamentos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...asaasForm}>
                <form onSubmit={asaasForm.handleSubmit(onAsaasSubmit)} className="space-y-6">
                  <FormField
                    control={asaasForm.control}
                    name="asaasApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Token</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={company?.hasAsaasApiKey ? "••••••••• (chave já configurada - deixe vazio para manter)" : "Digite seu Access Token do Mercado Pago"}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <div className="text-sm text-gray-500">
                          <p>• Obtenha seu Access Token no painel do Mercado Pago</p>
                          <p>• Acesse: Seu negócio → Configurações → Gestão e Administração → Credenciais</p>
                          <p>• Tokens de teste começam com TEST-, produção com APP_USR-</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={asaasForm.control}
                    name="asaasEnvironment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ambiente</FormLabel>
                        <FormControl>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                value="sandbox"
                                checked={field.value === "sandbox"}
                                onChange={() => field.onChange("sandbox")}
                                className="w-4 h-4"
                              />
                              <span>Sandbox (Testes)</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                value="production"
                                checked={field.value === "production"}
                                onChange={() => field.onChange("production")}
                                className="w-4 h-4"
                              />
                              <span>Produção</span>
                            </label>
                          </div>
                        </FormControl>
                        <FormMessage />
                        <div className="text-sm text-gray-500">
                          <p>• Use Sandbox para testar a integração</p>
                          <p>• Use Produção quando estiver pronto para receber pagamentos reais</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={asaasForm.control}
                    name="asaasEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Ativar Integração</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Habilita o recebimento de pagamentos via Mercado Pago
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2">URL do Webhook</h4>
                    <p className="text-sm text-blue-800 mb-2">O webhook é configurado automaticamente ao criar pagamentos. Caso precise configurar manualmente:</p>
                    <div className="bg-white p-3 rounded border border-blue-300">
                      <code className="text-xs break-all">
                        {globalSettings?.systemUrl || window.location.origin}/api/webhook/mercadopago/{company?.id}
                      </code>
                    </div>
                    <div className="mt-3 text-sm text-blue-700">
                      <p className="font-medium mb-1">Para configurar manualmente (opcional):</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Acesse o painel do Mercado Pago</li>
                        <li>Vá em Seu negócio → Configurações → Webhooks</li>
                        <li>Clique em "Configurar notificações"</li>
                        <li>Cole a URL acima</li>
                        <li>Selecione o evento "Pagamentos"</li>
                        <li>Salve as configurações</li>
                      </ol>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateAsaasConfigMutation.isPending}
                      className="min-w-[140px]"
                    >
                      {updateAsaasConfigMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Configurações"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Importantes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">Sobre o Mercado Pago</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Gateway de pagamento completo para sua empresa</li>
                  <li>• Aceite pagamentos via PIX, boleto e cartão de crédito</li>
                  <li>• Receba notificações automáticas de pagamento</li>
                  <li>• Sistema de cobrança recorrente disponível</li>
                  <li>• Suporte completo para split de pagamento</li>
                </ul>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <h4 className="font-semibold text-amber-900 mb-2">Configuração Necessária</h4>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Crie uma conta no Mercado Pago (www.mercadopago.com.br)</li>
                  <li>• Complete o cadastro e verifique sua identidade</li>
                  <li>• Acesse Seu negócio → Configurações → Credenciais</li>
                  <li>• Obtenha o Access Token no painel</li>
                  <li>• Configure os webhooks conforme indicado acima</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>

        {/* QR Code / Pairing Code Dialog */}
        <Dialog open={showQrDialog} onOpenChange={(open) => {
          setShowQrDialog(open);
          if (!open) {
            // Limpar estados ao fechar
            setPairingCode('');
            setPairingPhoneNumber('');
            setConnectionMode('qrcode');
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Conectar WhatsApp
              </DialogTitle>
              <DialogDescription>
                Escolha como deseja conectar sua instância do WhatsApp.
              </DialogDescription>
            </DialogHeader>

            {/* Seletor de modo de conexão */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={connectionMode === 'qrcode' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => {
                  setConnectionMode('qrcode');
                  setPairingCode('');
                }}
              >
                <QrCode className="w-4 h-4 mr-2" />
                QR Code
              </Button>
              <Button
                variant={connectionMode === 'pairingcode' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => {
                  setConnectionMode('pairingcode');
                  setQrCodeData('');
                }}
              >
                <Key className="w-4 h-4 mr-2" />
                Código de Pareamento
              </Button>
            </div>

            {/* Conteúdo do QR Code */}
            {connectionMode === 'qrcode' && (
              <div className="flex flex-col items-center space-y-4">
                {qrCodeData ? (
                  <div className="bg-white p-4 rounded-lg border">
                    <img
                      src={qrCodeData}
                      alt="QR Code WhatsApp"
                      className="w-64 h-64 object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-64 h-64 bg-gray-100 flex items-center justify-center rounded-lg">
                    <div className="text-center">
                      <QrCode className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">Gerando QR code...</p>
                    </div>
                  </div>
                )}
                <div className="text-center space-y-2">
                  <p className="text-sm text-gray-600">
                    1. Abra o WhatsApp no seu celular
                  </p>
                  <p className="text-sm text-gray-600">
                    2. Toque em Menu (⋮) &gt; Dispositivos conectados
                  </p>
                  <p className="text-sm text-gray-600">
                    3. Toque em "Conectar um dispositivo"
                  </p>
                  <p className="text-sm text-gray-600">
                    4. Aponte seu celular para esta tela para capturar o código
                  </p>
                </div>
              </div>
            )}

            {/* Conteúdo do Pairing Code */}
            {connectionMode === 'pairingcode' && (
              <div className="flex flex-col space-y-4">
                {!pairingCode ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="pairingPhone">Número do WhatsApp</Label>
                      <Input
                        id="pairingPhone"
                        type="tel"
                        placeholder="5511999999999"
                        value={pairingPhoneNumber}
                        onChange={(e) => setPairingPhoneNumber(e.target.value)}
                      />
                      <p className="text-xs text-gray-500">
                        Digite o número com DDI e DDD, sem espaços ou caracteres especiais.
                        Ex: 5511999999999
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        if (selectedInstance && pairingPhoneNumber) {
                          getPairingCodeMutation.mutate({
                            instanceName: selectedInstance.instanceName,
                            phoneNumber: pairingPhoneNumber
                          });
                        }
                      }}
                      disabled={!pairingPhoneNumber || getPairingCodeMutation.isPending}
                      className="w-full"
                    >
                      {getPairingCodeMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Gerando código...
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4 mr-2" />
                          Obter Código de Pareamento
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                      <p className="text-sm text-gray-600 mb-2">Seu código de pareamento:</p>
                      <p className="text-3xl font-bold text-green-700 tracking-widest font-mono">
                        {pairingCode}
                      </p>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-sm text-gray-600">
                        1. Abra o WhatsApp no seu celular
                      </p>
                      <p className="text-sm text-gray-600">
                        2. Toque em Menu (⋮) &gt; Dispositivos conectados
                      </p>
                      <p className="text-sm text-gray-600">
                        3. Toque em "Conectar um dispositivo"
                      </p>
                      <p className="text-sm text-gray-600">
                        4. Toque em "Conectar com número de telefone"
                      </p>
                      <p className="text-sm text-gray-600">
                        5. Digite o código acima no WhatsApp
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPairingCode('');
                        setPairingPhoneNumber('');
                      }}
                      className="w-full"
                    >
                      Gerar novo código
                    </Button>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Webhook Configuration Dialog */}
        <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Configurar Agente IA - {selectedInstance?.instanceName}</DialogTitle>
              <DialogDescription>
                O agente IA será configurado automaticamente usando as configurações globais da Meta API definidas pelo administrador.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">Como funciona</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• O webhook será configurado automaticamente na Meta API</li>
                  <li>• Mensagens recebidas no WhatsApp serão processadas pelo agente IA</li>
                  <li>• As respostas serão enviadas automaticamente usando seu prompt personalizado</li>
                  <li>• Utiliza as configurações globais definidas pelo administrador</li>
                </ul>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <h4 className="font-semibold text-amber-900 mb-2">URL do Webhook gerada</h4>
                <p className="text-sm text-amber-800 mb-2">Esta URL será configurada automaticamente:</p>
                <code className="text-xs bg-white p-2 rounded border block">
                  {window.location.origin}/api/webhook/whatsapp/{selectedInstance?.instanceName}
                </code>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowWebhookDialog(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    if (selectedInstance) {
                      configureWebhookMutation.mutate(selectedInstance.id);
                    }
                  }}
                  disabled={configureWebhookMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <Bot className="w-4 h-4" />
                  {configureWebhookMutation.isPending ? "Configurando..." : "Configurar Agente IA"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Remove Number Confirmation Dialog */}
        <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                Confirmar Remoção
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja remover este número da lista de números ignorados?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg border">
                <p className="text-sm font-medium text-gray-700">Número a ser removido:</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{numberToRemove}</p>
              </div>
              <div className="text-sm text-gray-600">
                <p>⚠️ Após remover este número, o agente IA voltará a responder mensagens deste contato.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowRemoveDialog(false);
                    setNumberToRemove(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmRemoveNumber}
                  disabled={updateIgnoredNumbersMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {updateIgnoredNumbersMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Removendo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <FloatingHelpButton menuLocation="settings" />
      </div>
  );
}