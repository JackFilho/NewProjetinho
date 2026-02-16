import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Phone, Mail, Cake, ShieldCheck, Briefcase } from "lucide-react";
import type { AnamnesisTemplateField, Client } from "@shared/schema";

interface AnamnesisFormProps {
  templateFields: AnamnesisTemplateField[];
  existingAnswers?: Record<string, any>;
  onSubmit: (answers: Record<string, any>, notes?: string) => void;
  isReadOnly?: boolean;
  notes?: string;
  patient?: Client;
}

function formatDateBR(dateVal: string | Date | null): string {
  if (!dateVal) return "";
  const raw = typeof dateVal === "string" ? dateVal : dateVal.toISOString();
  const dateStr = raw.includes("T") ? raw.split("T")[0] : raw;
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function calculateAge(birthDate: string | Date | null): number | null {
  if (!birthDate) return null;
  const raw = typeof birthDate === "string" ? birthDate : birthDate.toISOString();
  const dateStr = raw.includes("T") ? raw.split("T")[0] : raw;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age--;
  }
  return age;
}

const SEX_LABELS: Record<string, string> = {
  masculino: "Masculino",
  feminino: "Feminino",
  outro: "Outro",
};

export function AnamnesisForm({ templateFields, existingAnswers, onSubmit, isReadOnly = false, notes: initialNotes, patient }: AnamnesisFormProps) {
  const [answers, setAnswers] = useState<Record<string, any>>(existingAnswers || {});
  const [notes, setNotes] = useState(initialNotes || "");

  const handleChange = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(answers, notes);
  };

  // Group fields by section
  const sections = templateFields.reduce<Record<string, AnamnesisTemplateField[]>>((acc, field) => {
    const section = field.section || "Geral";
    if (!acc[section]) acc[section] = [];
    acc[section].push(field);
    return acc;
  }, {});

  const renderField = (field: AnamnesisTemplateField) => {
    const fieldKey = String(field.id);
    const value = answers[fieldKey];

    switch (field.fieldType) {
      case "text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleChange(fieldKey, e.target.value)}
            placeholder={field.placeholder || ""}
            disabled={isReadOnly}
          />
        );
      case "textarea":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => handleChange(fieldKey, e.target.value)}
            placeholder={field.placeholder || ""}
            disabled={isReadOnly}
            rows={3}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handleChange(fieldKey, e.target.value)}
            placeholder={field.placeholder || ""}
            disabled={isReadOnly}
          />
        );
      case "date":
        return (
          <Input
            type="date"
            value={value || ""}
            onChange={(e) => handleChange(fieldKey, e.target.value)}
            disabled={isReadOnly}
          />
        );
      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={!!value}
              onCheckedChange={(checked) => handleChange(fieldKey, checked)}
              disabled={isReadOnly}
            />
            <span className="text-sm text-muted-foreground">{value ? "Sim" : "Não"}</span>
          </div>
        );
      case "select":
        return (
          <Select
            value={value || ""}
            onValueChange={(val) => handleChange(fieldKey, val)}
            disabled={isReadOnly}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "checkbox":
        const selectedValues: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {(field.options || []).map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedValues.includes(opt)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, opt]
                      : selectedValues.filter(v => v !== opt);
                    handleChange(fieldKey, newValues);
                  }}
                  disabled={isReadOnly}
                />
                <Label className="text-sm font-normal">{opt}</Label>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleChange(fieldKey, e.target.value)}
            disabled={isReadOnly}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identificação do Paciente */}
      {patient && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Identificação do Paciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-muted-foreground">Nome:</span>
                <span className="font-semibold">{patient.name}</span>
              </div>

              {patient.birthDate && (
                <div className="flex items-center gap-2">
                  <Cake className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">Nascimento:</span>
                  <span>{formatDateBR(patient.birthDate)}</span>
                  {calculateAge(patient.birthDate) !== null && (
                    <Badge variant="outline" className="text-xs">
                      {calculateAge(patient.birthDate)} anos
                    </Badge>
                  )}
                </div>
              )}

              {patient.sex && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">Sexo:</span>
                  <span>{SEX_LABELS[patient.sex] || patient.sex}</span>
                </div>
              )}

              {(patient.phone || patient.email) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {patient.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {patient.phone}
                    </span>
                  )}
                  {patient.email && (
                    <span className="flex items-center gap-1 ml-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {patient.email}
                    </span>
                  )}
                </div>
              )}

              {patient.occupation && (
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">Ocupação:</span>
                  <span>{patient.occupation}</span>
                </div>
              )}

              {patient.guardian && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">Responsável:</span>
                  <span>{patient.guardian}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {Object.entries(sections).map(([sectionName, fields]) => (
        <Card key={sectionName}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{sectionName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.sort((a, b) => a.sortOrder - b.sortOrder).map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label className="text-sm">
                  {field.label}
                  {field.isRequired ? <span className="text-red-500 ml-1">*</span> : null}
                </Label>
                {renderField(field)}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="space-y-1.5">
        <Label>Observações adicionais</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas adicionais sobre a anamnese..."
          disabled={isReadOnly}
          rows={3}
        />
      </div>

      {!isReadOnly && (
        <Button type="submit" className="w-full">
          Salvar Anamnese
        </Button>
      )}
    </form>
  );
}
