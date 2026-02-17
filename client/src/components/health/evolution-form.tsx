import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clinicalEvolutionSchema } from "@/lib/validations";
import type { z } from "zod";

type EvolutionFormData = z.infer<typeof clinicalEvolutionSchema>;

interface EvolutionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: EvolutionFormData) => void;
  professionals: Array<{ id: number; name: string }>;
  initialData?: Partial<EvolutionFormData>;
  isEditing?: boolean;
}

export function EvolutionForm({
  open,
  onOpenChange,
  onSubmit,
  professionals,
  initialData,
  isEditing = false,
}: EvolutionFormProps) {
  const today = new Date().toISOString().split("T")[0];

  const form = useForm<EvolutionFormData>({
    resolver: zodResolver(clinicalEvolutionSchema),
    defaultValues: {
      title: initialData?.title || "",
      content: initialData?.content || "",
      evolutionDate: initialData?.evolutionDate || today,
      professionalId: initialData?.professionalId || null,
    },
  });

  const handleSubmit = (data: EvolutionFormData) => {
    onSubmit(data);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Evolução" : "Nova Evolução Clínica"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} placeholder="Ex: Sessão de fisioterapia - ombro" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="evolutionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do atendimento *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="professionalId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profissional</FormLabel>
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o profissional..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {professionals.map((prof) => (
                        <SelectItem key={prof.id} value={String(prof.id)}>{prof.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Evolução / Diagnóstico *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descreva o atendimento, diagnóstico, conduta, observações..."
                      rows={8}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {isEditing ? "Salvar alterações" : "Registrar evolução"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
