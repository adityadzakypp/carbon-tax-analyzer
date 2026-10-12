# Carbon Tax Analyzer Dashboard

Interactive dashboard to compare carbon tax policies across European jurisdictions based on **Tax Foundation Europe — Carbon Taxes in Europe, 2026**.

---

## Running the Project

The dashboard loads `data.json` via `fetch()`, so it **must be served over HTTP** (not opened as a local file). Choose any option:

### Option 1 — Node.js `serve` (recommended)
```bash
npx serve .
# Open http://localhost:3000
```

### Option 2 — Python
```bash
python -m http.server 8080
# Open http://localhost:8080
```

### Option 3 — VS Code Live Server
Install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.

---

## Project Structure

```
.
├── index.html     # Dashboard layout (Tailwind CDN, Chart.js CDN)
├── style.css      # Custom styles: KPI cards, table, badges, dropdown
├── script.js      # Data loading, filtering, KPI logic, 6 charts, table
├── data.json      # Cleaned dataset (24 jurisdictions + EU ETS reference)
└── README.md      # This file
```

---

## Dataset Description (`data.json`)

### `meta`
Provenance, units, notes, and analytical limitations.

### `jurisdictions` (array of 24 objects)
| Field | Type | Description |
|---|---|---|
| `id` | string | ISO 3166-1 alpha-2 country code |
| `name` | string | Country name |
| `label` | string | Display label with ISO code |
| `carbon_tax_rate_eur` | number | Rate per tonne CO₂e in euros (2026) |
| `carbon_tax_rate_usd` | number | Rate per tonne CO₂e in US dollars (2026) |
| `ghg_coverage_pct` | number | % of jurisdiction's GHG emissions covered (2025) |
| `adjusted_c_efficiency_ratio_2023` | number | Revenue efficiency ratio 0–1 (2023); **0 = no published data** |
| `other_carbon_price_active` | string | `"No"`, `"Yes, Complementary"`, or `"Yes, Supplementary"` |
| `year_of_implementation` | number | Year carbon tax entered into force |

### `eu_ets_reference`
EU Emissions Trading System benchmark — shown as a reference line on the Tax Rate Ranking chart only. **Not included in any KPI or statistical calculation.**

### `dataset_average`
Pre-computed averages from the original Tax Foundation source table. Not used in dashboard calculations (KPIs are recomputed from filtered data dynamically).

---

## KPI Definitions

| KPI | Calculation |
|---|---|
| **Jurisdictions** | Count of jurisdictions matching current filters |
| **Avg Tax Rate** | Arithmetic mean of `carbon_tax_rate_eur` across filtered jurisdictions |
| **Avg GHG Coverage** | Arithmetic mean of `ghg_coverage_pct` across filtered jurisdictions |
| **With Other Instrument** | Count where `other_carbon_price_active ≠ "No"` |
| **Implementation Span** | `min(year_of_implementation)` – `max(year_of_implementation)` |

> Averages are computed only over the visible filtered set. No averages are shown when 0 jurisdictions are selected.

---

## Analytical Notes

- **Primary currency:** Euro. USD is shown for informational context only. Never mixed in the same calculation.
- **C-efficiency chart** only plots jurisdictions with `adjusted_c_efficiency_ratio_2023 > 0` (11 of 24). A value of 0 in the data likely indicates no published 2023 figure, not zero efficiency.
- **Scatter plot** (Tax Rate vs GHG Coverage) shows association only — not evidence that higher rates cause lower emissions or indicate more effective policy.
- **EU ETS** is a cap-and-trade system, not a carbon tax; it is shown as a comparison benchmark only.

---

## Source

Tax Foundation Europe, *Carbon Taxes in Europe, 2026*. [taxfoundation.org](https://taxfoundation.org)
