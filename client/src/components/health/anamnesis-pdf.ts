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

function checkPage(doc: jsPDF, y: number, needed: number, margin: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage();
    return margin;
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
  if (isNaN(r) || isNaN(g) || isNaN(b)) return { r: 37, g: 99, b: 235 }; // fallback blue
  return { r, g, b };
}

const DEFAULT_PRIMARY = { r: 37, g: 99, b: 235 };  // blue-600
const DARK = { r: 30, g: 41, b: 59 };               // slate-800
const MUTED = { r: 100, g: 116, b: 139 };           // slate-500
const LIGHT_BG = { r: 241, g: 245, b: 249 };        // slate-100
const LINE_COLOR = { r: 203, g: 213, b: 225 };      // slate-300

// ── Main ─────────────────────────────────────────────

export async function generateAnamnesisPdf(options: AnamnesisPdfOptions) {
  const { fields, answers, notes, patient, mode, logoUrl, companyName, primaryColor } = options;

  // Resolve primary color: use company color or fallback to default blue
  const PRIMARY = primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? hexToRgb(primaryColor)
    : DEFAULT_PRIMARY;
  const isManual = mode === "manual";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210
  const pageHeight = doc.internal.pageSize.getHeight();  // 297
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Load logo ──
  let logoData: string | null = null;
  if (logoUrl) {
    logoData = await loadImageAsBase64(logoUrl);
  }

  // ════════════════════════════════════════════════════
  //  HEADER – Logo left + Title right
  // ════════════════════════════════════════════════════

  // Header background bar
  doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Logo
  const logoSize = 24;
  if (logoData) {
    try {
      doc.addImage(logoData, "AUTO", margin, 2, logoSize, logoSize);
    } catch {
      // logo failed, skip
    }
  }

  // Title text
  const titleX = logoData ? margin + logoSize + 4 : margin;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("FICHA DE ANAMNESE", titleX, 12);

  // Subtitle
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const subtitle = isManual ? "Formulario para preenchimento pelo paciente" : "Formulario preenchido digitalmente";
  doc.text(subtitle, titleX, 18);

  // Company name on the right
  if (companyName) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(companyName, pageWidth - margin, 18, { align: "right" });
  }

  // Date on the right
  doc.setFontSize(7);
  doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth - margin, 24, { align: "right" });

  doc.setTextColor(0, 0, 0);
  y = 34;

  // ════════════════════════════════════════════════════
  //  PATIENT IDENTIFICATION
  // ════════════════════════════════════════════════════

  // Section title bar
  doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin, y + 7); // left accent bar
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text("IDENTIFICACAO DO PACIENTE", margin + 3, y + 4.8);
  y += 10;

  const colLeft = margin;
  const colRight = margin + contentWidth / 2 + 2;
  const fieldW = contentWidth / 2 - 2;

  if (isManual) {
    // Two-column patient fields
    const leftFields = ["Nome completo", "Data de nascimento", "Telefone", "Ocupacao"];
    const rightFields = ["Sexo", "Idade", "E-mail", "Responsavel"];

    doc.setFontSize(8);
    for (let i = 0; i < leftFields.length; i++) {
      y = checkPage(doc, y, 9, 34);
      // Left
      doc.setFont("helvetica", "bold");
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text(leftFields[i], colLeft, y);
      doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
      doc.setLineWidth(0.2);
      doc.line(colLeft, y + 4.5, colLeft + fieldW, y + 4.5);

      // Right
      doc.text(rightFields[i], colRight, y);
      doc.line(colRight, y + 4.5, colRight + fieldW, y + 4.5);

      y += 9;
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
    if (patient.sex) rightData.push(["Sexo", SEX_LABELS[patient.sex] || patient.sex]);
    if (patient.phone) leftData.push(["Telefone", patient.phone]);
    if (patient.email) rightData.push(["E-mail", patient.email]);
    if (patient.occupation) leftData.push(["Ocupacao", patient.occupation]);
    if (patient.guardian) rightData.push(["Responsavel", patient.guardian]);

    const maxRows = Math.max(leftData.length, rightData.length);
    doc.setFontSize(8);
    for (let i = 0; i < maxRows; i++) {
      y = checkPage(doc, y, 9, 34);
      // Left column
      if (leftData[i]) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(leftData[i][0], colLeft, y);
        const lw = doc.getTextWidth(leftData[i][0] + "  ");
        doc.setFont("helvetica", "normal");
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(leftData[i][1], colLeft + lw, y);
      }
      // Separator
      doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
      doc.setLineWidth(0.15);
      doc.line(colLeft, y + 2.5, colLeft + fieldW, y + 2.5);

      // Right column
      if (rightData[i]) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(rightData[i][0], colRight, y);
        const lw = doc.getTextWidth(rightData[i][0] + "  ");
        doc.setFont("helvetica", "normal");
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(rightData[i][1], colRight + lw, y);
      }
      doc.line(colRight, y + 2.5, colRight + fieldW, y + 2.5);

      y += 7;
    }
  }

  y += 3;

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
    y = checkPage(doc, y, 16, 34);

    // Section header bar
    doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
    doc.setLineWidth(0.6);
    doc.line(margin, y, margin, y + 7);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(sectionName.toUpperCase(), margin + 3, y + 4.8);
    y += 10;

    const sortedFields = [...sectionFields].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const field of sortedFields) {
      y = checkPage(doc, y, 12, 34);

      const fieldOpts = safeOptions(field.options);

      // Field label
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      const label = `${field.label}${field.isRequired ? " *" : ""}`;
      doc.text(label, margin + 1, y);
      y += 4;

      if (isManual) {
        // ── MANUAL MODE ──
        doc.setFont("helvetica", "normal");
        doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
        doc.setLineWidth(0.2);

        switch (field.fieldType) {
          case "textarea": {
            const boxH = 16;
            y = checkPage(doc, y, boxH + 3, 34);
            doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
            doc.rect(margin, y, contentWidth, boxH);
            y += boxH + 3;
            break;
          }
          case "boolean": {
            doc.setFontSize(8);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            // Sim
            doc.rect(margin + 1, y - 2.5, 3.5, 3.5);
            doc.text("Sim", margin + 6, y);
            // Nao
            doc.rect(margin + 22, y - 2.5, 3.5, 3.5);
            doc.text("Nao", margin + 27, y);
            y += 6;
            break;
          }
          case "select": {
            doc.setFontSize(8);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            let xOpt = margin + 1;
            const optY = y;
            for (const opt of fieldOpts) {
              const optW = doc.getTextWidth(opt) + 8;
              if (xOpt + optW > pageWidth - margin) {
                y += 5.5;
                xOpt = margin + 1;
              }
              doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
              doc.ellipse(xOpt + 1.5, y - 0.8, 1.5, 1.5);
              doc.text(opt, xOpt + 4.5, y);
              xOpt += optW;
            }
            y += 6;
            break;
          }
          case "checkbox": {
            doc.setFontSize(8);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            let xOpt = margin + 1;
            for (const opt of fieldOpts) {
              const optW = doc.getTextWidth(opt) + 9;
              if (xOpt + optW > pageWidth - margin) {
                y += 5.5;
                xOpt = margin + 1;
              }
              doc.rect(xOpt, y - 2.5, 3.5, 3.5);
              doc.text(opt, xOpt + 5, y);
              xOpt += optW;
            }
            y += 6;
            break;
          }
          default: {
            doc.line(margin, y + 0.5, pageWidth - margin, y + 0.5);
            y += 6;
            break;
          }
        }
      } else {
        // ── DIGITAL MODE ──
        doc.setFont("helvetica", "normal");
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        const displayValue = getFieldDisplayValue(field, answers[String(field.id)]);

        if (field.fieldType === "boolean") {
          doc.setFontSize(8);
          const val = answers[String(field.id)];
          // Sim
          if (val) {
            doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
            doc.rect(margin + 1, y - 2.5, 3.5, 3.5, "FD");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7);
            doc.text("X", margin + 1.8, y);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.setFontSize(8);
          } else {
            doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
            doc.rect(margin + 1, y - 2.5, 3.5, 3.5);
          }
          doc.text("Sim", margin + 6, y);
          // Nao
          if (!val) {
            doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
            doc.rect(margin + 22, y - 2.5, 3.5, 3.5, "FD");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7);
            doc.text("X", margin + 22.8, y);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.setFontSize(8);
          } else {
            doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
            doc.rect(margin + 22, y - 2.5, 3.5, 3.5);
          }
          doc.text("Nao", margin + 27, y);
          y += 6;

        } else if (field.fieldType === "select") {
          doc.setFontSize(8);
          let xOpt = margin + 1;
          for (const opt of fieldOpts) {
            const optW = doc.getTextWidth(opt) + 8;
            if (xOpt + optW > pageWidth - margin) {
              y += 5.5;
              xOpt = margin + 1;
            }
            if (opt === displayValue) {
              doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
              doc.ellipse(xOpt + 1.5, y - 0.8, 1.5, 1.5, "F");
            } else {
              doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
              doc.ellipse(xOpt + 1.5, y - 0.8, 1.5, 1.5);
            }
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.text(opt, xOpt + 4.5, y);
            xOpt += optW;
          }
          y += 6;

        } else if (field.fieldType === "checkbox") {
          const selectedVals: string[] = Array.isArray(answers[String(field.id)])
            ? answers[String(field.id)]
            : [];
          doc.setFontSize(8);
          let xOpt = margin + 1;
          for (const opt of fieldOpts) {
            const optW = doc.getTextWidth(opt) + 9;
            if (xOpt + optW > pageWidth - margin) {
              y += 5.5;
              xOpt = margin + 1;
            }
            if (selectedVals.includes(opt)) {
              doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
              doc.rect(xOpt, y - 2.5, 3.5, 3.5, "FD");
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(7);
              doc.text("X", xOpt + 0.8, y);
              doc.setTextColor(DARK.r, DARK.g, DARK.b);
              doc.setFontSize(8);
            } else {
              doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
              doc.rect(xOpt, y - 2.5, 3.5, 3.5);
            }
            doc.text(opt, xOpt + 5, y);
            xOpt += optW;
          }
          y += 6;

        } else if (field.fieldType === "textarea") {
          doc.setFontSize(8);
          if (displayValue) {
            const lines = doc.splitTextToSize(displayValue, contentWidth - 6);
            const boxH = Math.max(10, lines.length * 4 + 4);
            y = checkPage(doc, y, boxH + 3, 34);
            doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
            doc.setLineWidth(0.2);
            doc.rect(margin, y, contentWidth, boxH);
            doc.setTextColor(DARK.r, DARK.g, DARK.b);
            doc.text(lines, margin + 3, y + 3.5);
            y += boxH + 3;
          } else {
            doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
            doc.rect(margin, y, contentWidth, 10);
            y += 13;
          }
        } else {
          doc.setFontSize(8);
          doc.setTextColor(DARK.r, DARK.g, DARK.b);
          if (displayValue) {
            doc.text(displayValue, margin + 1, y);
          }
          doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
          doc.setLineWidth(0.15);
          doc.line(margin, y + 2, pageWidth - margin, y + 2);
          y += 6;
        }
      }
    }

    y += 3;
  }

  // ════════════════════════════════════════════════════
  //  NOTES SECTION
  // ════════════════════════════════════════════════════

  y = checkPage(doc, y, 24, 34);

  // Section header
  doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin, y + 7);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text("OBSERVACOES ADICIONAIS", margin + 3, y + 4.8);
  y += 10;

  if (isManual) {
    doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
    doc.setLineWidth(0.15);
    for (let i = 0; i < 5; i++) {
      y = checkPage(doc, y, 7, 34);
      doc.line(margin, y, pageWidth - margin, y);
      y += 7;
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    if (notes) {
      const noteLines = doc.splitTextToSize(notes, contentWidth - 6);
      const boxH = Math.max(12, noteLines.length * 4 + 4);
      y = checkPage(doc, y, boxH + 3, 34);
      doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentWidth, boxH);
      doc.text(noteLines, margin + 3, y + 3.5);
      y += boxH + 3;
    } else {
      doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
      doc.rect(margin, y, contentWidth, 12);
      y += 15;
    }
  }

  // ════════════════════════════════════════════════════
  //  SIGNATURE SECTION
  // ════════════════════════════════════════════════════

  y = checkPage(doc, y, 35, 34);
  y += 12;

  doc.setDrawColor(DARK.r, DARK.g, DARK.b);
  doc.setLineWidth(0.3);

  const signWidth = (contentWidth - 24) / 2;

  // Patient signature
  doc.line(margin, y, margin + signWidth, y);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("Assinatura do Paciente", margin + signWidth / 2, y + 4.5, { align: "center" });

  // Professional signature
  doc.line(margin + signWidth + 24, y, pageWidth - margin, y);
  doc.text("Assinatura do Profissional", margin + signWidth + 24 + signWidth / 2, y + 4.5, {
    align: "center",
  });

  y += 10;
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.setFontSize(7.5);
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

    // Bottom line
    doc.setDrawColor(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);

    if (companyName) {
      doc.text(companyName, margin, pageHeight - 8);
    }
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  // ── Save ──
  const patientName = patient?.name?.replace(/[^a-zA-Z0-9]/g, "_") || "paciente";
  const suffix = isManual ? "manual" : "preenchida";
  doc.save(`anamnese_${suffix}_${patientName}.pdf`);
}
