import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, ChevronDown, ChevronUp, Calendar, User, Filter } from "lucide-react";
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

function parseDateStr(dateVal: string | Date | null): string {
  if (!dateVal) return "";
  const raw = typeof dateVal === "string" ? dateVal : dateVal.toISOString();
  return raw.includes("T") ? raw.split("T")[0] : raw;
}

export function EvolutionTimeline({ evolutions, professionals, onEdit, onDelete }: EvolutionTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

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

  const getFilteredEvolutions = () => {
    if (dateFilter === "all") return evolutions;

    if (dateFilter === "custom") {
      if (!customStartDate && !customEndDate) return evolutions;
      return evolutions.filter(ev => {
        const evDateStr = parseDateStr(ev.evolutionDate);
        if (customStartDate && evDateStr < customStartDate) return false;
        if (customEndDate && evDateStr > customEndDate) return false;
        return true;
      });
    }

    // Preset filters
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const startDate = new Date(now);

    if (dateFilter === "7days") startDate.setDate(startDate.getDate() - 7);
    else if (dateFilter === "30days") startDate.setDate(startDate.getDate() - 30);
    else if (dateFilter === "90days") startDate.setDate(startDate.getDate() - 90);
    else return evolutions;

    startDate.setHours(0, 0, 0, 0);
    const startStr = startDate.toISOString().split("T")[0];

    return evolutions.filter(ev => {
      const evDateStr = parseDateStr(ev.evolutionDate);
      return evDateStr >= startStr;
    });
  };

  const filteredEvolutions = getFilteredEvolutions();

  if (evolutions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhuma evolução clínica registrada.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={dateFilter} onValueChange={(val) => setDateFilter(val)}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Filtrar por período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="7days">Últimos 7 dias</SelectItem>
            <SelectItem value="30days">Último mês</SelectItem>
            <SelectItem value="90days">Últimos 3 meses</SelectItem>
            <SelectItem value="custom">Período personalizado</SelectItem>
          </SelectContent>
        </Select>
        {dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="w-[140px] h-8 text-xs"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="w-[140px] h-8 text-xs"
            />
          </div>
        )}
        {dateFilter !== "all" && (
          <Badge variant="secondary" className="text-xs">
            {filteredEvolutions.length} de {evolutions.length}
          </Badge>
        )}
      </div>

      {filteredEvolutions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhuma evolução encontrada no período selecionado.
        </div>
      ) : (
        <div className="relative space-y-4">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          {filteredEvolutions.map((evolution) => {
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
      )}
    </div>
  );
}
