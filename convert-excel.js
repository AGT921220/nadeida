const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const EXCEL_FILE = path.join(__dirname, "Nadeida.xlsx");
const OUTPUT_FILE = path.join(__dirname, "data.json");
const SHEET_NAME = "Hoja1";

const PERSONAL_BLOCKLIST = [
  "id",
  "correo",
  "email",
  "codigo",
  "código",
  "encuesta",
  "folio",
  "fecha",
  "timestamp",
  "nombre",
];

const OPEN_TEXT_COLUMNS = new Set([
  "¿Qué es lo que más te gusta de trabajar en Yanfeng?",
  "¿Recomendarías a Yanfeng como lugar para trabajar?",
  "¿En qué aspectos crees que podríamos mejorar como empresa?",
  "¿Qué tipo de eventos o actividades te gustaría que se realizaran para mejorar el ambiente laboral?",
  "¿Tienes alguna sugerencia para mejorar la comunicación dentro de la empresa?",
  "¿Qué ideas tienes para que el trabajo en equipo sea mejor?",
]);

const DIMENSION_COLUMNS = [
  "Inicio y Adaptacion",
  "Comunicación y trabajo en equipo",
  "Liderazgo",
  "RELACIÓN CON LOS COMPAÑEROS DE TRABAJO",
  "CONDICIONES DE TRABAJO",
  "Desarrollo y Crecimiento Profesional",
];

function normalizeKey(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\.2$/, "").replace(/2$/, "").replace(/\s+/g, " ").trim();
}

function toNumberIfNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const clean = value.replace(",", ".").trim();
    if (!clean) return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isPossiblySensitiveColumn(key) {
  const lower = key.toLowerCase();
  return PERSONAL_BLOCKLIST.some((x) => lower.includes(x));
}

function isSurveyQuestion(key) {
  const lower = key.toLowerCase();
  if (OPEN_TEXT_COLUMNS.has(key)) return false;
  if (isPossiblySensitiveColumn(key)) return false;
  if (lower.includes("puntuacion") || lower.includes("promedio") || lower.includes("desviación") || lower.includes("desviacion")) return false;
  if (DIMENSION_COLUMNS.some((d) => d.toLowerCase() === lower)) return false;
  return true;
}

function inferNumericColumns(records, keys) {
  const result = [];
  keys.forEach((key) => {
    if (!isSurveyQuestion(key)) return;
    let valid = 0;
    let inRange = 0;
    for (const row of records) {
      const n = toNumberIfNumeric(row[key]);
      if (n === null) continue;
      valid += 1;
      if (n >= 1 && n <= 5) inRange += 1;
    }
    if (valid > 0 && inRange / valid >= 0.8) result.push(key);
  });
  return result;
}

function main() {
  if (!fs.existsSync(EXCEL_FILE)) {
    console.error("No se encontró Nadeida.xlsx en el directorio actual.");
    process.exit(1);
  }

  const workbook = XLSX.readFile(EXCEL_FILE);
  const worksheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) {
    console.error("No se encontró la hoja Hoja1 ni hoja alternativa.");
    process.exit(1);
  }

  const raw = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  const normalized = raw.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => {
      const nk = normalizeKey(k);
      if (!nk) return;
      out[nk] = row[k];
    });
    return out;
  });

  const keys = [...new Set(normalized.flatMap((r) => Object.keys(r)))];
  const questionColumns = inferNumericColumns(normalized, keys);

  const cleanedRecords = normalized
    .filter((r) => Object.values(r).some((v) => v !== null && v !== ""))
    .map((r) => {
      const rec = {};
      for (const k of keys) {
        if (isPossiblySensitiveColumn(k)) continue;
        const v = r[k];
        if (v === null || v === "") continue;
        if (questionColumns.includes(k) || DIMENSION_COLUMNS.includes(k) || k.toLowerCase().includes("promedio")) {
          const n = toNumberIfNumeric(v);
          rec[k] = n === null ? v : n;
        } else {
          rec[k] = typeof v === "string" ? v.trim() : v;
        }
      }
      return rec;
    });

  const output = {
    generatedAt: new Date().toISOString(),
    sourceFile: "Nadeida.xlsx",
    sheet: SHEET_NAME,
    questionColumns,
    dimensionColumns: DIMENSION_COLUMNS.filter((d) => keys.includes(d)),
    openTextColumns: [...OPEN_TEXT_COLUMNS].filter((c) => keys.includes(c)),
    records: cleanedRecords,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`Generado: ${OUTPUT_FILE}`);
  console.log(`Registros: ${cleanedRecords.length}`);
  console.log(`Preguntas numéricas detectadas: ${questionColumns.length}`);
}

main();
