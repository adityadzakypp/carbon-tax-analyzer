/**
 * Carbon Tax Analyzer – script.js
 * Loads data.json, handles filtering, KPI computation, Chart.js rendering,
 * and sortable/searchable table.
 *
 * Architecture:
 *  1. fetchData()        – load data.json once
 *  2. applyFilters()     – produce a filtered subset from raw data
 *  3. renderKPIs()       – update 5 KPI cards
 *  4. renderCharts()     – rebuild all 6 Chart.js canvases
 *  5. renderTable()      – rebuild sortable/searchable table rows
 *  6. Event wiring       – filter inputs, table sort/search, dropdown
 */

"use strict";

/* ============================================================
   PALETTE & SHARED CONFIG
   ============================================================ */
const COLORS = {
  emerald: "#10b981",
  blue:    "#3b82f6",
  violet:  "#8b5cf6",
  amber:   "#f59e0b",
  rose:    "#f43f5e",
  slate:   "#64748b",
  teal:    "#14b8a6",
  orange:  "#f97316",
  indigo:  "#6366f1",
  pink:    "#ec4899",
};

const BAR_COLOR_POSITIVE  = "rgba(16,185,129,0.82)";
const BAR_HOVER_POSITIVE  = "rgba(16,185,129,1)";
const BAR_COLOR_COVERAGE  = "rgba(99,102,241,0.82)";
const BAR_HOVER_COVERAGE  = "rgba(99,102,241,1)";
const BAR_COLOR_EFF       = "rgba(245,158,11,0.82)";
const BAR_HOVER_EFF       = "rgba(245,158,11,1)";
const EU_ETS_COLOR        = "#f59e0b";

Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size   = 11;
Chart.defaults.color       = "#6b7280";

/* ============================================================
   GLOBAL STATE
   ============================================================ */
let rawData       = [];   // all 24 jurisdictions
let euEtsRef      = null; // EU ETS reference object
let filteredData  = [];   // currently visible subset
let chartInstances = {};  // { id: Chart }

// Table sort state
let sortCol = "carbon_tax_rate_eur";
let sortDir = "desc";

/* ============================================================
   1. DATA LOADING
   ============================================================ */
async function fetchData() {
  try {
    const resp = await fetch("data.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    rawData  = json.jurisdictions;
    euEtsRef = json.eu_ets_reference;
    buildJurisdictionDropdown();
    applyFilters();
  } catch (err) {
    document.querySelector("main").innerHTML =
      `<div class="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
        <strong>Failed to load data.json:</strong> ${err.message}<br/>
        Ensure you are serving the project via a local HTTP server (e.g. <code>npx serve .</code>).
       </div>`;
  }
}

/* ============================================================
   2. FILTERING
   ============================================================ */
function getFilters() {
  const selectedJur = getSelectedJurisdictions();
  const rateMin  = parseFloat(document.getElementById("rate-min").value);
  const rateMax  = parseFloat(document.getElementById("rate-max").value);
  const covMin   = parseFloat(document.getElementById("cov-min").value);
  const covMax   = parseFloat(document.getElementById("cov-max").value);
  const yearMin  = parseInt(document.getElementById("year-min").value);
  const yearMax  = parseInt(document.getElementById("year-max").value);
  const otherPrice = document.getElementById("filter-other-price").value;
  return { selectedJur, rateMin, rateMax, covMin, covMax, yearMin, yearMax, otherPrice };
}

function applyFilters() {
  const f = getFilters();
  filteredData = rawData.filter(d => {
    if (f.selectedJur.length > 0 && !f.selectedJur.includes(d.id)) return false;
    if (!isNaN(f.rateMin) && d.carbon_tax_rate_eur < f.rateMin) return false;
    if (!isNaN(f.rateMax) && d.carbon_tax_rate_eur > f.rateMax) return false;
    if (!isNaN(f.covMin)  && d.ghg_coverage_pct < f.covMin)    return false;
    if (!isNaN(f.covMax)  && d.ghg_coverage_pct > f.covMax)    return false;
    if (!isNaN(f.yearMin) && d.year_of_implementation < f.yearMin) return false;
    if (!isNaN(f.yearMax) && d.year_of_implementation > f.yearMax) return false;
    if (f.otherPrice && d.other_carbon_price_active !== f.otherPrice) return false;
    return true;
  });

  // Update header badge
  document.getElementById("filtered-count").textContent =
    filteredData.length + " / " + rawData.length + " jurisdictions";

  renderKPIs();
  renderCharts();
  renderTable();
}

/* ============================================================
   3. KPI CARDS
   ============================================================ */
function fmt(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function renderKPIs() {
  const n = filteredData.length;
  document.getElementById("kpi-count").textContent = n;

  if (n < 1) {
    document.getElementById("kpi-avg-rate").textContent     = "—";
    document.getElementById("kpi-avg-cov").textContent      = "—";
    document.getElementById("kpi-other-price").textContent  = "—";
    document.getElementById("kpi-year-range").textContent   = "—";
    return;
  }

  // Avg tax rate (EUR only)
  const avgRate = filteredData.reduce((s, d) => s + d.carbon_tax_rate_eur, 0) / n;
  document.getElementById("kpi-avg-rate").textContent = "€" + fmt(avgRate);

  // Avg GHG coverage
  const avgCov = filteredData.reduce((s, d) => s + d.ghg_coverage_pct, 0) / n;
  document.getElementById("kpi-avg-cov").textContent = fmt(avgCov, 1) + "%";

  // Count with other instrument
  const withOther = filteredData.filter(d => d.other_carbon_price_active !== "No").length;
  document.getElementById("kpi-other-price").textContent = withOther;

  // Year range
  const years = filteredData.map(d => d.year_of_implementation);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  document.getElementById("kpi-year-range").textContent = minY === maxY ? minY : minY + "–" + maxY;
}

/* ============================================================
   4. CHARTS
   ============================================================ */
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// ---- 4a. Carbon Tax Rate Ranking (horizontal bar) ----
function renderRanking() {
  destroyChart("ranking");
  const sorted = [...filteredData].sort((a, b) => b.carbon_tax_rate_eur - a.carbon_tax_rate_eur);
  const labels = sorted.map(d => d.name);
  const values = sorted.map(d => d.carbon_tax_rate_eur);
  const ctx = document.getElementById("chart-ranking").getContext("2d");

  // Inline plugin: draw EU ETS reference vertical line without annotation plugin
  const euEtsLinePlugin = {
    id: "euEtsLine",
    afterDatasetsDraw(chart) {
      if (!euEtsRef) return;
      const { ctx: c, scales: { x } } = chart;
      const xPx = x.getPixelForValue(euEtsRef.carbon_tax_rate_eur);
      const top    = chart.chartArea.top;
      const bottom = chart.chartArea.bottom;
      c.save();
      c.beginPath();
      c.setLineDash([5, 4]);
      c.strokeStyle = EU_ETS_COLOR;
      c.lineWidth = 1.5;
      c.moveTo(xPx, top);
      c.lineTo(xPx, bottom);
      c.stroke();
      c.setLineDash([]);
      // Label
      c.font = "bold 9px -apple-system, Segoe UI, sans-serif";
      c.fillStyle = EU_ETS_COLOR;
      c.textAlign = "left";
      const label = `EU ETS €${euEtsRef.carbon_tax_rate_eur}`;
      const tw = c.measureText(label).width;
      const lx = Math.min(xPx + 3, chart.chartArea.right - tw - 2);
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.fillRect(lx - 1, top + 2, tw + 4, 13);
      c.fillStyle = EU_ETS_COLOR;
      c.fillText(label, lx + 1, top + 13);
      c.restore();
    }
  };

  chartInstances["ranking"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Tax Rate (€/t CO₂e)",
        data: values,
        backgroundColor: BAR_COLOR_POSITIVE,
        hoverBackgroundColor: BAR_HOVER_POSITIVE,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => {
              const d = sorted[item.dataIndex];
              return [
                ` €${fmt(d.carbon_tax_rate_eur)} / t CO₂e`,
                ` USD $${fmt(d.carbon_tax_rate_usd)}`,
                ` Implemented: ${d.year_of_implementation}`,
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: "#f3f4f6" },
          ticks: { callback: v => "€" + v },
          title: { display: true, text: "€ per tonne CO₂e", font: { size: 10 }, color: "#9ca3af" }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      }
    },
    plugins: [euEtsLinePlugin]
  });
}

// ---- 4b. Emissions Coverage (horizontal bar) ----
function renderCoverage() {
  destroyChart("coverage");
  const sorted = [...filteredData].sort((a, b) => b.ghg_coverage_pct - a.ghg_coverage_pct);
  const ctx = document.getElementById("chart-coverage").getContext("2d");

  chartInstances["coverage"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(d => d.name),
      datasets: [{
        label: "GHG Coverage (%)",
        data: sorted.map(d => d.ghg_coverage_pct),
        backgroundColor: BAR_COLOR_COVERAGE,
        hoverBackgroundColor: BAR_HOVER_COVERAGE,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${sorted[ctx.dataIndex].ghg_coverage_pct}% of GHG emissions covered`
          }
        }
      },
      scales: {
        x: {
          min: 0, max: 100,
          grid: { color: "#f3f4f6" },
          ticks: { callback: v => v + "%" },
          title: { display: true, text: "% of jurisdiction's GHG emissions", font: { size: 10 }, color: "#9ca3af" }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      }
    }
  });
}

// ---- 4c. Scatter: Tax Rate vs Coverage ----
function renderScatter() {
  destroyChart("scatter");
  const ctx = document.getElementById("chart-scatter").getContext("2d");
  const points = filteredData.map(d => ({
    x: d.carbon_tax_rate_eur,
    y: d.ghg_coverage_pct,
    label: d.name,
  }));

  chartInstances["scatter"] = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Jurisdictions",
        data: points,
        backgroundColor: "rgba(99,102,241,0.65)",
        pointRadius: 7,
        pointHoverRadius: 9,
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => points[items[0].dataIndex].label,
            label: item => [
              ` Rate: €${fmt(item.parsed.x)}/t CO₂e`,
              ` GHG Coverage: ${item.parsed.y}%`
            ]
          }
        }
      },
      scales: {
        x: {
          grid: { color: "#f3f4f6" },
          title: { display: true, text: "Carbon Tax Rate (€/t CO₂e)", font: { size: 10 }, color: "#9ca3af" },
          ticks: { callback: v => "€" + v }
        },
        y: {
          min: 0, max: 100,
          grid: { color: "#f3f4f6" },
          title: { display: true, text: "GHG Coverage (%)", font: { size: 10 }, color: "#9ca3af" },
          ticks: { callback: v => v + "%" }
        }
      }
    },
    plugins: [{
      // Draw jurisdiction labels next to points
      id: "scatterLabels",
      afterDatasetsDraw(chart) {
        const { ctx: c, data, scales: { x, y } } = chart;
        c.save();
        c.font = "10px -apple-system, Segoe UI, sans-serif";
        c.fillStyle = "#374151";
        data.datasets[0].data.forEach((pt, i) => {
          const px = x.getPixelForValue(pt.x);
          const py = y.getPixelForValue(pt.y);
          c.fillText(pt.label, px + 9, py + 3);
        });
        c.restore();
      }
    }]
  });
}

// ---- 4d. Implementation Timeline (bar) ----
function renderTimeline() {
  destroyChart("timeline");
  const counts = {};
  filteredData.forEach(d => {
    counts[d.year_of_implementation] = (counts[d.year_of_implementation] || 0) + 1;
  });
  const years = Object.keys(counts).sort();
  const ctx = document.getElementById("chart-timeline").getContext("2d");

  chartInstances["timeline"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [{
        label: "Jurisdictions implementing",
        data: years.map(y => counts[y]),
        backgroundColor: "rgba(20,184,166,0.82)",
        hoverBackgroundColor: "rgba(20,184,166,1)",
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: item => {
              const yr = parseInt(years[item.dataIndex]);
              const names = filteredData.filter(d => d.year_of_implementation === yr).map(d => d.name);
              return names.join(", ");
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: "Year of Implementation", font: { size: 10 }, color: "#9ca3af" }
        },
        y: {
          grid: { color: "#f3f4f6" },
          ticks: { precision: 0 },
          title: { display: true, text: "# Jurisdictions", font: { size: 10 }, color: "#9ca3af" }
        }
      }
    }
  });
}

// ---- 4e. Other Carbon Pricing Instruments (doughnut) ----
function renderDonut() {
  destroyChart("donut");
  const countNo   = filteredData.filter(d => d.other_carbon_price_active === "No").length;
  const countComp = filteredData.filter(d => d.other_carbon_price_active === "Yes, Complementary").length;
  const countSupp = filteredData.filter(d => d.other_carbon_price_active === "Yes, Supplementary").length;
  const ctx = document.getElementById("chart-donut").getContext("2d");

  chartInstances["donut"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["No other instrument", "Yes – Complementary", "Yes – Supplementary"],
      datasets: [{
        data: [countNo, countComp, countSupp],
        backgroundColor: ["#fbbf24", "#10b981", "#6366f1"],
        hoverBackgroundColor: ["#f59e0b", "#059669", "#4f46e5"],
        borderWidth: 2,
        borderColor: "#fff",
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 14, font: { size: 11 }, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: item => {
              const val = item.raw;
              const pct = filteredData.length > 0
                ? ((val / filteredData.length) * 100).toFixed(1)
                : 0;
              return ` ${val} jurisdiction${val !== 1 ? "s" : ""} (${pct}%)`;
            },
            afterLabel: item => {
              const statusMap = { 0: "No", 1: "Yes, Complementary", 2: "Yes, Supplementary" };
              const status = statusMap[item.dataIndex];
              const names = filteredData
                .filter(d => d.other_carbon_price_active === status)
                .map(d => d.name)
                .join(", ");
              return names ? `  ${names}` : "";
            }
          }
        }
      }
    }
  });
}

// ---- 4f. Adjusted C-efficiency Ratio ----
function renderEfficiency() {
  destroyChart("efficiency");
  // Only plot where ratio > 0 (published non-zero value)
  const withRatio = filteredData
    .filter(d => d.adjusted_c_efficiency_ratio_2023 > 0)
    .sort((a, b) => b.adjusted_c_efficiency_ratio_2023 - a.adjusted_c_efficiency_ratio_2023);
  const ctx = document.getElementById("chart-efficiency").getContext("2d");

  if (withRatio.length === 0) {
    destroyChart("efficiency");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = "13px -apple-system, Segoe UI, sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    ctx.fillText("No jurisdictions with non-zero C-efficiency ratio in current filter.", ctx.canvas.width / 2, 120);
    return;
  }

  chartInstances["efficiency"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: withRatio.map(d => d.name),
      datasets: [{
        label: "Adjusted C-efficiency Ratio (2023)",
        data: withRatio.map(d => d.adjusted_c_efficiency_ratio_2023),
        backgroundColor: BAR_COLOR_EFF,
        hoverBackgroundColor: BAR_HOVER_EFF,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => ` Ratio: ${withRatio[item.dataIndex].adjusted_c_efficiency_ratio_2023}`
          }
        }
      },
      scales: {
        x: {
          min: 0, max: 1,
          grid: { color: "#f3f4f6" },
          title: { display: true, text: "C-efficiency Ratio (0 – 1)", font: { size: 10 }, color: "#9ca3af" }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      }
    }
  });
}

function renderCharts() {
  renderRanking();
  renderCoverage();
  renderScatter();
  renderTimeline();
  renderDonut();
  renderEfficiency();
}

/* ============================================================
   5. DATA TABLE
   ============================================================ */
let tableSearchQuery = "";

function getTableData() {
  let data = [...filteredData];
  // Apply table-level text search
  if (tableSearchQuery.trim()) {
    const q = tableSearchQuery.trim().toLowerCase();
    data = data.filter(d =>
      d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
    );
  }
  // Sort
  data.sort((a, b) => {
    const va = a[sortCol];
    const vb = b[sortCol];
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === "asc" ? va - vb : vb - va;
  });
  return data;
}

function badgeHtml(status) {
  if (status === "No") return `<span class="badge badge-no">No</span>`;
  if (status === "Yes, Complementary") return `<span class="badge badge-comp">Complementary</span>`;
  if (status === "Yes, Supplementary") return `<span class="badge badge-supp">Supplementary</span>`;
  return status;
}

function renderTable() {
  const data = getTableData();
  const tbody = document.getElementById("table-body");
  const empty = document.getElementById("table-empty");

  if (data.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = data.map(d => {
    const effDisplay = d.adjusted_c_efficiency_ratio_2023 > 0
      ? d.adjusted_c_efficiency_ratio_2023
      : '<span class="text-gray-400 text-xs">n/a</span>';
    return `
      <tr>
        <td>${d.label}</td>
        <td class="font-semibold text-emerald-700">€${fmt(d.carbon_tax_rate_eur)}</td>
        <td class="text-gray-500">$${fmt(d.carbon_tax_rate_usd)}</td>
        <td>${d.ghg_coverage_pct}%</td>
        <td>${effDisplay}</td>
        <td>${badgeHtml(d.other_carbon_price_active)}</td>
        <td>${d.year_of_implementation}</td>
      </tr>`;
  }).join("");

  // Update sort header icons
  document.querySelectorAll(".data-table th.sortable").forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.col === sortCol) {
      th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

/* ============================================================
   6. JURISDICTION DROPDOWN
   ============================================================ */
function buildJurisdictionDropdown() {
  const list = document.getElementById("jur-list");
  list.innerHTML = rawData.map(d =>
    `<label class="jur-checkbox-item">
       <input type="checkbox" class="jur-cb" value="${d.id}" />
       ${d.label}
     </label>`
  ).join("");

  // Checkbox change
  list.addEventListener("change", () => {
    updateDropdownLabel();
    applyFilters();
  });

  // Live search inside dropdown
  document.getElementById("jur-search").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    list.querySelectorAll(".jur-checkbox-item").forEach(item => {
      const txt = item.textContent.trim().toLowerCase();
      item.style.display = txt.includes(q) ? "" : "none";
    });
  });
}

function getSelectedJurisdictions() {
  return [...document.querySelectorAll(".jur-cb:checked")].map(cb => cb.value);
}

function updateDropdownLabel() {
  const sel = getSelectedJurisdictions();
  const btn = document.getElementById("jur-dropdown-text");
  btn.textContent = sel.length === 0
    ? "All jurisdictions"
    : sel.length === 1
      ? rawData.find(d => d.id === sel[0]).label
      : `${sel.length} selected`;
}

// Toggle dropdown open/close
document.getElementById("jur-dropdown-btn").addEventListener("click", e => {
  e.stopPropagation();
  document.getElementById("jur-dropdown").classList.toggle("hidden");
});
document.addEventListener("click", e => {
  const dd = document.getElementById("jur-dropdown");
  if (!dd.classList.contains("hidden") && !dd.contains(e.target) && e.target.id !== "jur-dropdown-btn") {
    dd.classList.add("hidden");
  }
});

/* ============================================================
   7. FILTER EVENT WIRING
   ============================================================ */
["rate-min","rate-max","cov-min","cov-max","year-min","year-max"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => applyFilters());
});
document.getElementById("filter-other-price").addEventListener("change", () => applyFilters());
document.getElementById("table-search").addEventListener("input", e => {
  tableSearchQuery = e.target.value;
  renderTable();
});

// Reset
document.getElementById("reset-filters").addEventListener("click", () => {
  ["rate-min","rate-max","cov-min","cov-max","year-min","year-max"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("filter-other-price").value = "";
  document.getElementById("table-search").value = "";
  tableSearchQuery = "";
  document.querySelectorAll(".jur-cb").forEach(cb => cb.checked = false);
  updateDropdownLabel();
  applyFilters();
});

// Table column sort
document.querySelectorAll(".data-table th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortCol = col;
      sortDir = col === "name" ? "asc" : "desc";
    }
    renderTable();
  });
});

/* ============================================================
   INIT
   ============================================================ */
fetchData();
