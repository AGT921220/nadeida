const FIELD_MAP = {
  plant: "¿A qué planta perteneces actualmente?",
  personnel: "¿Cuál es la categoría de tu puesto?",
  department: "Departamento",
  supervisor: "¿Quién es tu supervisor o manager directo?",
};

const DIMENSIONS_FALLBACK = [
  "Inicio y Adaptacion",
  "Comunicación y trabajo en equipo",
  "Liderazgo",
  "RELACIÓN CON LOS COMPAÑEROS DE TRABAJO",
  "CONDICIONES DE TRABAJO",
  "Desarrollo y Crecimiento Profesional",
];

const charts = {};
let source = null;
let state = { filters: {} };

const nfmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : "-");
const average = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);

const riskClass = (v) => (v < 3.5 ? "risk-high" : v < 4.2 ? "risk-medium" : "risk-low");
const riskLabel = (v) => (v < 3.5 ? "Alto" : v < 4.2 ? "Medio" : "Bajo");
const kpiColor = (v) => (v >= 4.2 ? "#1c8c4c" : v >= 3.5 ? "#d9a31a" : "#c23a3a");
const OPEN_TEXT_COLUMNS = [
  "¿Qué es lo que más te gusta de trabajar en Yanfeng?",
  "¿Recomendarías a Yanfeng como lugar para trabajar?",
  "¿En qué aspectos crees que podríamos mejorar como empresa?",
  "¿Qué tipo de eventos o actividades te gustaría que se realizaran para mejorar el ambiente laboral?",
  "¿Tienes alguna sugerencia para mejorar la comunicación dentro de la empresa?",
  "¿Qué ideas tienes para que el trabajo en equipo sea mejor?",
];
const LOCAL_SOURCE_KEY = "nadeida.persistedSource.v1";

function sanitize(v) {
  return typeof v === "string" ? v.trim() : v;
}

function normalizeKey(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\.2$/, "").replace(/2$/, "").replace(/\s+/g, " ").trim();
}

function isNumericLikert(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
}

function getRecords() {
  return source?.records || [];
}

function persistSource(data) {
  try {
    localStorage.setItem(LOCAL_SOURCE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn("No se pudo persistir la información local:", err);
    return false;
  }
}

function loadPersistedSource() {
  try {
    const raw = localStorage.getItem(LOCAL_SOURCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.records) || !parsed.records.length) return null;
    return parsed;
  } catch (err) {
    console.warn("No se pudo leer la información persistida:", err);
    return null;
  }
}

function getFieldKey(label) {
  const keys = Object.keys(getRecords()[0] || {});
  const exact = keys.find((k) => k.toLowerCase() === label.toLowerCase());
  if (exact) return exact;
  const l = label.toLowerCase();
  return keys.find((k) => {
    const key = k.toLowerCase();
    if (l.includes("departamento")) return key.includes("departamento");
    if (l.includes("supervisor")) return key.includes("supervisor") || key.includes("manager");
    if (l.includes("planta")) return key.includes("planta");
    if (l.includes("categoría") || l.includes("categoria")) return key.includes("categor") || key.includes("puesto");
    return false;
  }) || label;
}

function getIdKey(records) {
  return Object.keys(records[0] || {})[0] || "";
}

function uniqueValues(records, key) {
  return [...new Set(records.map((r) => sanitize(r[key])).filter(Boolean))].sort();
}

function applyFilters(records) {
  return records.filter((r) =>
    Object.entries(state.filters).every(([k, v]) => {
      if (!v) return true;
      if (k === "__dimension") return true;
      return String(sanitize(r[k])) === String(v);
    })
  );
}

function identifyQuestionColumns(records) {
  if (source?.questionColumns?.length) return source.questionColumns;
  const keys = Object.keys(records[0] || {});
  return keys.filter((k) => {
    const nums = records.map((r) => r[k]).filter((x) => typeof x === "number");
    if (!nums.length) return false;
    const ratio = nums.filter((x) => x >= 1 && x <= 5).length / nums.length;
    return ratio >= 0.8;
  });
}

function identifyDimensionColumns(records) {
  const fromData = source?.dimensionColumns?.filter((k) => records.some((r) => typeof r[k] === "number")) || [];
  if (fromData.length) return fromData;
  return DIMENSIONS_FALLBACK.filter((k) => records.some((r) => typeof r[k] === "number"));
}

function calcOverall(record, questionColumns, dimensionColumns) {
  const fromTotal = record["Puntuacion total (Promedio)"] || record["Total Media"];
  if (isNumericLikert(fromTotal)) return fromTotal;
  const vals = [...questionColumns, ...dimensionColumns].map((c) => record[c]).filter(isNumericLikert);
  return average(vals);
}

function groupBy(records, key) {
  const out = new Map();
  records.forEach((r) => {
    const k = sanitize(r[key]) || "Sin dato";
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  });
  return out;
}

function buildFilters(records, dimensions) {
  const container = document.getElementById("filters");
  container.innerHTML = "";
  const idKey = getIdKey(records);
  const defs = [
    ...(idKey ? [{ key: idKey, label: "ID" }] : []),
    { key: getFieldKey(FIELD_MAP.plant), label: "Planta" },
    { key: getFieldKey(FIELD_MAP.personnel), label: "Tipo de personal" },
    { key: getFieldKey(FIELD_MAP.department), label: "Departamento" },
    { key: getFieldKey(FIELD_MAP.supervisor), label: "Supervisor / manager" },
    { key: "__dimension", label: "Dimensión" },
  ];

  defs.forEach((d) => {
    const col = document.createElement("div");
    col.className = "col-12 col-md-6 col-lg-2";
    const options = d.key === "__dimension" ? dimensions : uniqueValues(records, d.key);
    col.innerHTML = `
      <label class="form-label small">${d.label}</label>
      <select class="form-select form-select-sm" data-key="${d.key}">
        <option value="">Todos</option>
        ${options.map((v) => `<option value="${String(v).replace(/"/g, "&quot;")}">${v}</option>`).join("")}
      </select>
    `;
    container.appendChild(col);
  });

  container.querySelectorAll("select").forEach((s) => {
    s.addEventListener("change", () => {
      state.filters[s.dataset.key] = s.value || "";
      render();
    });
  });
}

function metricByGroup(records, groupKey, valueFn) {
  return [...groupBy(records, groupKey).entries()].map(([name, rows]) => ({
    name,
    count: rows.length,
    avg: average(rows.map(valueFn).filter(Number.isFinite)),
  }));
}

function worstQuestion(records, questionColumns) {
  const q = questionColumns.map((k) => ({
    q: k,
    avg: average(records.map((r) => r[k]).filter(isNumericLikert)),
  })).filter((x) => Number.isFinite(x.avg)).sort((a, b) => a.avg - b.avg)[0];
  return q;
}

function renderKPIs(records, allData, questionColumns, dimensionColumns, plantKey, personnelKey) {
  const container = document.getElementById("kpiCards");
  const total = records.length;
  const globalAvg = average(records.map((r) => calcOverall(r, questionColumns, dimensionColumns)).filter(Number.isFinite));
  const plants = metricByGroup(records, plantKey, (r) => calcOverall(r, questionColumns, dimensionColumns)).filter((x) => Number.isFinite(x.avg));
  const personnel = metricByGroup(records, personnelKey, (r) => calcOverall(r, questionColumns, dimensionColumns)).filter((x) => Number.isFinite(x.avg));
  const catWorst = personnel.slice().sort((a, b) => a.avg - b.avg)[0];
  const bestPlant = plants.slice().sort((a, b) => b.avg - a.avg)[0];
  const worstPlant = plants.slice().sort((a, b) => a.avg - b.avg)[0];
  const worstQ = worstQuestion(records, questionColumns);

  const items = [
    ["Total respuestas", total, globalAvg],
    ["Promedio global", nfmt(globalAvg), globalAvg],
    ["Planta mejor", `${bestPlant?.name || "-"} (${nfmt(bestPlant?.avg)})`, bestPlant?.avg],
    ["Planta peor", `${worstPlant?.name || "-"} (${nfmt(worstPlant?.avg)})`, worstPlant?.avg],
    ["Categoría peor evaluada", `${catWorst?.name || "-"} (${nfmt(catWorst?.avg)})`, catWorst?.avg],
    ["Pregunta peor evaluada", `${worstQ?.q || "-"} (${nfmt(worstQ?.avg)})`, worstQ?.avg],
    ["Tipo de personal con menor promedio", `${catWorst?.name || "-"} (${nfmt(catWorst?.avg)})`, catWorst?.avg],
  ];

  container.innerHTML = items
    .map(([label, value, metric]) => `<div class="col-12 col-md-6 col-lg-3">
        <div class="kpi-card" style="background:${kpiColor(Number.isFinite(metric) ? metric : 3.5)}">
          <div class="small">${label}</div>
          <div class="kpi-value">${value}</div>
        </div>
      </div>`)
    .join("");

  const warning = document.getElementById("lowSampleWarning");
  const lowSamples = metricByGroup(allData, plantKey, (r) => calcOverall(r, questionColumns, dimensionColumns)).filter((x) => x.count < 8);
  warning.textContent = lowSamples.length
    ? `Aviso: muestra baja en ${lowSamples.map((x) => `${x.name} (${x.count})`).join(", ")}.`
    : "";
}

function renderPlantComparison(records, questionColumns, dimensionColumns, plantKey) {
  const ranking = metricByGroup(records, plantKey, (r) => calcOverall(r, questionColumns, dimensionColumns))
    .filter((x) => Number.isFinite(x.avg))
    .sort((a, b) => a.avg - b.avg);
  const minName = ranking[0]?.name;
  const table = document.getElementById("plantRankingTable");
  table.innerHTML = `<thead><tr><th>Planta</th><th>Promedio</th><th>Respuestas</th></tr></thead>
    <tbody>${ranking
      .map((r) => `<tr class="${r.name === minName ? "table-danger" : ""}"><td>${r.name}</td><td>${nfmt(r.avg)}</td><td>${r.count}</td></tr>`)
      .join("")}</tbody>`;

  if (charts.plant) charts.plant.destroy();
  charts.plant = new Chart(document.getElementById("plantChart"), {
    type: "bar",
    data: { labels: ranking.map((r) => r.name), datasets: [{ label: "Promedio", data: ranking.map((r) => r.avg) }] },
    options: { responsive: true, scales: { y: { min: 1, max: 5 } } },
  });
}

function renderDimensions(records, dimensions, plantKey) {
  const byPlant = [...groupBy(records, plantKey).entries()];
  const datasets = byPlant.map(([plant, rows], i) => ({
    label: plant,
    data: dimensions.map((d) => average(rows.map((r) => r[d]).filter(isNumericLikert))),
    borderWidth: 1,
  }));
  if (charts.dimensions) charts.dimensions.destroy();
  charts.dimensions = new Chart(document.getElementById("dimensionsChart"), {
    type: "bar",
    data: { labels: dimensions, datasets },
    options: { responsive: true, scales: { y: { min: 1, max: 5 } } },
  });

  const heat = document.getElementById("dimensionHeatTable");
  heat.innerHTML = `<thead><tr><th>Planta</th>${dimensions.map((d) => `<th>${d}</th>`).join("")}<th>Dimensión crítica</th></tr></thead>
  <tbody>${byPlant
    .map(([plant, rows]) => {
      const vals = dimensions.map((d) => ({ d, v: average(rows.map((r) => r[d]).filter(isNumericLikert)) }));
      const worst = vals.filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v)[0];
      return `<tr><td>${plant}</td>${vals
        .map((x) => `<td class="heat-cell ${riskClass(Number.isFinite(x.v) ? x.v : 3.5)}">${nfmt(x.v)}</td>`)
        .join("")}<td>${worst?.d || "-"}</td></tr>`;
    })
    .join("")}</tbody>`;
}

function renderPersonnel(records, dimensions, plantKey, personnelKey) {
  const plants = [...groupBy(records, plantKey).entries()];
  const types = ["Directo", "Indirecto", "Salary"];
  const datasets = types.map((t) => ({
    label: t,
    data: plants.map(([, rows]) => average(rows.filter((r) => String(r[personnelKey] || "").toLowerCase().includes(t.toLowerCase())).map((r) => calcOverall(r, source.questionColumns || [], dimensions)).filter(Number.isFinite))),
  }));
  if (charts.personnel) charts.personnel.destroy();
  charts.personnel = new Chart(document.getElementById("personnelChart"), {
    type: "bar",
    data: { labels: plants.map(([p]) => p), datasets },
    options: { responsive: true, scales: { y: { min: 1, max: 5 } } },
  });

  const rows = [];
  plants.forEach(([plant, pr]) => {
    const vals = types.map((t) => ({
      t,
      v: average(pr.filter((r) => String(r[personnelKey] || "").toLowerCase().includes(t.toLowerCase())).map((r) => calcOverall(r, source.questionColumns || [], dimensions)).filter(Number.isFinite)),
    })).filter((x) => Number.isFinite(x.v));
    vals.forEach((x) => rows.push({ plant, type: x.t, avg: x.v }));
  });
  document.getElementById("personnelTable").innerHTML = `<thead><tr><th>Planta</th><th>Tipo</th><th>Promedio</th></tr></thead><tbody>${rows
    .sort((a, b) => a.avg - b.avg)
    .map((r) => `<tr class="${riskClass(r.avg)}"><td>${r.plant}</td><td>${r.type}</td><td>${nfmt(r.avg)}</td></tr>`)
    .join("")}</tbody>`;

  const insight = rows.sort((a, b) => a.avg - b.avg)[0];
  document.getElementById("personnelInsight").textContent = insight
    ? `En la planta ${insight.plant}, el personal ${insight.type} tiene el promedio más bajo, especialmente en la dimensión ${dimensions[0] || "crítica"}.`
    : "";
}

function renderCriticalQuestions(records, questionColumns, plantKey, personnelKey) {
  const global = questionColumns
    .map((q) => ({ q, avg: average(records.map((r) => r[q]).filter(isNumericLikert)) }))
    .filter((x) => Number.isFinite(x.avg))
    .sort((a, b) => a.avg - b.avg);
  const top10 = global.slice(0, 10);
  const plants = [...groupBy(records, plantKey).keys()];
  const types = ["Directo", "Indirecto", "Salary"];

  const t = document.getElementById("globalWorstQuestions");
  t.innerHTML = `<thead><tr><th>Pregunta</th><th>Global</th>${plants.map((p) => `<th>${p}</th>`).join("")}<th>Directo</th><th>Indirecto</th><th>Salary</th><th>Riesgo</th></tr></thead>
  <tbody>${top10
    .map((x) => {
      const byPlant = plants.map((p) => average(records.filter((r) => r[plantKey] === p).map((r) => r[x.q]).filter(isNumericLikert)));
      const byType = types.map((tp) => average(records.filter((r) => String(r[personnelKey] || "").toLowerCase().includes(tp.toLowerCase())).map((r) => r[x.q]).filter(isNumericLikert)));
      return `<tr class="${riskClass(x.avg)}"><td>${x.q}</td><td>${nfmt(x.avg)}</td>${byPlant.map((v) => `<td>${nfmt(v)}</td>`).join("")}${byType.map((v) => `<td>${nfmt(v)}</td>`).join("")}<td>${riskLabel(x.avg)}</td></tr>`;
    })
    .join("")}</tbody>`;

  const byPlantDiv = document.getElementById("worstByPlant");
  byPlantDiv.innerHTML = plants
    .map((p) => {
      const top5 = questionColumns
        .map((q) => ({ q, avg: average(records.filter((r) => r[plantKey] === p).map((r) => r[q]).filter(isNumericLikert)) }))
        .filter((x) => Number.isFinite(x.avg))
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 5);
      return `<div class="mb-2"><strong>${p}</strong>: ${top5.map((x) => `${x.q} (${nfmt(x.avg)})`).join(" | ")}</div>`;
    })
    .join("");

  const byPerDiv = document.getElementById("worstByPersonnel");
  byPerDiv.innerHTML = types
    .map((tp) => {
      const top5 = questionColumns
        .map((q) => ({ q, avg: average(records.filter((r) => String(r[personnelKey] || "").toLowerCase().includes(tp.toLowerCase())).map((r) => r[q]).filter(isNumericLikert)) }))
        .filter((x) => Number.isFinite(x.avg))
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 5);
      return `<div class="mb-2"><strong>${tp}</strong>: ${top5.map((x) => `${x.q} (${nfmt(x.avg)})`).join(" | ")}</div>`;
    })
    .join("");
}

function renderPlantDetails(records, dimensions, questionColumns, plantKey, personnelKey) {
  const plants = [...groupBy(records, plantKey).entries()];
  const tabs = document.getElementById("plantTabs");
  const body = document.getElementById("plantTabContent");
  tabs.innerHTML = "";
  body.innerHTML = "";
  plants.forEach(([plant, rows], idx) => {
    const overall = average(rows.map((r) => calcOverall(r, questionColumns, dimensions)).filter(Number.isFinite));
    const worstDim = dimensions.map((d) => ({ d, v: average(rows.map((r) => r[d]).filter(isNumericLikert)) })).filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v)[0];
    const worstQ = questionColumns.map((q) => ({ q, v: average(rows.map((r) => r[q]).filter(isNumericLikert)) })).filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v)[0];
    const types = ["Directo", "Indirecto", "Salary"].map((tp) => ({
      tp,
      v: average(rows.filter((r) => String(r[personnelKey] || "").toLowerCase().includes(tp.toLowerCase())).map((r) => calcOverall(r, questionColumns, dimensions)).filter(Number.isFinite)),
    }));
    const lowestType = types.filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v)[0];
    const topCrit = questionColumns.map((q) => ({ q, v: average(rows.map((r) => r[q]).filter(isNumericLikert)) })).filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v).slice(0, 5);

    tabs.insertAdjacentHTML("beforeend", `<li class="nav-item"><button class="nav-link ${idx === 0 ? "active" : ""}" data-bs-toggle="tab" data-bs-target="#plant-${idx}" type="button">${plant}</button></li>`);
    body.insertAdjacentHTML("beforeend", `<div class="tab-pane fade ${idx === 0 ? "show active" : ""}" id="plant-${idx}">
      <div class="row g-2 mb-2">
        <div class="col-md-3"><div class="metric"><strong>Promedio</strong><br>${nfmt(overall)}</div></div>
        <div class="col-md-3"><div class="metric"><strong>Respuestas</strong><br>${rows.length}</div></div>
        <div class="col-md-3"><div class="metric"><strong>Dimensión más baja</strong><br>${worstDim?.d || "-"}</div></div>
        <div class="col-md-3"><div class="metric"><strong>Pregunta más baja</strong><br>${worstQ?.q || "-"}</div></div>
      </div>
      <div class="small mb-2">Comparativo Directo/Indirecto/Salary: ${types.map((x) => `${x.tp}: ${nfmt(x.v)}`).join(" | ")}</div>
      <div class="small mb-2"><strong>Top preguntas críticas:</strong> ${topCrit.map((x) => `${x.q} (${nfmt(x.v)})`).join(" | ")}</div>
      <div class="alert alert-secondary py-2">
        La planta ${plant} presenta oportunidad de mejora principalmente en ${worstDim?.d || "dimensiones críticas"}. El grupo ${lowestType?.tp || "con menor promedio"} concentra las calificaciones más bajas, especialmente en reactivos relacionados con liderazgo, apoyo y organización del trabajo.
      </div>
    </div>`);
  });
}

function renderOpenComments(records) {
  const cols = source?.openTextColumns || [];
  const text = records.flatMap((r) => cols.map((c) => String(r[c] || "").toLowerCase())).join(" ");
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["para", "como", "este", "esta", "pero", "porque", "trabajo", "empresa"].includes(w));
  const counts = new Map();
  words.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 35);
  document.getElementById("wordCloudList").innerHTML = top.map(([w, c]) => `<span style="font-size:${Math.min(30, 12 + c)}px">${w}</span>`).join("");

  const topics = {
    Comunicación: ["comunic", "inform", "mensaje"],
    Liderazgo: ["jefe", "lider", "supervisor", "gerente"],
    Capacitación: ["capacit", "entren", "inducci"],
    "Ambiente laboral": ["ambiente", "clima", "respeto"],
    "Trabajo en equipo": ["equipo", "colabor", "apoyo"],
    Crecimiento: ["crecimiento", "desarrollo", "promoc", "oportunidad"],
    "Condiciones de trabajo": ["condicion", "seguridad", "herramienta", "area"],
  };
  const snippets = records.flatMap((r) => cols.map((c) => String(r[c] || "").trim()).filter(Boolean)).slice(0, 500);
  const container = document.getElementById("topicsContainer");
  container.innerHTML = Object.entries(topics)
    .map(([topic, keys]) => {
      const matched = snippets.filter((s) => keys.some((k) => s.toLowerCase().includes(k))).slice(0, 2);
      return `<div class="mb-2"><strong>${topic}</strong><br><span class="small">${matched.length ? matched.map((m) => `"${m.slice(0, 130)}..."`).join(" ") : "Sin ejemplos suficientes."}</span></div>`;
    })
    .join("");
}

function renderConclusions(records, questionColumns, dimensions, plantKey) {
  const plants = metricByGroup(records, plantKey, (r) => calcOverall(r, questionColumns, dimensions)).filter((x) => Number.isFinite(x.avg)).sort((a, b) => a.avg - b.avg);
  const dims = dimensions.map((d) => ({ d, v: average(records.map((r) => r[d]).filter(isNumericLikert)) })).filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v);
  const worstQ = questionColumns.map((q) => ({ q, v: average(records.map((r) => r[q]).filter(isNumericLikert)) })).filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v);
  const setList = (id, arr) => (document.getElementById(id).innerHTML = arr.map((x) => `<li>${x}</li>`).join(""));

  setList("findings", [
    `La planta con menor promedio es ${plants[0]?.name || "N/D"} (${nfmt(plants[0]?.avg)}).`,
    `La dimensión más débil global es ${dims[0]?.d || "N/D"} (${nfmt(dims[0]?.v)}).`,
    `La pregunta más crítica global es "${worstQ[0]?.q || "N/D"}" (${nfmt(worstQ[0]?.v)}).`,
  ]);
  setList("risks", [
    `Riesgo de clima laboral en ${dims.slice(0, 2).map((d) => d.d).join(" y ")}.`,
    "Posibles brechas de liderazgo entre áreas y supervisión directa.",
    "Riesgo de rotación en segmentos con promedio menor a 3.5.",
  ]);
  setList("actions", [
    "Reforzar capacitación inicial y proceso de onboarding por planta.",
    "Implementar plan de liderazgo para supervisores y mandos medios.",
    "Establecer rutinas de comunicación interna con seguimiento mensual.",
    "Revisar condiciones de trabajo y recursos en áreas con baja calificación.",
    "Crear sesiones de retroalimentación y trabajo en equipo por turno.",
  ]);
  setList("priorities", [
    `Prioridad alta: ${plants[0]?.name || "N/D"} y ${plants[1]?.name || "N/D"}.`,
    `Prioridad media: ${plants[2]?.name || "N/D"}.`,
    `Temas prioritarios: ${dims.slice(0, 3).map((d) => d.d).join(", ")}.`,
  ]);
}

function render() {
  const all = getRecords();
  const filtered = applyFilters(all);
  const questionColumns = identifyQuestionColumns(all);
  const dimensions = identifyDimensionColumns(all);
  const activeDimensions = state.filters.__dimension
    ? dimensions.filter((d) => d === state.filters.__dimension)
    : dimensions;
  const plantKey = getFieldKey(FIELD_MAP.plant);
  const personnelKey = getFieldKey(FIELD_MAP.personnel);

  const subset = state.filters.__dimension
    ? filtered.map((r) => ({ ...r, "__dimSelected": r[state.filters.__dimension] }))
    : filtered;

  renderKPIs(subset, all, questionColumns, activeDimensions, plantKey, personnelKey);
  renderPlantComparison(subset, questionColumns, activeDimensions, plantKey);
  renderDimensions(subset, activeDimensions, plantKey);
  renderPersonnel(subset, activeDimensions, plantKey, personnelKey);
  renderCriticalQuestions(subset, questionColumns, plantKey, personnelKey);
  renderPlantDetails(subset, activeDimensions, questionColumns, plantKey, personnelKey);
  renderOpenComments(subset);
  renderConclusions(subset, questionColumns, activeDimensions, plantKey);
}

async function init() {
  const uploadSection = document.getElementById("uploadSection");
  const dashboardContent = document.getElementById("dashboardContent");
  const uploadStatus = document.getElementById("uploadStatus");
  const excelInput = document.getElementById("excelInput");
  const loadExcelBtn = document.getElementById("loadExcelBtn");
  const refreshExcelInput = document.getElementById("refreshExcelInput");
  const refreshExcelBtn = document.getElementById("refreshExcelBtn");
  const refreshStatus = document.getElementById("refreshStatus");

  function showUpload(message, isError = true) {
    uploadSection.classList.remove("d-none");
    dashboardContent.classList.add("d-none");
    uploadStatus.textContent = message || "";
    uploadStatus.className = `small mt-2 ${isError ? "error" : "ok"}`;
  }

  function showDashboard() {
    uploadSection.classList.add("d-none");
    dashboardContent.classList.remove("d-none");
  }

  function setRefreshStatus(message, isError = false) {
    if (!refreshStatus) return;
    refreshStatus.textContent = message || "";
    refreshStatus.className = `small mt-2 ${isError ? "error" : "ok"}`;
  }

  function sanitizeRecord(record) {
    const out = {};
    Object.entries(record).forEach(([k, v]) => {
      const nk = normalizeKey(k);
      if (!nk) return;
      let value = v;
      if (typeof value === "string") {
        const num = Number(value.replace(",", ".").trim());
        value = Number.isFinite(num) && value.trim() !== "" ? num : value.trim();
      }
      out[nk] = value;
    });
    return out;
  }

  function inferQuestionColumns(records) {
    const keys = Object.keys(records[0] || {});
    return keys.filter((k) => {
      if (OPEN_TEXT_COLUMNS.includes(k)) return false;
      if (DIMENSIONS_FALLBACK.includes(k)) return false;
      const nums = records.map((r) => r[k]).filter((x) => typeof x === "number");
      if (!nums.length) return false;
      const ratio = nums.filter((x) => x >= 1 && x <= 5).length / nums.length;
      return ratio >= 0.8;
    });
  }

  function loadFromWorkbook(workbook, sourceFileName = "archivo-cargado-manualmente.xlsx") {
    const sheet = workbook.Sheets["Hoja1"] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("No se encontró la hoja Hoja1.");
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const records = raw.map(sanitizeRecord).filter((r) => Object.values(r).some((v) => v !== null && v !== ""));
    if (!records.length) throw new Error("El archivo no contiene registros válidos.");
    source = {
      generatedAt: new Date().toISOString(),
      sourceFile: sourceFileName,
      sheet: "Hoja1",
      questionColumns: inferQuestionColumns(records),
      dimensionColumns: DIMENSIONS_FALLBACK.filter((d) => records.some((r) => typeof r[d] === "number")),
      openTextColumns: OPEN_TEXT_COLUMNS.filter((c) => records.some((r) => typeof r[c] === "string" && r[c].trim())),
      records,
    };
    const persisted = persistSource(source);
    state.filters = {};
    buildFilters(records, identifyDimensionColumns(records));
    render();
    showDashboard();
    uploadStatus.textContent = "";
    setRefreshStatus(
      persisted
        ? `Datos actualizados desde "${sourceFileName}" y guardados localmente.`
        : `Datos actualizados desde "${sourceFileName}". No se pudo guardar localmente.`,
      !persisted
    );
  }

  loadExcelBtn.addEventListener("click", async () => {
    const file = excelInput.files?.[0];
    if (!file) {
      showUpload("Selecciona un archivo Excel antes de analizar.", true);
      return;
    }
    try {
      showUpload("Procesando archivo, espera un momento...", false);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      loadFromWorkbook(workbook, file.name);
    } catch (err) {
      showUpload(`No se pudo procesar el archivo: ${err.message}`, true);
    }
  });

  refreshExcelBtn?.addEventListener("click", async () => {
    const file = refreshExcelInput?.files?.[0];
    if (!file) {
      setRefreshStatus("Selecciona un archivo Excel antes de actualizar.", true);
      return;
    }
    try {
      setRefreshStatus("Procesando archivo...", false);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      loadFromWorkbook(workbook, file.name);
      if (refreshExcelInput) refreshExcelInput.value = "";
    } catch (err) {
      setRefreshStatus(`No se pudo actualizar la información: ${err.message}`, true);
    }
  });

  const persistedSource = loadPersistedSource();
  if (persistedSource) {
    source = persistedSource;
    state.filters = {};
    buildFilters(getRecords(), identifyDimensionColumns(getRecords()));
    render();
    showDashboard();
    setRefreshStatus(
      `Se cargaron datos guardados localmente (${persistedSource.sourceFile || "archivo Excel"}).`
    );
    return;
  }

  try {
    const res = await fetch("data.json");
    if (!res.ok) throw new Error("No se pudo leer data.json");
    source = await res.json();
    const records = getRecords();
    if (!records.length) throw new Error("Sin registros.");
    buildFilters(records, identifyDimensionColumns(records));
    render();
    showDashboard();
    setRefreshStatus("Datos cargados desde data.json. Puedes actualizar con un nuevo Excel.");
  } catch (e) {
    showUpload("No se encontró data.json válido. Puedes cargar un Excel para analizar.", true);
  }
}

init();
