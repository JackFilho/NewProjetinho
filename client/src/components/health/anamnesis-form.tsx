import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnamnesisTemplateField } from "@shared/schema";

interface AnamnesisFormProps {
  templateFields: AnamnesisTemplateField[];
  existingAnswers?: Record<string, any>;
  onSubmit: (answers: Record<string, any>, notes?: string) => void;
  isReadOnly?: boolean;
  notes?: string;
}

export function AnamnesisForm({ templateFields, existingAnswers, onSubmit, isReadOnly = false, notes: initialNotes }: AnamnesisFormProps) {
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
