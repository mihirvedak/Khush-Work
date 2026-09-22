# 08 - Faclon Stack Design Theme (product UI)

The brand-system tokens (from the Faclon marketing skill) are the anchor; this
file extends them into a **product** system for dense, operational screens.
Marketing gradients and particle art do **not** appear inside the app - only on
the login/splash and the "Faclon Stack" about panel.

Principles: data first, chrome recedes; one accent (azure) for interaction;
colour carries state **only together with** a pattern, icon or label; density
tuned for 1440 x 900 control-room screens and 1280 x 800 tablets.

## 1. Colour tokens

### Brand (fixed - do not alter)
| Token | Hex | Use |
|---|---|---|
| `--fc-azure-600` | `#1655F2` | Primary action, links, focus ring, selected nav, Control limit |
| `--fc-navy-900` | `#132335` | Left nav, top bar (dark chrome), login bg |
| `--fc-ink-1300` | `#0C1927` | Body text, table values |
| `--fc-navy-footer` | `#192839` | Footer / secondary dark text |
| `--fc-highlight` | `#00EA5F` | Highlight accent on dark chrome only (active nav bar, "Live" pulse). Never as text on white (contrast 1.5:1). |
| `--fc-grad-end` | `#68DD68` | Signature gradient end - splash only |
| `--fc-particle-dark` | `#051320` | Splash only |
| `--fc-white` | `#FFFFFF` | Card surface |

### Derived product scale (new - flagged as proposal for Faclon design review)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-canvas` | `#F4F6FA` | `#0B1622` | Page background |
| `--bg-surface` | `#FFFFFF` | `#132335` | Cards, tables |
| `--bg-subtle` | `#EEF2F8` | `#1A2C40` | Table header, zebra, input fill |
| `--border` | `#DCE2EB` | `#2A3D52` | 1 px dividers |
| `--text-primary` | `#0C1927` | `#E8EEF6` | |
| `--text-secondary` | `#4A5B70` | `#A7B5C6` | Labels, axis |
| `--text-muted` | `#7A889A` | `#7A8BA0` | Hints, timestamps |
| `--azure-50/100/200/500/600/700` | `#EEF3FF` `#DCE6FE` `#B8CCFD` `#3B72F5` `#1655F2` `#0F43C4` | same | Selection, info banners, hover |

### Machine-state palette (timeline, chips, OEE loss bars)
Each state has colour **+ decal pattern + icon + label**.

Contrast (measured): white text on the solid fills fails AA for RUN (3.45:1), DOWN (3.91), IDLE, HOLD and MICRO. So:
- **Timeline bars** use the solid fill (graphics need only 3:1 against the white surface - all pass except NOSCH, which gets a 1 px `#AEB8C6` border).
- **Chips / badges** use the *tinted* pattern: background = fill at 14 % opacity, text `--fc-ink-1300` (>= 12:1), leading 8 px dot + icon in the solid fill. Exceptions allowed to be solid with white text: PLAN (5.4:1), DISC (5.8:1).
- The Hamilton pattern of solid green/red pills with white text is replaced by this - call it out as an accessibility fix in the demo.

| State | Label | Fill | Decal | Icon (lucide) |
|---|---|---|---|---|
| RUN | Running | `#1E9E5A` | none | `play` |
| MICRO | Micro-stop | `#F2B632` | dots | `zap` |
| DOWN | Unplanned down | `#E5484D` | none (solid) | `octagon-alert` |
| PLAN | Planned (clean/CIP/changeover) | `#6E56CF` | diagonal `/` | `wrench` |
| IDLE | Idle / starved / blocked | `#8B98A9` | horizontal lines | `pause` |
| HOLD | Quality / lab hold | `#EA7A1A` | cross-hatch | `flask-conical` |
| NOSCH | Not scheduled | `#E3E8EF` | none, 1 px border | `moon` |
| DISC | Disconnected | `#5B6776` | diagonal `\` | `wifi-off`; back-filled -> `#5B6776` outline + `history` icon |

### Semantic
| Token | Hex | Use |
|---|---|---|
| `--ok` | `#1E9E5A` | Within spec, SLA met |
| `--warn` | `#B7791F` (text) / `#FDF3D8` (bg) | Minor, approaching limit |
| `--danger` | `#D92D20` (text) / `#FDECEC` (bg) | Major/Critical, out of spec |
| `--info` | `#1655F2` / `#EEF3FF` | |
| Severity chip | Minor `warn`, Major `#C2410C` on `#FFEDD5`, Critical white on `#B42318` | always with text |

### Limit lines (SPC / trends) - encoded by colour **and** dash
| Limit | Style |
|---|---|
| Spec LSL/USL | `#D92D20`, 1.5 px, dashed `[6,4]`, label "USL 180.0 degC" |
| Control UCL/LCL | `#1655F2`, 1 px, dotted `[2,3]` |
| Centre line / target | `#4A5B70`, 1 px solid |
| Golden band | fill `#00EA5F` at 14 % opacity, median `#0F8A45` 1.5 px |
| Demo limit | any of the above + small `DEMO` tag and tooltip "Demo limit - pending OBX Quality" |

### Source badges (hard rule 3)
Outline pill, 18 px tall, 11 px Inter SemiBold, icon + text:
`PLC` (`cpu`, azure) · `Controller` (`gauge`, azure) · `Scale` (`scale`, azure) · `Manual` (`pencil`, `#7A4FD0`) · `Calculated` (`sigma`, `#4A5B70`) · `LIMS/COA` (`flask-conical`, `#0F766E`) · `ERP` (`database`, `#4A5B70`). Data-state DS1-DS4/DSP shown as a secondary grey pill on hover cards only.

## 2. Typography

| Role | Font | Size / line / weight |
|---|---|---|
| Page title | TASA Orbiter Bold | 22 / 28 |
| Section / card title | Inter SemiBold | 15 / 20 |
| Body, table cells | Inter Regular, `font-variant-numeric: tabular-nums` | 13 / 18 |
| Table header | Inter SemiBold | 12 / 16, `--text-secondary` |
| KPI value | Inter SemiBold, tabular | 28 / 32 |
| KPI label | Inter Medium | 12 / 16, uppercase off, sentence case |
| Chip / badge | Inter SemiBold | 11 / 14 |
| Mono (ids) | `JetBrains Mono`, fallback `ui-monospace` | 12 / 16 |

TASA Orbiter is **titles only** (brand rule). Load both from Google Fonts with
fallbacks: `"TASA Orbiter", "Inter", system-ui, sans-serif` and
`"Inter", system-ui, -apple-system, "Segoe UI", sans-serif`.
Numbers: always units in header or suffix (`176.4 degC`, `0.021 mbar`), 1 decimal for %, 3 for Cpk shown as 2 (`0.87`).

## 3. Spacing, grid, shape, elevation

- 4 px base: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Layout: left nav 64 px collapsed / 232 px expanded (`--fc-navy-900`); top bar 56 px; sticky global filter bar 48 px; content max-width none (dashboards are fluid), 24 px gutters, 12-col grid, cards gap 16.
- Radius: cards 12, inputs/buttons 8, chips 999.
- Elevation: cards `0 1px 2px rgba(12,25,39,.06)`, drawers `0 12px 32px rgba(12,25,39,.18)`. No other shadows.
- Touch targets: 40 px desktop, **48 px** in operator/tablet views (tagging drawer, logbook forms).
- Breakpoints: `sm 640 / md 1024 (tablet) / lg 1280 / xl 1536`.

## 4. Component library (build once, reuse everywhere)

| # | Component | Spec |
|---|---|---|
| UI-01 | **AppShell** | Dark nav (icons + labels), top bar with plant switcher "OBX Roxboro", demo clock, `Demo data - synthetic` chip (amber outline, always visible), notifications bell with escalation count, user/role switcher (demo RBAC). |
| UI-02 | **GlobalFilterBar** | Line (All/L1/L2), Area, Asset (multi), Shift (All/A/B), Date range presets (Current shift, Last 24 h, Today, Yesterday, 7 d, 30 d, Custom), Product. Filter chips with clear-all. Synced to URL + Zustand. |
| UI-03 | **KpiTile** | Label, value, unit, delta vs previous period (arrow + % + colour + sign), sparkline 24 pts, target marker, source badge, click -> drill. Loading skeleton, "no data" state. |
| UI-04 | **StateChip** | Per state table above; sizes sm/md; `Ongoing` variant with pulse dot (never `NaT`). |
| UI-05 | **SourceBadge** | Above. |
| UI-06 | **TimelineLanes** | ECharts custom series: State lane, Phase lane, Batch lane per asset; decals; shift markArea bands (A white, B `--bg-subtle`); dataZoom slider + presets; brush-select -> filters table. |
| UI-07 | **DataTable** | TanStack v8 + virtual rows, sticky header + first col, column chooser, pinning, per-column filter (funnel icon like Hamilton, but with active-state fill), density toggle, CSV export, row click -> drawer, "Showing 1-25 of 84,350" footer. Empty cells show `-`, never blank for categorical. |
| UI-08 | **EntityDrawer** | Right, 480 px (640 for forms), header with id + status, tabs (Details, Timeline, Audit trail), footer actions. |
| UI-09 | **ReasonPicker** | Search + category tabs P/E/R/M/U/Q/H/X + "recent top-6" quick chips (48 px), remarks textarea, action presets. |
| UI-10 | **FormRow (logbook)** | Label, spec text, input, unit, SourceBadge, auto-fill indicator (`Auto 16:00:03 - Controller`), out-of-limit inline error + "Raise deviation" link, strike-through correction history. |
| UI-11 | **SignatureDialog** | Meaning of signature (Performed / Reviewed / Approved), user, password re-entry (demo: any), timestamp, reason when correcting. Part-11-ready wording. |
| UI-12 | **DeviationCard** | Severity chip, tag + limit + worst value, sparkline with limit, duration, assignee, escalation level stepper L1-L4, SLA countdown. |
| UI-13 | **ChartCard** | Title, subtitle (window + n), toolbar (download PNG, fullscreen, info with formula), legend, empty/insufficient-data state ("n = 6 - need >= 10 for capability"). |
| UI-14 | **CapabilityPanel** | Histogram + normal fit + spec lines, table Cp/Cpk/Pp/Ppk with CI tooltip, `Indicative (n<30)` badge, verdict text (>= 1.33 capable, 1.0-1.33 marginal, < 1.0 not capable). |
| UI-15 | **EscalationStepper** | L1 Operator -> L2 Supervisor -> L3 Production Mgr/QA -> L4 Plant Head, with time stamps and SLA state. |
| UI-16 | **Banner** | Info / warning / critical, dismissible per session, used for S1 ongoing downtime on Overview. |

States every component must implement: default, hover, focus-visible (2 px azure ring, 2 px offset), disabled, loading (skeleton), empty, error.

## 5. Chart styling (ECharts theme `faclon`)

```ts
export const faclonEchartsTheme = {
  color: ['#1655F2', '#0F8A45', '#EA7A1A', '#6E56CF', '#0F766E', '#B42318', '#4A5B70', '#B7791F'],
  textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: '#4A5B70', fontSize: 12 },
  grid: { left: 56, right: 24, top: 40, bottom: 48, containLabel: false },
  categoryAxis: { axisLine: { lineStyle: { color: '#DCE2EB' } }, axisTick: { show: false }, axisLabel: { color: '#4A5B70' }, splitLine: { show: false } },
  valueAxis: { axisLine: { show: false }, splitLine: { lineStyle: { color: '#EEF2F8' } }, axisLabel: { color: '#4A5B70' }, nameTextStyle: { color: '#7A889A' } },
  timeAxis:  { axisLine: { lineStyle: { color: '#DCE2EB' } }, splitLine: { show: false }, axisLabel: { color: '#4A5B70', hideOverlap: true } },
  tooltip: { backgroundColor: '#132335', borderWidth: 0, textStyle: { color: '#E8EEF6', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(12,25,39,.24);' },
  legend: { icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#4A5B70' } },
  dataZoom: { borderColor: '#DCE2EB', fillerColor: 'rgba(22,85,242,.08)', handleStyle: { color: '#1655F2' } },
  line: { symbol: 'none', lineStyle: { width: 1.5 } },
  bar: { itemStyle: { borderRadius: [3, 3, 0, 0] } },
};
```

Rules: time axis labels in ET with date on first tick of each day ("Tue 22 Sep" / "06:00"); never rotate labels, use `hideOverlap`; `aria.enabled: true` + `decal.show: true` on every chart; `sampling: 'lttb'` on long lines; one y-axis per chart (split into stacked grids instead of dual axes, except the WFE "evaporator temp + vacuum" overlay where dual axes are explicitly labelled with units); tooltips show value + unit + source + state at that instant.

## 6. Dark mode

Control-room default = light; dark available via toggle (tokens above). Charts swap `splitLine` to `#1A2C40`, axis labels `#A7B5C6`. State colours unchanged (already tested on both). Store choice per user.

## 7. Tailwind wiring

```js
// tailwind.config.js (excerpt)
theme: { extend: {
  colors: {
    azure: { 50:'#EEF3FF',100:'#DCE6FE',200:'#B8CCFD',500:'#3B72F5',600:'#1655F2',700:'#0F43C4' },
    navy: { 900:'#132335', 950:'#0B1622' }, ink:'#0C1927', highlight:'#00EA5F',
    canvas:'var(--bg-canvas)', surface:'var(--bg-surface)', subtle:'var(--bg-subtle)', line:'var(--border)',
    st: { run:'#1E9E5A', micro:'#F2B632', down:'#E5484D', plan:'#6E56CF', idle:'#8B98A9', hold:'#EA7A1A', nosch:'#E3E8EF', disc:'#5B6776' },
  },
  fontFamily: { display:['"TASA Orbiter"','Inter','system-ui','sans-serif'], sans:['Inter','system-ui','sans-serif'], mono:['"JetBrains Mono"','ui-monospace','monospace'] },
  borderRadius: { card:'12px', ctl:'8px' },
}}
```

Components reference Tailwind classes / CSS vars only - **no hex in TSX**.

## 8. Accessibility checklist

WCAG 2.2 AA: text contrast >= 4.5:1 (chips checked), focus visible, full keyboard path for tagging + signing, `aria-live="polite"` for new escalations, every chart has a "View as table" toggle, state never by colour alone, respects `prefers-reduced-motion` (no pulse), minimum 13 px text.
