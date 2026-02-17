import jsPDF from "jspdf";
import type { AnamnesisTemplateField, Client } from "@shared/schema";

interface AnamnesisPdfOptions {
  fields: AnamnesisTemplateField[];
  answers: Record<string, any>;
  notes: string;
  patient?: Client;
  mode: "digital" | "manual";
  logoUrl?: string | null;
  companyName?: string;
  primaryColor?: string | null;
}

// ── Helpers ──────────────────────────────────────────

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
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age--;
  return age;
}

const SEX_LABELS: Record<string, string> = {
  masculino: "Masculino",
  feminino: "Feminino",
  outro: "Outro",
};

function safeOptions(opts: any): string[] {
  if (!opts) return [];
  if (Array.isArray(opts)) return opts;
  if (typeof opts === "string") {
    try {
      const parsed = JSON.parse(opts);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getFieldDisplayValue(field: AnamnesisTemplateField, value: any): string {
  if (value === undefined || value === null || value === "") return "";
  switch (field.fieldType) {
    case "boolean":
      return value ? "Sim" : "Nao";
    case "date":
      return formatDateBR(value);
    case "checkbox":
      return Array.isArray(value) ? value.join(", ") : String(value);
    default:
      return String(value);
  }
}

function checkPage(doc: jsPDF, y: number, needed: number, marginTop: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage();
    return marginTop;
  }
  return y;
}

/** Convert image URL to base64 data URL */
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Colors ───────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return { r: 37, g: 99, b: 235 };
  return { r, g, b };
}

/** Lighten a color by mixing with white */
function lighten(c: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(c.r + (255 - c.r) * amount),
    g: Math.round(c.g + (255 - c.g) * amount),
    b: Math.round(c.b + (255 - c.b) * amount),
  };
}

const DEFAULT_PRIMARY = { r: 37, g: 99, b: 235 };
const DARK = { r: 33, g: 37, b: 41 };
const MUTED = { r: 108, g: 117, b: 125 };
const FIELD_LINE = { r: 180, g: 180, b: 180 };

// ── Drawing helpers ──────────────────────────────────

function drawSectionHeader(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  primary: { r: number; g: number; b: number },
) {
  doc.setFillColor(primary.r, primary.g, primary.b);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(text, x + 5, y + h / 2 + 1.2);
}

function drawFieldLabel(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  required: boolean,
) {
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(`${label}${required ? " *" : ""}`, x, y);
}

function drawUnderline(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
) {
  doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

// ── Main ─────────────────────────────────────────────

export async function generateAnamnesisPdf(options: AnamnesisPdfOptions) {
  const { fields, answers, notes, patient, mode, logoUrl, companyName, primaryColor } = options;

  const PRIMARY = primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? hexToRgb(primaryColor)
    : DEFAULT_PRIMARY;
  const PRIMARY_LIGHT = lighten(PRIMARY, 0.92);
  const isManual = mode === "manual";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // ── Load logo ──
  let logoData: string | null = null;
  if (logoUrl) {
    logoData = await loadImageAsBase64(logoUrl);
  }

  // ════════════════════════════════════════════════════
  //  HEADER
  // ════════════════════════════════════════════════════

  // Light background area for the header
  doc.setFillColor(PRIMARY_LIGHT.r, PRIMARY_LIGHT.g, PRIMARY_LIGHT.b);
  doc.rect(0, 0, pageWidth, 38, "F");

  // Logo
  const logoSize = 28;
  const logoY = 6.5;
  if (logoData) {
    try {
      doc.addImage(logoData, "AUTO", margin, logoY, logoSize, logoSize);
    } catch {
      // logo failed
    }
  }

  // Title block (right of logo)
  const titleX = logoData ? margin + logoSize + 6 : margin;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text("Ficha de Anamnese", titleX, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  const subtitle = isManual
    ? "Formulario para preenchimento pelo paciente"
    : "Formulario preenchido digitalmente";
  doc.text(subtitle, titleX, 22);

  // Company name below subtitle
  if (companyName) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
    doc.text(companyName, titleX, 29);
  }

  // Date on the right
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth - margin, 33, { align: "right" });

  y = 43;

  // ════════════════════════════════════════════════════
  //  PATIENT IDENTIFICATION
  // ════════════════════════════════════════════════════

  drawSectionHeader(doc, margin, y, contentWidth, 8, "IDENTIFICACAO DO PACIENTE", PRIMARY);
  y += 13;

  const colLeft = margin + 2;
  const colRight = margin + contentWidth / 2 + 4;
  const fieldW = contentWidth / 2 - 6;

  if (isManual) {
    const leftFields = ["Nome completo", "Data de nascimento", "Telefone", "Ocupacao"];
    const rightFields = ["Sexo", "Idade", "E-mail", "Responsavel"];

    for (let i = 0; i < leftFields.length; i++) {
      y = checkPage(doc, y, 11, 43);
      // Left
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text(leftFields[i], colLeft, y);
      drawUnderline(doc, colLeft, y + 5, fieldW);

      // Right
      doc.text(rightFields[i], colRight, y);
      drawUnderline(doc, colRight, y + 5, fieldW);

      y += 11;
    }
  } else if (patient) {
    const leftData: [string, string][] = [];
    const rightData: [string, string][] = [];

    leftData.push(["Nome", patient.name || ""]);
    if (patient.birthDate) {
      const age = calculateAge(patient.birthDate);
      leftData.push(["Nascimento", formatDateBR(patient.birthDate)]);
      rightData.push(["Idade", age !== null ? `${age} anos` : ""]);
    }
    if (patient.sex) rightData.unshift(["Sexo", SEX_LABELS[patient.sex] || patient.sex]);
    if (patient.phone) leftData.push(["Telefone", patient.phone]);
    if (patient.email) rightData.push(["E-mail", patient.email]);
    if (patient.occupation) leftData.push(["Ocupacao", patient.occupation]);
    if (patient.guardian) rightData.push(["Responsavel", patient.guardian]);

    const maxRows = Math.max(leftData.length, rightData.length);
    for (let i = 0; i < maxRows; i++) {
      y = checkPage(doc, y, 10, 43);

      // Left column
      if (leftData[i]) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(leftData[i][0], colLeft, y);
        const lw = doc.getTextWidth(leftData[i][0]) + 3;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.setFontSize(9);
        doc.text(leftData[i][1], colLeft + lw, y);
      }
      drawUnderline(doc, colLeft, y + 3, fieldW);

      // Right column
      if (rightData[i]) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(rightData[i][0], colRight, y);
        const lw = doc.getTextWidth(rightData[i][0]) + 3;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.setFontSize(9);
        doc.text(rightData[i][1], colRight + lw, y);
      }
      drawUnderline(doc, colRight, y + 3, fieldW);

      y += 10;
    }
  }

  y += 4;

  // ════════════════════════════════════════════════════
  //  FORM FIELDS BY SECTION
  // ════════════════════════════════════════════════════

  const sections = fields.reduce<Record<string, AnamnesisTemplateField[]>>((acc, field) => {
    const section = field.section || "Geral";
    if (!acc[section]) acc[section] = [];
    acc[section].push(field);
    return acc;
  }, {});

  for (const [sectionName, sectionFields] of Object.entries(sections)) {
    y = checkPage(doc, y, 20, 43);

    // Section header with rounded colored background
    drawSectionHeader(doc, margin, y, contentWidth, 8, sectionName.toUpperCase(), PRIMARY);
    y += 13;

    const sortedFields = [...sectionFields].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const field of sortedFields) {
      y = checkPage(doc, y, 14, 43);

      const fieldOpts = safeOptions(field.options);

      // Field label
      drawFieldLabel(doc, margin + 2, y, field.label, !!field.isRequired);
      y += 5;

      if (isManual) {
        // ── MANUAL MODE ──
        doc.setFont("helvetica", "normal");
        doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);

        switch (field.fieldType) {
          case "textarea": {
            const boxH = 20;
            y = checkPage(doc, y, boxH + 4, 43);
            doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin + 1, y, contentWidth - 2, boxH, 1.5, 1.5);
            // Draw faint guide lines inside
            doc.setLineWidth(0.1);
            doc.setDrawColor(220, 220, 220);
            for (let lineY = y + 5; lineY < y + boxH - 1; lineY += 5) {
              doc.line(margin + 4, lineY, margin + contentWidth - 5, lineY);
            }
            y += boxH + 4;
            break;
          }
          case "boolean": {
            doc.setFontSize(9);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
            doc.setLineWidth(0.3);
            // Sim
            doc.roundedRect(margin + 2, y - 3, 4, 4, 0.8, 0.8);
            doc.text("Sim", margin + 8, y);
            // Nao
            doc.roundedRect(margin + 25, y - 3, 4, 4, 0.8, 0.8);
            doc.text("Nao", margin + 31, y);
            y += 7;
            break;
          }
          case "select": {
            doc.setFontSize(8.5);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            let xOpt = margin + 2;
            for (const opt of fieldOpts) {
              const optW = doc.getTextWidth(opt) + 10;
              if (xOpt + optW > pageWidth - margin) {
                y += 6;
                xOpt = margin + 2;
              }
              doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
              doc.setLineWidth(0.3);
              doc.circle(xOpt + 2, y - 1, 1.8);
              doc.text(opt, xOpt + 6, y);
              xOpt += optW;
            }
            y += 7;
            break;
          }
          case "checkbox": {
            doc.setFontSize(8.5);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            let xOpt = margin + 2;
            for (const opt of fieldOpts) {
              const optW = doc.getTextWidth(opt) + 11;
              if (xOpt + optW > pageWidth - margin) {
                y += 6;
                xOpt = margin + 2;
              }
              doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
              doc.setLineWidth(0.3);
              doc.roundedRect(xOpt, y - 3, 4, 4, 0.8, 0.8);
              doc.text(opt, xOpt + 6, y);
              xOpt += optW;
            }
            y += 7;
            break;
          }
          default: {
            drawUnderline(doc, margin + 1, y + 1, contentWidth - 2);
            y += 7;
            break;
          }
        }
      } else {
        // ── DIGITAL MODE ──
        doc.setFont("helvetica", "normal");
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        const displayValue = getFieldDisplayValue(field, answers[String(field.id)]);

        if (field.fieldType === "boolean") {
          doc.setFontSize(9);
          const val = answers[String(field.id)];
          doc.setLineWidth(0.3);

          // Sim
          if (val) {
            doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
            doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
            doc.roundedRect(margin + 2, y - 3, 4, 4, 0.8, 0.8, "FD");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("X", margin + 2.8, y);
            doc.setFont("helvetica", "normal");
          } else {
            doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
            doc.roundedRect(margin + 2, y - 3, 4, 4, 0.8, 0.8);
          }
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          doc.setFontSize(9);
          doc.text("Sim", margin + 8, y);

          // Nao
          if (!val) {
            doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
            doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
            doc.roundedRect(margin + 25, y - 3, 4, 4, 0.8, 0.8, "FD");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("X", margin + 25.8, y);
            doc.setFont("helvetica", "normal");
          } else {
            doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
            doc.roundedRect(margin + 25, y - 3, 4, 4, 0.8, 0.8);
          }
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          doc.setFontSize(9);
          doc.text("Nao", margin + 31, y);
          y += 7;

        } else if (field.fieldType === "select") {
          doc.setFontSize(8.5);
          let xOpt = margin + 2;
          for (const opt of fieldOpts) {
            const optW = doc.getTextWidth(opt) + 10;
            if (xOpt + optW > pageWidth - margin) {
              y += 6;
              xOpt = margin + 2;
            }
            if (opt === displayValue) {
              doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
              doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
              doc.circle(xOpt + 2, y - 1, 1.8, "F");
            } else {
              doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
              doc.setLineWidth(0.3);
              doc.circle(xOpt + 2, y - 1, 1.8);
            }
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.text(opt, xOpt + 6, y);
            xOpt += optW;
          }
          y += 7;

        } else if (field.fieldType === "checkbox") {
          const selectedVals: string[] = Array.isArray(answers[String(field.id)])
            ? answers[String(field.id)]
            : [];
          doc.setFontSize(8.5);
          let xOpt = margin + 2;
          for (const opt of fieldOpts) {
            const optW = doc.getTextWidth(opt) + 11;
            if (xOpt + optW > pageWidth - margin) {
              y += 6;
              xOpt = margin + 2;
            }
            doc.setLineWidth(0.3);
            if (selectedVals.includes(opt)) {
              doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
              doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
              doc.roundedRect(xOpt, y - 3, 4, 4, 0.8, 0.8, "FD");
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(8);
              doc.setFont("helvetica", "bold");
              doc.text("X", xOpt + 0.8, y);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(DARK.r, DARK.g, DARK.b);
              doc.setFontSize(8.5);
            } else {
              doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
              doc.roundedRect(xOpt, y - 3, 4, 4, 0.8, 0.8);
            }
            doc.text(opt, xOpt + 6, y);
            xOpt += optW;
          }
          y += 7;

        } else if (field.fieldType === "textarea") {
          doc.setFontSize(9);
          if (displayValue) {
            const lines = doc.splitTextToSize(displayValue, contentWidth - 10);
            const boxH = Math.max(14, lines.length * 4.5 + 6);
            y = checkPage(doc, y, boxH + 4, 43);
            // Light background box
            doc.setFillColor(PRIMARY_LIGHT.r, PRIMARY_LIGHT.g, PRIMARY_LIGHT.b);
            doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
            doc.setLineWidth(0.2);
            doc.roundedRect(margin + 1, y, contentWidth - 2, boxH, 1.5, 1.5, "FD");
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.text(lines, margin + 5, y + 4.5);
            y += boxH + 4;
          } else {
            doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
            doc.setLineWidth(0.2);
            doc.roundedRect(margin + 1, y, contentWidth - 2, 14, 1.5, 1.5);
            y += 18;
          }
        } else {
          // text, number, date, etc.
          doc.setFontSize(9);
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          if (displayValue) {
            doc.text(displayValue, margin + 2, y);
          }
          drawUnderline(doc, margin + 1, y + 2.5, contentWidth - 2);
          y += 7;
        }
      }
    }

    y += 5;
  }

  // ════════════════════════════════════════════════════
  //  NOTES SECTION
  // ════════════════════════════════════════════════════

  y = checkPage(doc, y, 28, 43);

  drawSectionHeader(doc, margin, y, contentWidth, 8, "OBSERVACOES ADICIONAIS", PRIMARY);
  y += 13;

  if (isManual) {
    // Draw lined box for manual notes
    const boxH = 30;
    y = checkPage(doc, y, boxH + 4, 43);
    doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin + 1, y, contentWidth - 2, boxH, 1.5, 1.5);
    doc.setLineWidth(0.1);
    doc.setDrawColor(220, 220, 220);
    for (let lineY = y + 5; lineY < y + boxH - 1; lineY += 5) {
      doc.line(margin + 4, lineY, margin + contentWidth - 5, lineY);
    }
    y += boxH + 4;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    if (notes) {
      const noteLines = doc.splitTextToSize(notes, contentWidth - 10);
      const boxH = Math.max(14, noteLines.length * 4.5 + 6);
      y = checkPage(doc, y, boxH + 4, 43);
      doc.setFillColor(PRIMARY_LIGHT.r, PRIMARY_LIGHT.g, PRIMARY_LIGHT.b);
      doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
      doc.setLineWidth(0.2);
      doc.roundedRect(margin + 1, y, contentWidth - 2, boxH, 1.5, 1.5, "FD");
      doc.text(noteLines, margin + 5, y + 4.5);
      y += boxH + 4;
    } else {
      doc.setDrawColor(FIELD_LINE.r, FIELD_LINE.g, FIELD_LINE.b);
      doc.setLineWidth(0.2);
      doc.roundedRect(margin + 1, y, contentWidth - 2, 14, 1.5, 1.5);
      y += 18;
    }
  }

  // ════════════════════════════════════════════════════
  //  SIGNATURE SECTION
  // ════════════════════════════════════════════════════

  y = checkPage(doc, y, 40, 43);
  y += 15;

  const signWidth = (contentWidth - 30) / 2;

  doc.setDrawColor(DARK.r, DARK.g, DARK.b);
  doc.setLineWidth(0.4);

  // Patient signature
  doc.line(margin, y, margin + signWidth, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("Assinatura do Paciente", margin + signWidth / 2, y + 5, { align: "center" });

  // Professional signature
  const rightSignX = margin + signWidth + 30;
  doc.line(rightSignX, y, pageWidth - margin, y);
  doc.text("Assinatura do Profissional", rightSignX + signWidth / 2, y + 5, { align: "center" });

  y += 12;
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.setFontSize(8);
  if (isManual) {
    doc.text("Data: ____/____/________", pageWidth / 2, y, { align: "center" });
  } else {
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth / 2, y, { align: "center" });
  }

  // ════════════════════════════════════════════════════
  //  FOOTER (all pages)
  // ════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);

    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }

  // ── Save ──
  const patientName = patient?.name?.replace(/[^a-zA-Z0-9]/g, "_") || "paciente";
  const suffix = isManual ? "manual" : "preenchida";
  doc.save(`anamnese_${suffix}_${patientName}.pdf`);
}
