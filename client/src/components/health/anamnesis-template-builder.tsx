import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { ANAMNESIS_FIELD_TYPES } from "@shared/schema";

interface TemplateField {
  section: string;
  label: string;
  fieldType: string;
  options: string[] | null;
  isRequired: number;
  sortOrder: number;
  placeholder: string;
}

interface AnamnesisTemplateBuilderProps {
  initialName?: string;
  initialDescription?: string;
  initialFields?: TemplateField[];
  onSave: (data: { name: string; description: string; fields: TemplateField[] }) => void;
  onCancel: () => void;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  select: "Lista de opções",
  checkbox: "Múltipla escolha",
  number: "Número",
  date: "Data",
  boolean: "Sim/Não",
};

function createEmptyField(sortOrder: number): TemplateField {
  return {
    section: "",
    label: "",
    fieldType: "text",
    options: null,
    isRequired: 0,
    sortOrder,
    placeholder: "",
  };
}

export function AnamnesisTemplateBuilder({
  initialName = "",
  initialDescription = "",
  initialFields = [],
  onSave,
  onCancel,
}: AnamnesisTemplateBuilderProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [fields, setFields] = useState<TemplateField[]>(
    initialFields.length > 0 ? initialFields : [createEmptyField(0)]
  );

  const addField = () => {
    setFields(prev => [...prev, createEmptyField(prev.length)]);
  };

  const removeField = (index: number) => {
    if (fields.length <= 1) return;
    setFields(prev => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, sortOrder: i })));
  };

  const updateField = (index: number, updates: Partial<TemplateField>) => {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const newFields = [...fields];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFields(newFields.map((f, i) => ({ ...f, sortOrder: i })));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const validFields = fields.filter(f => f.label.trim());
    if (validFields.length === 0) return;
    onSave({ name, description, fields: validFields });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Nome do modelo *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ficha de Anamnese - Fisioterapia"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição opcional do modelo..."
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Campos / Perguntas</Label>
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar campo
          </Button>
        </div>

        {fields.map((field, index) => (
          <Card key={index} className="relative">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Campo {index + 1}</span>
                <div className="flex-1" />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(index, "up")} disabled={index === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(index, "down")} disabled={index === fields.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => removeField(index)} disabled={fields.length <= 1}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Seção</Label>
                  <Input
                    value={field.section}
                    onChange={(e) => updateField(index, { section: e.target.value })}
                    placeholder="Ex: Dados Pessoais"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select
                    value={field.fieldType}
                    onValueChange={(val) => updateField(index, { fieldType: val, options: (val === "select" || val === "checkbox") ? [] : null })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANAMNESIS_FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{FIELD_TYPE_LABELS[type] || type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Pergunta / Label *</Label>
                <Input
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                  placeholder="Ex: Possui alguma alergia?"
                  className="h-8 text-sm"
                  required
                />
              </div>

              {(field.fieldType === "select" || field.fieldType === "checkbox") && (
                <div className="space-y-1">
                  <Label className="text-xs">Opções (uma por linha)</Label>
                  <Textarea
                    value={(field.options || []).join("\n")}
                    onChange={(e) => updateField(index, { options: e.target.value.split("\n").filter(Boolean) })}
                    placeholder={"Opção 1\nOpção 2\nOpção 3"}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!field.isRequired}
                    onCheckedChange={(checked) => updateField(index, { isRequired: checked ? 1 : 0 })}
                  />
                  <Label className="text-xs">Obrigatório</Label>
                </div>
                <div className="flex-1">
                  <Input
                    value={field.placeholder}
                    onChange={(e) => updateField(index, { placeholder: e.target.value })}
                    placeholder="Placeholder (opcional)"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">
          Salvar Modelo
        </Button>
      </div>
    </form>
  );
}
