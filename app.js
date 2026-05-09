const state = {
  rows: [],
  columns: [],
  profiles: {},
  numericColumns: [],
  categoricalColumns: [],
  correlationColumns: [],
  currentPivotCsv: "",
  bivariateChart: "auto"
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  workspace: document.querySelector("#workspace"),
  summaryCards: document.querySelector("#summaryCards"),
  typeList: document.querySelector("#typeList"),
  previewTable: document.querySelector("#previewTable"),
  uniColumn: document.querySelector("#uniColumn"),
  uniTitle: document.querySelector("#uniTitle"),
  uniChart: document.querySelector("#uniChart"),
  uniStats: document.querySelector("#uniStats"),
  biX: document.querySelector("#biX"),
  biY: document.querySelector("#biY"),
  chartTypes: document.querySelectorAll(".chart-type"),
  biTitle: document.querySelector("#biTitle"),
  biChart: document.querySelector("#biChart"),
  biNotes: document.querySelector("#biNotes"),
  heatmap: document.querySelector("#heatmap"),
  correlationSummary: document.querySelector("#correlationSummary"),
  correlationColumns: document.querySelector("#correlationColumns"),
  selectAllCorr: document.querySelector("#selectAllCorr"),
  clearCorr: document.querySelector("#clearCorr"),
  pivotRow: document.querySelector("#pivotRow"),
  pivotCol: document.querySelector("#pivotCol"),
  pivotValue: document.querySelector("#pivotValue"),
  pivotAgg: document.querySelector("#pivotAgg"),
  pivotTable: document.querySelector("#pivotTable"),
  qualityTable: document.querySelector("#qualityTable"),
  downloadPivot: document.querySelector("#downloadPivot")
};

const MAX_CATEGORY_ITEMS = 25;
const NUMERIC_THRESHOLD = 0.7;
const MISSING = new Set(["", "na", "n/a", "null", "none", "undefined", "-"]);

els.fileInput.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) readCsvFile(file);
});

["dragenter", "dragover"].forEach(type => {
  els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(type => {
  els.dropZone.addEventListener(type, event => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  });
});

els.dropZone.addEventListener("drop", event => {
  const file = [...event.dataTransfer.files].find(item => item.name.toLowerCase().endsWith(".csv"));
  if (file) readCsvFile(file);
});

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

els.chartTypes.forEach(button => {
  button.addEventListener("click", () => {
    state.bivariateChart = button.dataset.chart;
    els.chartTypes.forEach(item => item.classList.toggle("active", item === button));
    renderBivariate();
  });
});

els.selectAllCorr?.addEventListener("click", () => {
  state.correlationColumns = [...state.numericColumns];
  renderCorrelationColumnSelector();
  renderCorrelation();
});

els.clearCorr?.addEventListener("click", () => {
  state.correlationColumns = [];
  renderCorrelationColumnSelector();
  renderCorrelation();
});

els.correlationColumns?.addEventListener("change", event => {
  if (!event.target.matches("input[type='checkbox']")) return;
  const column = event.target.value;
  if (event.target.checked) {
    state.correlationColumns = [...new Set([...state.correlationColumns, column])];
  } else {
    state.correlationColumns = state.correlationColumns.filter(item => item !== column);
  }
  renderCorrelation();
});

[els.uniColumn, els.biX, els.biY, els.pivotRow, els.pivotCol, els.pivotValue, els.pivotAgg].forEach(control => {
  control.addEventListener("change", () => {
    renderUnivariate();
    renderBivariate();
    renderPivot();
  });
});

els.downloadPivot.addEventListener("click", () => {
  if (!state.currentPivotCsv) return;
  const blob = new Blob([state.currentPivotCsv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pivot_distribution.csv";
  link.click();
  URL.revokeObjectURL(url);
});

function readCsvFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseCsv(String(reader.result || ""));
      if (!parsed.rows.length) {
        alert("The CSV did not contain any data rows.");
        return;
      }
      buildProfile(parsed.rows, parsed.columns);
      renderAll(file.name);
    } catch (error) {
      alert(`Could not parse CSV: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim() !== "")) rows.push(row);

  if (!rows.length) return { columns: [], rows: [] };

  const rawHeaders = rows.shift();
  const seenHeaders = new Map();
  const columns = rawHeaders.map((header, index) => cleanHeader(header, index, seenHeaders));
  const records = rows.map(values => {
    const record = {};
    columns.forEach((column, index) => {
      record[column] = (values[index] ?? "").trim();
    });
    return record;
  });

  return { columns, rows: records };
}

function cleanHeader(header, index, seenHeaders) {
  const base = header.trim() || `Column ${index + 1}`;
  const seen = seenHeaders.get(base) || 0;
  seenHeaders.set(base, seen + 1);
  return seen ? `${base} ${seen + 1}` : base;
}

function buildProfile(rows, columns) {
  state.rows = rows;
  state.columns = columns;
  state.profiles = {};
  state.numericColumns = [];
  state.categoricalColumns = [];
  state.correlationColumns = [];

  columns.forEach(column => {
    const values = rows.map(row => row[column]);
    const present = values.filter(value => !isMissing(value));
    const numeric = present.map(toNumber).filter(Number.isFinite);
    const dates = present.map(value => Date.parse(value)).filter(Number.isFinite);
    const unique = new Set(present);
    const numericShare = present.length ? numeric.length / present.length : 0;
    const dateShare = present.length ? dates.length / present.length : 0;

    let type = "categorical";
    if (present.length && numericShare >= NUMERIC_THRESHOLD) type = "numeric";
    if (type !== "numeric" && present.length && dateShare >= 0.8 && unique.size > 3) type = "datetime";

    const profile = {
      column,
      type,
      count: values.length,
      present: present.length,
      missing: values.length - present.length,
      unique: unique.size,
      values,
      presentValues: present,
      numbers: numeric
    };

    if (type === "numeric") {
      Object.assign(profile, numericStats(numeric));
      profile.buckets = bucketize(numeric);
      state.numericColumns.push(column);
    } else {
      profile.categories = frequency(present, MAX_CATEGORY_ITEMS);
      state.categoricalColumns.push(column);
    }

    state.profiles[column] = profile;
  });
}

function renderAll(fileName) {
  els.dropZone.classList.add("hidden");
  els.workspace.classList.remove("hidden");
  renderControls();
  renderOverview(fileName);
  renderUnivariate();
  renderBivariate();
  renderCorrelation();
  renderPivot();
  renderQuality();
}

function renderControls() {
  fillSelect(els.uniColumn, state.columns);
  fillSelect(els.biX, state.columns);
  fillSelect(els.biY, state.columns);
  fillSelect(els.pivotRow, state.columns);
  fillSelect(els.pivotCol, state.columns);
  fillSelect(els.pivotValue, ["(record count)", ...state.numericColumns]);
  state.correlationColumns = [...state.numericColumns];
  renderCorrelationColumnSelector();

  els.uniColumn.value = state.columns[0] || "";
  els.biX.value = state.numericColumns[0] || state.columns[0] || "";
  els.biY.value = state.numericColumns[1] || state.numericColumns[0] || state.columns[1] || state.columns[0] || "";
  els.pivotRow.value = state.categoricalColumns[0] || state.columns[0] || "";
  els.pivotCol.value = state.categoricalColumns[1] || state.columns[1] || state.columns[0] || "";
  els.pivotValue.value = "(record count)";
}

function renderCorrelationColumnSelector() {
  if (!els.correlationColumns) return;
  if (!state.numericColumns.length) {
    els.correlationColumns.innerHTML = `<div class="empty-state"><span>No numeric columns available</span></div>`;
    return;
  }

  const selected = new Set(state.correlationColumns);
  els.correlationColumns.innerHTML = state.numericColumns.map(column => `
    <label class="column-check" title="${escapeHtml(column)}">
      <input type="checkbox" value="${escapeHtml(column)}" ${selected.has(column) ? "checked" : ""}>
      <span>${escapeHtml(column)}</span>
    </label>
  `).join("");
}

function fillSelect(select, options) {
  select.innerHTML = options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("");
}

function renderOverview(fileName) {
  const missingCells = state.columns.reduce((sum, column) => sum + state.profiles[column].missing, 0);
  const totalCells = state.rows.length * state.columns.length;
  const duplicateRows = countDuplicateRows();
  const metrics = [
    ["File", fileName],
    ["Rows", formatNumber(state.rows.length)],
    ["Columns", formatNumber(state.columns.length)],
    ["Missing cells", `${formatNumber(missingCells)} (${pct(missingCells, totalCells)})`],
    ["Duplicate rows", formatNumber(duplicateRows)]
  ];

  els.summaryCards.innerHTML = metrics.map(([label, value]) => `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `).join("");

  els.typeList.innerHTML = state.columns.map(column => {
    const profile = state.profiles[column];
    return `
      <div class="type-row">
        <span class="type-name" title="${escapeHtml(column)}">${escapeHtml(column)}</span>
        <span class="pill ${profile.type}">${profile.type}</span>
      </div>
    `;
  }).join("");

  els.previewTable.innerHTML = tableHtml(
    state.rows.slice(0, 20).map(row => state.columns.map(column => row[column])),
    state.columns
  );
}

function renderUnivariate() {
  const column = els.uniColumn.value;
  const profile = state.profiles[column];
  if (!profile) return;

  els.uniTitle.textContent = `${column} Distribution`;

  if (profile.type === "numeric") {
    drawBarChart(els.uniChart, profile.buckets.map(item => item.label), profile.buckets.map(item => item.count), {
      color: "#116466",
      xLabel: "Bucket",
      yLabel: "Count"
    });
  } else {
    const categories = profile.categories || frequency(profile.presentValues, MAX_CATEGORY_ITEMS);
    drawBarChart(els.uniChart, categories.map(item => item.label), categories.map(item => item.count), {
      color: profile.type === "datetime" ? "#5551a6" : "#d45d3c",
      xLabel: "Value",
      yLabel: "Count"
    });
  }

  els.uniStats.innerHTML = statRows(profile).map(([label, value, warn]) => `
    <div class="stat-row">
      <span>${escapeHtml(label)}</span>
      <strong class="${warn ? "warn" : ""}">${escapeHtml(String(value))}</strong>
    </div>
  `).join("");
}

function renderBivariate() {
  const x = els.biX.value;
  const y = els.biY.value;
  if (!x || !y) return;

  const xProfile = state.profiles[x];
  const yProfile = state.profiles[y];
  els.biTitle.textContent = `${x} vs ${y}`;
  const chartType = effectiveChartType(state.bivariateChart, xProfile, yProfile);

  if (xProfile?.type === "numeric" && yProfile?.type === "numeric") {
    const points = state.rows.map(row => [toNumber(row[x]), toNumber(row[y])]).filter(pair => pair.every(Number.isFinite));
    if (chartType === "bar") {
      const buckets = bucketAverageByX(x, y);
      drawBarChart(els.biChart, buckets.map(item => item.label), buckets.map(item => item.avg), {
        color: "#0f6b68",
        xLabel: x,
        yLabel: `Avg ${y}`
      });
    } else if (chartType === "line") {
      drawLineChart(els.biChart, linePointsFromPairs(points), x, y, "#0f6b68");
    } else {
      drawScatter(els.biChart, points, x, y);
    }
    renderBivariateNotes([
      ["Chart", chartType],
      ["Usable pairs", formatNumber(points.length)],
      ["Correlation", formatCell(correlation(x, y))]
    ]);
  } else {
    const categorical = xProfile?.type === "numeric" ? y : x;
    const numeric = xProfile?.type === "numeric" ? x : (yProfile?.type === "numeric" ? y : null);
    if (numeric) {
      const grouped = groupNumericByCategory(categorical, numeric);
      if (chartType === "line") {
        drawCategoryLine(els.biChart, grouped.map(item => item.label), grouped.map(item => item.avg), categorical, `Avg ${numeric}`);
      } else {
        drawBarChart(els.biChart, grouped.map(item => item.label), grouped.map(item => item.avg), {
          color: "#0f6b68",
          xLabel: categorical,
          yLabel: `Avg ${numeric}`
        });
      }
      renderBivariateNotes([
        ["Chart", chartType],
        ["Grouped by", categorical],
        ["Measure", `Average ${numeric}`]
      ]);
    } else {
      const counts = crossTabCounts(x, y);
      if (chartType === "line") {
        drawGroupedLines(els.biChart, counts);
      } else {
        drawGroupedBars(els.biChart, counts);
      }
      renderBivariateNotes([
        ["Chart", chartType],
        ["X groups", formatNumber(counts.labels.length)],
        ["Series", formatNumber(counts.series.length)]
      ]);
    }
  }
}

function renderBivariateNotes(items) {
  if (!els.biNotes) return;
  els.biNotes.innerHTML = items.map(([label, value]) => `
    <div class="insight-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderCorrelation() {
  if (!els.heatmap || !els.correlationSummary) return;
  const selectedColumns = state.correlationColumns.filter(column => state.numericColumns.includes(column));
  const pairs = correlationPairs(selectedColumns);

  if (state.numericColumns.length < 2) {
    els.correlationSummary.innerHTML = `
      <p class="correlation-lead">Need at least two numeric columns to calculate correlations.</p>
    `;
    drawCorrelationHeatmap(els.heatmap, selectedColumns);
    return;
  }

  if (selectedColumns.length < 2) {
    els.correlationSummary.innerHTML = `
      <p class="correlation-lead">Select at least two numeric columns to build the correlation heatmap.</p>
    `;
    drawCorrelationHeatmap(els.heatmap, selectedColumns);
    return;
  }

  if (!pairs.length) {
    els.correlationSummary.innerHTML = `
      <p class="correlation-lead">No valid numeric pairs were available after removing missing values.</p>
    `;
    drawCorrelationHeatmap(els.heatmap, selectedColumns);
    return;
  }

  const top = pairs.slice(0, 5);
  const strongest = top[0];
  const nextStrongest = top.slice(1, 4).map(pair => `${pair.a} and ${pair.b} (${formatCorrelation(pair.value)})`);
  const lead = nextStrongest.length
    ? `Across ${selectedColumns.length} selected columns, strongest correlation is between ${strongest.a} and ${strongest.b} (${formatCorrelation(strongest.value)}). Next strongest: ${nextStrongest.join("; ")}.`
    : `Across ${selectedColumns.length} selected columns, strongest correlation is between ${strongest.a} and ${strongest.b} (${formatCorrelation(strongest.value)}).`;
  els.correlationSummary.innerHTML = `
    <p class="correlation-lead">${escapeHtml(lead)}</p>
    ${top.map((pair, index) => `
      <article class="correlation-card">
        <span>#${index + 1} ${escapeHtml(describeStrength(pair.value))}</span>
        <strong>${escapeHtml(pair.a)} vs ${escapeHtml(pair.b)}</strong>
        <span>r = ${escapeHtml(formatCorrelation(pair.value))}</span>
      </article>
    `).join("")}
  `;
  drawCorrelationHeatmap(els.heatmap, selectedColumns);
}

function renderPivot() {
  const rowCol = els.pivotRow.value;
  const colCol = els.pivotCol.value;
  const valueCol = els.pivotValue.value === "(record count)" ? null : els.pivotValue.value;
  const agg = els.pivotAgg.value;
  if (!rowCol || !colCol) return;

  const rowValues = topValuesForPivot(rowCol);
  const colValues = topValuesForPivot(colCol);
  const percentMode = agg === "row_pct" || agg === "col_pct";
  const baseAgg = percentMode ? (valueCol ? "sum" : "count") : agg;
  const matrix = rowValues.map(rowValue => {
    return colValues.map(colValue => aggregatePivot(rowCol, rowValue, colCol, colValue, valueCol, baseAgg, rowValues, colValues));
  });

  const rowTotals = matrix.map(row => totalForAggregation(row, baseAgg, valueCol));
  const colTotals = colValues.map((_, colIndex) => {
    const values = matrix.map(row => row[colIndex]).filter(Number.isFinite);
    return totalForAggregation(values, baseAgg, valueCol);
  });
  const grandTotal = totalForAggregation(matrix.flat().filter(Number.isFinite), baseAgg, valueCol);
  const displayMatrix = percentMode ? matrix.map((row, rowIndex) => {
    return row.map((value, colIndex) => {
      const denominator = agg === "row_pct" ? rowTotals[rowIndex] : colTotals[colIndex];
      return denominator ? value / denominator : 0;
    });
  }) : matrix;

  const headers = [rowCol, ...colValues, "Total"];
  const body = displayMatrix.map((row, index) => {
    const total = percentMode ? (agg === "row_pct" ? 1 : (grandTotal ? rowTotals[index] / grandTotal : 0)) : rowTotals[index];
    return [rowValues[index], ...row.map(value => formatPivotCell(value, percentMode)), formatPivotCell(total, percentMode)];
  });

  const totalRow = percentMode
    ? colTotals.map(total => agg === "col_pct" ? 1 : (grandTotal ? total / grandTotal : 0))
    : colTotals;
  body.push(["Total", ...totalRow.map(value => formatPivotCell(value, percentMode)), formatPivotCell(percentMode ? 1 : grandTotal, percentMode)]);

  els.pivotTable.innerHTML = tableHtml(body, headers);
  state.currentPivotCsv = toCsv([headers, ...body]);
}

function renderQuality() {
  const headers = ["Column", "Type", "Missing", "Missing %", "Unique", "Distinct %", "Min", "Max", "Mean"];
  const body = state.columns.map(column => {
    const profile = state.profiles[column];
    return [
      column,
      profile.type,
      profile.missing,
      pct(profile.missing, profile.count),
      profile.unique,
      pct(profile.unique, profile.present),
      profile.type === "numeric" ? formatCell(profile.min) : "",
      profile.type === "numeric" ? formatCell(profile.max) : "",
      profile.type === "numeric" ? formatCell(profile.mean) : ""
    ];
  });
  els.qualityTable.innerHTML = tableHtml(body, headers);
}

function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === tabName));
  requestAnimationFrame(() => {
    renderUnivariate();
    renderBivariate();
    renderCorrelation();
  });
}

function statRows(profile) {
  const rows = [
    ["Type", profile.type],
    ["Rows", formatNumber(profile.count)],
    ["Present", formatNumber(profile.present)],
    ["Missing", `${formatNumber(profile.missing)} (${pct(profile.missing, profile.count)})`, profile.missing > 0],
    ["Unique", formatNumber(profile.unique)]
  ];

  if (profile.type === "numeric") {
    rows.push(
      ["Min", formatCell(profile.min)],
      ["Max", formatCell(profile.max)],
      ["Mean", formatCell(profile.mean)],
      ["Mode", formatCell(profile.mode)],
      ["25th percentile", formatCell(profile.p25)],
      ["Median", formatCell(profile.median)],
      ["50th percentile", formatCell(profile.p50)],
      ["75th percentile", formatCell(profile.p75)],
      ["95th percentile", formatCell(profile.p95)],
      ["Std dev", formatCell(profile.std)]
    );
  } else {
    const top = profile.categories?.[0];
    rows.push(["Mode", top ? `${top.label} (${top.count})` : ""]);
  }
  return rows;
}

function isMissing(value) {
  return value == null || MISSING.has(String(value).trim().toLowerCase());
}

function toNumber(value) {
  if (isMissing(value)) return NaN;
  const normalized = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (normalized === "") return NaN;
  return Number(normalized);
}

function numericStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = count ? sum / count : NaN;
  const variance = count > 1 ? sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (count - 1) : 0;
  return {
    min: count ? sorted[0] : NaN,
    max: count ? sorted[count - 1] : NaN,
    mean,
    mode: mode(values),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    std: Math.sqrt(variance),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75)
  };
}

function mode(values) {
  if (!values.length) return NaN;
  const counts = new Map();
  values.forEach(value => {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const [label] = [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
  return Number(label);
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function bucketize(values) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: formatCell(min), count: values.length }];
  const bucketCount = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = min + index * width;
    const end = index === bucketCount - 1 ? max : start + width;
    return { start, end, count: 0, label: `${formatCell(start)} - ${formatCell(end)}` };
  });
  values.forEach(value => {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    buckets[index].count += 1;
  });
  return buckets;
}

function frequency(values, limit = 20) {
  const map = new Map();
  values.forEach(value => map.set(value, (map.get(value) || 0) + 1));
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit).map(([label, count]) => ({ label, count }));
  const other = sorted.slice(limit).reduce((sum, item) => sum + item[1], 0);
  if (other) top.push({ label: "Other", count: other });
  return top;
}

function topValuesForPivot(column) {
  const profile = state.profiles[column];
  if (profile.type === "numeric") {
    return profile.buckets.map(bucket => bucket.label);
  }
  return frequency(profile.presentValues, 12).map(item => item.label);
}

function valueBucket(column, value, allowedLabels = null) {
  const profile = state.profiles[column];
  if (profile.type !== "numeric") {
    const label = value || "(missing)";
    return allowedLabels && !allowedLabels.includes(label) && allowedLabels.includes("Other") ? "Other" : label;
  }
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "(missing)";
  return profile.buckets.find(bucket => number >= bucket.start && number <= bucket.end)?.label || "(other)";
}

function aggregatePivot(rowCol, rowValue, colCol, colValue, valueCol, agg, rowLabels, colLabels) {
  const matches = state.rows.filter(row => {
    return valueBucket(rowCol, row[rowCol], rowLabels) === rowValue && valueBucket(colCol, row[colCol], colLabels) === colValue;
  });
  if (!valueCol || agg === "count") return matches.length;
  return aggregateSeries(matches.map(row => toNumber(row[valueCol])).filter(Number.isFinite), agg);
}

function totalForAggregation(values, agg, valueCol) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return 0;
  if (valueCol && agg !== "count") return aggregateSeries(clean, agg);
  return clean.reduce((sum, value) => sum + value, 0);
}

function formatPivotCell(value, percentMode) {
  if (percentMode) return `${(value * 100).toFixed(1)}%`;
  return formatCell(value);
}

function aggregateSeries(values, agg) {
  if (!values.length) return 0;
  if (agg === "sum") return values.reduce((a, b) => a + b, 0);
  if (agg === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  if (agg === "min") return Math.min(...values);
  if (agg === "max") return Math.max(...values);
  return values.length;
}

function groupNumericByCategory(categoryColumn, numericColumn) {
  const groups = new Map();
  const labels = topValuesForPivot(categoryColumn);
  state.rows.forEach(row => {
    const label = valueBucket(categoryColumn, row[categoryColumn], labels);
    const value = toNumber(row[numericColumn]);
    if (!Number.isFinite(value)) return;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(value);
  });
  return [...groups.entries()]
    .map(([label, values]) => ({ label, avg: aggregateSeries(values, "avg"), count: values.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CATEGORY_ITEMS);
}

function crossTabCounts(x, y) {
  const xValues = topValuesForPivot(x).slice(0, 8);
  const yValues = topValuesForPivot(y).slice(0, 5);
  const series = yValues.map(label => ({ label, values: xValues.map(() => 0) }));
  state.rows.forEach(row => {
    const xLabel = valueBucket(x, row[x], xValues);
    const yLabel = valueBucket(y, row[y], yValues);
    const xIndex = xValues.indexOf(xLabel);
    const yIndex = yValues.indexOf(yLabel);
    if (xIndex >= 0 && yIndex >= 0) series[yIndex].values[xIndex] += 1;
  });
  return { labels: xValues, series };
}

function countDuplicateRows() {
  const seen = new Set();
  let duplicates = 0;
  state.rows.forEach(row => {
    const key = state.columns.map(column => row[column]).join("\u001f");
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  });
  return duplicates;
}

function correlation(a, b) {
  const pairs = state.rows.map(row => [toNumber(row[a]), toNumber(row[b])]).filter(pair => pair.every(Number.isFinite));
  if (pairs.length < 2) return NaN;
  const xs = pairs.map(pair => pair[0]);
  const ys = pairs.map(pair => pair[1]);
  const meanX = aggregateSeries(xs, "avg");
  const meanY = aggregateSeries(ys, "avg");
  const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - meanX) * (pair[1] - meanY), 0);
  const denomX = Math.sqrt(xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0));
  const denomY = Math.sqrt(ys.reduce((sum, value) => sum + (value - meanY) ** 2, 0));
  return denomX && denomY ? numerator / (denomX * denomY) : NaN;
}

function correlationPairs(columns = state.numericColumns) {
  const pairs = [];
  for (let i = 0; i < columns.length; i += 1) {
    for (let j = i + 1; j < columns.length; j += 1) {
      const value = correlation(columns[i], columns[j]);
      if (Number.isFinite(value)) {
        pairs.push({ a: columns[i], b: columns[j], value });
      }
    }
  }
  return pairs.sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
}

function formatCorrelation(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function describeStrength(value) {
  const abs = Math.abs(value);
  const direction = value >= 0 ? "positive" : "negative";
  if (abs >= 0.8) return `Very strong ${direction}`;
  if (abs >= 0.6) return `Strong ${direction}`;
  if (abs >= 0.4) return `Moderate ${direction}`;
  if (abs >= 0.2) return `Weak ${direction}`;
  return `Very weak ${direction}`;
}

function effectiveChartType(requested, xProfile, yProfile) {
  if (requested === "auto") {
    return xProfile?.type === "numeric" && yProfile?.type === "numeric" ? "scatter" : "bar";
  }
  if (requested === "scatter" && !(xProfile?.type === "numeric" && yProfile?.type === "numeric")) {
    return "bar";
  }
  return requested;
}

function bucketAverageByX(xColumn, yColumn) {
  const profile = state.profiles[xColumn];
  if (!profile?.buckets?.length) return [];
  return profile.buckets.map(bucket => {
    const values = state.rows
      .filter(row => valueBucket(xColumn, row[xColumn]) === bucket.label)
      .map(row => toNumber(row[yColumn]))
      .filter(Number.isFinite);
    return {
      label: bucket.label,
      avg: aggregateSeries(values, "avg")
    };
  });
}

function linePointsFromPairs(points) {
  return [...points]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 1000);
}

function drawBarChart(canvas, labels, values, options = {}) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const pad = { left: 54, right: 18, top: 18, bottom: 72 };
  clear(ctx, width, height);
  drawAxes(ctx, width, height, pad);

  const max = Math.max(...values, 1);
  const innerWidth = width - pad.left - pad.right;
  const barWidth = Math.max(8, innerWidth / Math.max(labels.length, 1) * 0.72);
  const gap = innerWidth / Math.max(labels.length, 1);

  values.forEach((value, index) => {
    const x = pad.left + index * gap + (gap - barWidth) / 2;
    const barHeight = (height - pad.top - pad.bottom) * (value / max);
    const y = height - pad.bottom - barHeight;
    ctx.fillStyle = options.color || "#116466";
    ctx.fillRect(x, y, barWidth, barHeight);
  });

  drawYAxisLabels(ctx, max, width, height, pad);
  drawRotatedLabels(ctx, labels, width, height, pad, gap);
}

function drawGroupedBars(canvas, data) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const pad = { left: 54, right: 18, top: 22, bottom: 76 };
  clear(ctx, width, height);
  drawAxes(ctx, width, height, pad);

  const palette = ["#116466", "#d45d3c", "#5551a6", "#6b8e23", "#b05b9f"];
  const max = Math.max(...data.series.flatMap(item => item.values), 1);
  const groupWidth = (width - pad.left - pad.right) / Math.max(data.labels.length, 1);
  const barWidth = Math.max(5, groupWidth / Math.max(data.series.length + 1, 2));

  data.labels.forEach((label, xIndex) => {
    data.series.forEach((series, sIndex) => {
      const value = series.values[xIndex];
      const x = pad.left + xIndex * groupWidth + sIndex * barWidth + barWidth * 0.5;
      const barHeight = (height - pad.top - pad.bottom) * (value / max);
      ctx.fillStyle = palette[sIndex % palette.length];
      ctx.fillRect(x, height - pad.bottom - barHeight, barWidth * 0.82, barHeight);
    });
  });

  drawYAxisLabels(ctx, max, width, height, pad);
  drawRotatedLabels(ctx, data.labels, width, height, pad, groupWidth);
  drawLegend(ctx, data.series.map(item => item.label), palette, pad.left, 14);
}

function drawScatter(canvas, points, xLabel, yLabel) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const pad = { left: 58, right: 20, top: 18, bottom: 48 };
  clear(ctx, width, height);
  drawAxes(ctx, width, height, pad);

  if (!points.length) {
    drawEmpty(ctx, width, height, "No numeric pairs");
    return;
  }

  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  points.slice(0, 5000).forEach(point => {
    const x = scale(point[0], minX, maxX, pad.left, width - pad.right);
    const y = scale(point[1], minY, maxY, height - pad.bottom, pad.top);
    ctx.fillStyle = "rgba(17, 100, 102, 0.58)";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#65717f";
  ctx.font = "12px system-ui";
  ctx.fillText(xLabel, width - pad.right - 90, height - 12);
  ctx.save();
  ctx.translate(14, pad.top + 100);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawLineChart(canvas, points, xLabel, yLabel, color = "#0f6b68") {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const pad = { left: 58, right: 20, top: 18, bottom: 50 };
  clear(ctx, width, height);
  drawAxes(ctx, width, height, pad);

  if (!points.length) {
    drawEmpty(ctx, width, height, "No numeric pairs");
    return;
  }

  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = scale(point[0], minX, maxX, pad.left, width - pad.right);
    const y = scale(point[1], minY, maxY, height - pad.bottom, pad.top);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.filter((_, index) => index % Math.ceil(points.length / 80) === 0).forEach(point => {
    const x = scale(point[0], minX, maxX, pad.left, width - pad.right);
    const y = scale(point[1], minY, maxY, height - pad.bottom, pad.top);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  drawYAxisLabels(ctx, Math.max(...ys, 1), width, height, pad);
  ctx.fillStyle = "#65717f";
  ctx.font = "12px system-ui";
  ctx.fillText(xLabel, width - pad.right - 90, height - 12);
  ctx.save();
  ctx.translate(14, pad.top + 100);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawCategoryLine(canvas, labels, values, xLabel, yLabel) {
  const points = values.map((value, index) => [index, value]);
  drawLineChart(canvas, points, xLabel, yLabel, "#c95735");
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas.getBoundingClientRect();
  const pad = { left: 58, right: 20, top: 18, bottom: 50 };
  const gap = (width - pad.left - pad.right) / Math.max(labels.length, 1);
  drawRotatedLabels(ctx, labels, width, height, pad, gap);
}

function drawGroupedLines(canvas, data) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const pad = { left: 54, right: 18, top: 24, bottom: 76 };
  const palette = ["#0f6b68", "#c95735", "#5551a6", "#6b8e23", "#b05b9f"];
  const max = Math.max(...data.series.flatMap(item => item.values), 1);
  const gap = (width - pad.left - pad.right) / Math.max(data.labels.length - 1, 1);

  clear(ctx, width, height);
  drawAxes(ctx, width, height, pad);
  drawYAxisLabels(ctx, max, width, height, pad);

  data.series.forEach((series, sIndex) => {
    ctx.strokeStyle = palette[sIndex % palette.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.values.forEach((value, index) => {
      const x = pad.left + index * gap;
      const y = scale(value, 0, max, height - pad.bottom, pad.top);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    series.values.forEach((value, index) => {
      const x = pad.left + index * gap;
      const y = scale(value, 0, max, height - pad.bottom, pad.top);
      ctx.fillStyle = palette[sIndex % palette.length];
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  drawRotatedLabels(ctx, data.labels, width, height, pad, Math.max(gap, 1));
  drawLegend(ctx, data.series.map(item => item.label), palette, pad.left, 14);
}

function drawCorrelationHeatmap(canvas, selectedColumns = state.correlationColumns) {
  const columns = selectedColumns.filter(column => state.numericColumns.includes(column)).slice(0, 14);
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  clear(ctx, width, height);

  if (columns.length < 2) {
    drawEmpty(ctx, width, height, "Select at least two numeric columns");
    return;
  }

  const pad = { left: 168, right: 38, top: 34, bottom: 138 };
  const availableWidth = width - pad.left - pad.right;
  const availableHeight = height - pad.top - pad.bottom;
  const size = Math.max(28, Math.min(availableWidth / columns.length, availableHeight / columns.length));
  const matrixWidth = size * columns.length;
  const matrixHeight = size * columns.length;
  const originX = pad.left + Math.max(0, (availableWidth - matrixWidth) / 2);
  const originY = pad.top;

  ctx.font = "12px system-ui";
  ctx.textBaseline = "middle";

  columns.forEach((rowName, row) => {
    columns.forEach((colName, col) => {
      const value = rowName === colName ? 1 : correlation(rowName, colName);
      const x = originX + col * size;
      const y = originY + row * size;
      ctx.fillStyle = rowName === colName ? "#dce7e8" : corrColor(value);
      ctx.fillRect(x, y, size - 2, size - 2);
      ctx.fillStyle = Math.abs(value) > 0.62 ? "#ffffff" : "#253340";
      ctx.textAlign = "center";
      ctx.fillText(Number.isFinite(value) ? value.toFixed(2) : "-", x + size / 2, y + size / 2);
    });
  });

  ctx.fillStyle = "#34404c";
  ctx.textAlign = "right";
  columns.forEach((column, index) => {
    ctx.fillText(truncate(column, 22), originX - 12, originY + index * size + size / 2);
  });

  ctx.textAlign = "right";
  ctx.save();
  columns.forEach((column, index) => {
    ctx.save();
    ctx.translate(originX + index * size + size / 2, originY + matrixHeight + 18);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(truncate(column, 22), 0, 0);
    ctx.restore();
  });
  ctx.restore();

  drawCorrelationLegend(ctx, originX, originY + matrixHeight + 86, Math.min(320, matrixWidth));
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function drawAxes(ctx, width, height, pad) {
  ctx.strokeStyle = "#d9dee5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();
}

function drawYAxisLabels(ctx, max, width, height, pad) {
  ctx.fillStyle = "#65717f";
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = max * (i / 4);
    const y = height - pad.bottom - (height - pad.top - pad.bottom) * (i / 4);
    ctx.fillText(formatCell(value), pad.left - 8, y);
    ctx.strokeStyle = "#eef1f3";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }
}

function drawRotatedLabels(ctx, labels, width, height, pad, gap) {
  ctx.fillStyle = "#34404c";
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  labels.forEach((label, index) => {
    const x = pad.left + index * gap + gap / 2;
    ctx.save();
    ctx.translate(x, height - pad.bottom + 12);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(truncate(String(label), 18), 0, 0);
    ctx.restore();
  });
}

function drawLegend(ctx, labels, palette, x, y) {
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  labels.forEach((label, index) => {
    const left = x + index * 110;
    ctx.fillStyle = palette[index % palette.length];
    ctx.fillRect(left, y, 10, 10);
    ctx.fillStyle = "#34404c";
    ctx.fillText(truncate(label, 12), left + 14, y + 9);
  });
}

function drawEmpty(ctx, width, height, message) {
  ctx.fillStyle = "#65717f";
  ctx.font = "14px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);
}

function corrColor(value) {
  if (!Number.isFinite(value)) return "#eef1f3";
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped >= 0) {
    return blendColor([244, 248, 248], [15, 107, 104], clamped);
  }
  return blendColor([244, 248, 248], [201, 87, 53], Math.abs(clamped));
}

function blendColor(start, end, amount) {
  const channel = index => Math.round(start[index] + (end[index] - start[index]) * amount);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function drawCorrelationLegend(ctx, x, y, width) {
  const height = 10;
  const steps = Math.max(60, Math.floor(width));
  for (let index = 0; index < steps; index += 1) {
    const value = -1 + (index / (steps - 1)) * 2;
    ctx.fillStyle = corrColor(value);
    ctx.fillRect(x + (index / steps) * width, y, width / steps + 1, height);
  }
  ctx.strokeStyle = "#dce3e7";
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#65717f";
  ctx.font = "11px system-ui";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("-1 negative", x, y + 16);
  ctx.textAlign = "center";
  ctx.fillText("0", x + width / 2, y + 16);
  ctx.textAlign = "right";
  ctx.fillText("+1 positive", x + width, y + 16);
}

function scale(value, min, max, outMin, outMax) {
  if (min === max) return (outMin + outMax) / 2;
  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}

function tableHtml(rows, headers) {
  const numericIndexes = headers.map((_, index) => rows.every(row => row[index] === "" || Number.isFinite(Number(String(row[index]).replace(/,/g, "")))));
  return `
    <table>
      <thead>
        <tr>${headers.map((header, index) => `<th class="${numericIndexes[index] ? "numeric" : ""}">${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `<tr>${headers.map((_, index) => `<td class="${numericIndexes[index] ? "numeric" : ""}">${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function toCsv(rows) {
  return rows.map(row => row.map(value => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}

function formatCell(value) {
  if (!Number.isFinite(Number(value))) return String(value ?? "");
  const number = Number(value);
  return Math.abs(number) >= 1000 ? number.toLocaleString(undefined, { maximumFractionDigits: 2 }) : number.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatNumber(value) {
  return Number(value).toLocaleString();
}

function pct(part, total) {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function truncate(value, length) {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}...` : value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("resize", () => {
  if (!state.rows.length) return;
  renderUnivariate();
  renderBivariate();
  renderCorrelation();
});
