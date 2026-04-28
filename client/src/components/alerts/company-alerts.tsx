import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, CheckCircle, XCircle, PartyPopper } from "lucide-react";
import { useState, useEffect } from "react";

interface Alert {
  id: number;
  title: string;
  message: string;
  type: string;
  active: boolean;
  createdAt: string;
}

const alertTypeConfig = {
  info: { icon: Info, color: "text-blue-600" },
  warning: { icon: AlertTriangle, color: "text-orange-600" },
  success: { icon: CheckCircle, color: "text-green-600" },
  error: { icon: XCircle, color: "text-red-600" },
  holiday: { icon: PartyPopper, color: "text-purple-600" },
};

export function CompanyAlerts() {
  const [openAlerts, setOpenAlerts] = useState<Alert[]>([]);
  const [currentAlertIndex, setCurrentAlertIndex] = useState(0);

  const { data: alerts } = useQuery({
    queryKey: ["/api/company/alerts"],
    queryFn: async () => {
      return await apiRequest("/api/company/alerts", "GET");
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (alerts && alerts.length > 0) {
      setOpenAlerts(alerts);
      setCurrentAlertIndex(0);
    }
  }, [alerts]);

  const handleCloseAlert = () => {
    if (currentAlertIndex < openAlerts.length - 1) {
      setCurrentAlertIndex(currentAlertIndex + 1);
    } else {
      setOpenAlerts([]);
    }
  };

  const handleCloseAllAlerts = () => {
    setOpenAlerts([]);
  };

  if (!openAlerts.length) return null;

  const currentAlert = openAlerts[currentAlertIndex];

  // Validação de segurança para tipos inválidos
  const alertType = currentAlert?.type && alertTypeConfig[currentAlert.type as keyof typeof alertTypeConfig]
    ? currentAlert.type as keyof typeof alertTypeConfig
    : 'info';

  const alertConfig = alertTypeConfig[alertType];
  const AlertIcon = alertConfig.icon;

  return (
    <Dialog open={true} onOpenChange={handleCloseAllAlerts}>
      <DialogContent className="max-w-[90%] sm:max-w-md border border-gray-200 shadow-lg">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 text-sm sm:text-base ${alertConfig.color}`}>
            <AlertIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            {currentAlert.title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-3 sm:py-4">
          <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
            {currentAlert.message}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <span className="text-xs sm:text-sm text-gray-500 font-medium">
            Equipe AIDA!
          </span>

          <div className="flex gap-2 w-full sm:w-auto">
            {openAlerts.length > 1 && currentAlertIndex < openAlerts.length - 1 && (
              <Button variant="outline" onClick={handleCloseAlert} className="text-xs sm:text-sm flex-1 sm:flex-none">
                Próximo
              </Button>
            )}
            <Button onClick={handleCloseAllAlerts} className="text-xs sm:text-sm flex-1 sm:flex-none">
              {currentAlertIndex === openAlerts.length - 1 ? "Fechar" : "Fechar Todos"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}