import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, ChevronDown, ChevronUp, Calendar, User } from "lucide-react";
import type { ClinicalEvolution } from "@shared/schema";

interface EvolutionTimelineProps {
  evolutions: ClinicalEvolution[];
  professionals?: Array<{ id: number; name: string }>;
  onEdit?: (evolution: ClinicalEvolution) => void;
  onDelete?: (id: number) => void;
}

function formatDateBR(dateVal: string | Date | null): string {
  if (!dateVal) return "";
  const raw = typeof dateVal === "string" ? dateVal : dateVal.toISOString();
  const dateStr = raw.includes("T") ? raw.split("T")[0] : raw;
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export function EvolutionTimeline({ evolutions, professionals, onEdit, onDelete }: EvolutionTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getProfessionalName = (profId: number | null) => {
    if (!profId || !professionals) return null;
    return professionals.find(p => p.id === profId)?.name;
  };

  if (evolutions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhuma evolução clínica registrada.
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

      {evolutions.map((evolution) => {
        const isExpanded = expandedIds.has(evolution.id);
        const contentPreview = evolution.content.length > 200 && !isExpanded
          ? evolution.content.substring(0, 200) + "..."
          : evolution.content;
        const profName = getProfessionalName(evolution.professionalId);

        return (
          <div key={evolution.id} className="relative pl-10">
            {/* Timeline dot */}
            <div className="absolute left-2.5 top-3 w-3 h-3 rounded-full bg-primary border-2 border-background" />

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateBR(evolution.evolutionDate)}
                      </Badge>
                      {profName && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <User className="h-3 w-3" />
                          {profName}
                        </Badge>
                      )}
                      {evolution.appointmentId && (
                        <Badge variant="outline" className="text-xs">
                          Agendamento #{evolution.appointmentId}
                        </Badge>
                      )}
                    </div>
                    {evolution.title && (
                      <h4 className="font-medium mt-1.5">{evolution.title}</h4>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {onEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(evolution)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => onDelete(evolution.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contentPreview}</p>

                {evolution.content.length > 200 && (
                  <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs px-2" onClick={() => toggleExpand(evolution.id)}>
                    {isExpanded ? (
                      <><ChevronUp className="h-3 w-3 mr-1" /> ver menos</>
                    ) : (
                      <><ChevronDown className="h-3 w-3 mr-1" /> ver mais</>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
