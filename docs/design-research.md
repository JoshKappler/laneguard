# LaneGuard — design-system research

Research date: 2026-08-22. Values below were extracted from live production CSS
(fetched and parsed) and from public source repos. Anything I could not confirm
is explicitly marked **unverified**.

Method: raw HTML + all linked `_next/static/chunks/*.css` fetched with curl and
parsed for custom properties, `@font-face` blocks, and semantic rule bodies.
Repo material read from GitHub source, not from marketing copy.

---

## 1. Kevin Liu's open-source asset studio

### Identification

**Found.** The person is **Kevin Liu — GitHub [`Kevin-Liu-01`](https://github.com/Kevin-Liu-01)**,
portfolio [kevinliu.studio](https://www.kevinliu.studio/). He is the only "Kevin Liu"
on GitHub with a public body of work tied to General Translation.

The "asset studio" is **Glyphfield** — https://github.com/Kevin-Liu-01/Glyphfield
(MIT, TypeScript, Next.js 16, live at glyphfield.com). Self-described as
"One studio for turning a complete brand identity into motion, graphics,
materials, templates, and agent-ready artifacts."

Two sibling repos matter and are worth reading alongside it:

| Repo | What it is |
|---|---|
| [Glyphfield](https://github.com/Kevin-Liu-01/Glyphfield) | The asset studio. Brand identity → motion, shaders, templates, OG images, exports. |
| [Sigil-UI](https://github.com/Kevin-Liu-01/Sigil-UI) | His design *system*: 519 tokens / 33 categories / 46 presets, all OKLCH, driven by a single `DESIGN.md`. |
| [Prototemplate](https://github.com/Kevin-Liu-01/Prototemplate) | "eighteen art directions for the General Translation website redesign" — direct GT design exploration. |

**On the GT association — precise version:** Kevin's own portfolio lists him as
Founding Engineer at Dedalus Labs (YC S25), previously Sevenfold AI; it does
**not** list General Translation as employment. The GT link is real but is
*design work*: the Prototemplate repo explicitly contains 18 GT website art
directions, and Glyphfield ships a fully-specified GT reference identity
(contact `hello@generaltranslation.com`). Treat "designer/engineer associated
with GT" as **partially verified — design collaboration confirmed, employment
not confirmed**.

### Glyphfield — design tokens (from `src/app/globals.css`)

Colour is shadcn-shaped HSL triplets, **fully achromatic** except status:

| Token | Light | Dark |
|---|---|---|
| `--background` | `0 0% 99%` | `0 0% 7%` |
| `--foreground` | `0 0% 10%` | `0 0% 92%` |
| `--card` | `0 0% 99%` | `0 0% 10%` |
| `--muted` / `--muted-foreground` | `0 0% 95%` / `0 0% 42%` | `0 0% 13%` / `0 0% 66%` |
| `--border` | `0 0% 82%` | `0 0% 24%` |
| `--input` | `0 0% 72%` | `0 0% 34%` |
| `--ring` | `0 0% 12%` | `0 0% 84%` |
| `--emphasis` | `0 0% 12%` | `0 0% 92%` |
| `--canvas-background` | `0 0% 97%` | `0 0% 4.5%` |
| `--raised-background` | `0 0% 100%` | `0 0% 11%` |
| `--status-success` | `142 76% 36%` | `142 68% 54%` |
| `--status-error` | `0 84% 60%` | `0 82% 67%` |
| `--status-in-progress` | `25 95% 53%` | (inherits) |

Note the discipline: **the entire product chrome is greyscale; the only chroma
in the system is semantic status.** That is a strong, directly-transferable idea
for a forensics dashboard.

Geometry / density (a *second*, product-specific scale layered on top of shadcn):

```
--radius: 0.375rem            /* 6px, small */
--studio-corner-sm/md/lg: 4px / 7px / 10px
--studio-inspector-width: 292px
--studio-rail-width: 216px
--studio-toolbar-height: 53px
--studio-toolbar-control-height: 36px
--studio-panel-heading-min-height: 72px
--studio-panel-padding: 16px
--studio-panel-gap: 14px
--studio-toolbar-title-size: 0.9rem      /* 14.4px */
--studio-toolbar-meta-size: 0.72rem      /* 11.5px */
--studio-panel-title-size: 0.875rem      /* 14px */
--studio-section-title-size: 0.75rem     /* 12px */
--studio-panel-copy-size: 0.6875rem      /* 11px */
--studio-control-icon-size: 20px
--studio-control-glyph-size: 11px
```

Distinctive conventions worth stealing:

- **Weight is capped.** `--font-weight-semibold/bold/extrabold/black` are all
  remapped to `550`, and `capVisibleFontWeight()` clamps at `MAX_VISIBLE_FONT_WEIGHT = 550`.
  There is no bold in the product. Hierarchy comes from size and colour only.
- `font-synthesis-weight: none` + `font-kerning: normal` + `text-rendering: optimizeLegibility`
  on `body` — refuses fake bolds outright.
- **1px scrollbars** everywhere (`::-webkit-scrollbar { width: 1px }`), thumb at
  `foreground / 0.42`. Chrome disappears.
- **One physical elevation model**: a `shadow-plugin` layered stack aliased to
  `--studio-shadow-{xs..2xl}` plus `--studio-shadow-ring-*` variants that append
  a 1px ring. Nothing hand-rolls a box-shadow.
- Panel separation is `1px solid hsl(var(--border))` rails, not elevation.
- Theming: `:root.dark` **and** `.studio-app[data-resolved-theme='dark']` — the
  studio can be themed independently of the marketing site, plus a
  `[data-theme='system']` branch. Appearance persists light/dark, **accent**,
  canvas density, and font family (Switzer / Be Vietnam Pro / Schibsted Grotesk /
  Rethink Sans).
- Source keys are alphabetised throughout (`applications, artDirection, assets,
  audiences, builtIn, colors…`) — enforced ordering, likely a lint rule.

### Glyphfield — the identity model (`src/lib/brandIdentity.ts`)

This is the most reusable part. A brand is not a colour list; it is a typed
record with `strategy`, `dossier`, `graphicSystem`, `voice`, `applications`,
`motion`, `assets`, `references` alongside `colors` / `typography` / `style`.

```ts
BrandColor      = { hex, id, name, role }          // role is prose, not a slot name
BrandTypography = { family, fontId, letterSpacing, lineHeight, role, usage, weight }
                  // role: 'Display' | 'Body' | 'Accent' | 'Code'
BrandStyle      = { borderRadius, density, grid, imageTreatment, logoScale }
                  // density: 'compact' | 'comfortable' | 'spacious'
                  // grid: 'none' | 'dots' | 'lines'
DEFAULT_BRAND_STYLE = { borderRadius: 6, density: 'comfortable', grid: 'none', … }
```

Typography preview defaults: `Display 40 / Accent 32 / Body 24 / Code 18` px
(max `44 / 36 / 30 / 24`).

The bundled **GT reference identity** (useful because it is GT's identity as
*someone else formalised it*, not as GT ships it):

```
#181818 Ink        primary type, marks, dark surfaces
#FFFFFF Paper      primary light surface, reversed type
#F4F4F4 Mist       quiet product + editorial surfaces
#E4E4E4 Silver     selection, focus, dividers, metadata
#D4D4D4 Cloud      completed / healthy
#A3A3A3 Slate      attention, secondary type, disabled
#525252 Graphite   active / in-progress
#262626 Charcoal   destructive "without introducing chroma"
style: { borderRadius: 0, density: 'comfortable', grid: 'none', imageTreatment: 'monochrome' }
typography:
  Display  Switzer 500,     ls -0.7,  lh 0.98
  Body     Inter 400,       ls +0.05, lh 1.58
  Accent   Inter 400,       ls +0.15, lh 1.34
  Code     Geist Mono 400,  ls +0.25, lh 1.50
```

Component structure: ~75 flat `PascalCase.tsx` files in `src/components/` +
a `ui/` subfolder; co-located `*.module.css` only where a component needs
hand-authored CSS (`BrandBook`, `StudioToolHeader`, `DesignVersionControls`).
Domain logic lives in `src/lib/*.ts` as plain typed modules — no state library
in the component tree.

### Sigil-UI (secondary reference)

Different bet, same author: a single human/agent-editable `DESIGN.md` (519
token fields across 33 categories) compiles to CSS custom properties
(`--s-*`), Tailwind v4 `@theme`, and W3C Design Tokens JSON. All colour is
OKLCH. 46 presets, each a complete 500+ token identity. Components read
`var(--s-*)` and are forbidden from hardcoding values; a `sigil doctor` /
preset validator enforces token presence, OKLCH validity, spacing-scale
progression, duration ordering, and per-preset WCAG AA contrast.

The relevant categories for a data product: `motion` (19 fields),
`dataViz`, `pageRhythm` (14), `cards` (18), `headings` (15), `focus`,
`scrollbar`, `gridVisuals`, `dividers`, `componentSurfaces`.

**Takeaway for LaneGuard:** one token file, compiled; components never hold
literal values; a validator that fails the build on contrast/scale violations.

---

## 2. generaltranslation.com

Fetched: homepage HTML (359 KB) + all 14 linked CSS chunks (482 KB).

### Fonts

All self-hosted `.woff2` via `next/font` — no Google Fonts, no external CDN.

| Family | Weights | Variable | Role |
|---|---|---|---|
| **Switzer** | 300, 400, 500, 600, 700, 800 (six static files) | no | Display — `--tc-disp` |
| **Inter** (`InterVariable`) | 100–900 | yes | Body / UI — `--tc-sans`, `--font-sans` |
| **Geist Mono** | 100–900 | yes | Code, locale codes, metadata — `--tc-mono` |

```
--tc-disp: var(--font-switzer), "Switzer", system-ui, sans-serif
--tc-sans: var(--font-sans), "Inter", system-ui, sans-serif
--tc-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace
```

Switzer is Fontshare/ITF — free for commercial use, but **not** Google Fonts.
Inter and Geist Mono are OFL.

### Colour — base layer (shadcn/Fumadocs tokens, HSL triplets)

| Token | Light | ≈hex | Dark | ≈hex |
|---|---|---|---|---|
| `--background` | `0 0% 100%` | `#FFFFFF` | `240 10% 3.9%` | `#09090B` |
| `--foreground` | `240 10% 3.9%` | `#09090B` | `0 0% 98%` | `#FAFAFA` |
| `--card` | `0 0% 100%` | `#FFFFFF` | `240 10% 3.9%` | `#09090B` |
| `--muted` / `--secondary` | `240 4.8% 95.9%` | `#F4F4F5` | `240 3.7% 15.9%` | `#27272A` |
| `--muted-foreground` | `240 3.8% 46.1%` | `#71717A` | `240 5% 64.9%` | `#A1A1AA` |
| `--border` | `240 5.9% 90%` | `#E4E4E7` | `240 3.7% 15.9%` | `#27272A` |
| `--border-strong` | `240 10% 3.9% / .25` | — | `0 0% 98% / .25` | — |
| `--primary` | `240 5.9% 10%` | `#18181B` | `0 0% 98%` | `#FAFAFA` |
| `--radius` | `0.5rem` (8px) | | | |

Semantic status (this is the part directly relevant to a forensics dashboard —
note the paired `-background` at 20–30% α and `-border` at 30–50% α):

| Token | Light | ≈hex | Dark | ≈hex |
|---|---|---|---|---|
| `--status-success` | `142 76% 45%` | `#1CCA5B` | `118 38% 34%` | `#387836` |
| `--status-warning` | `38 92% 50%` | `#F59F0A` | same | same |
| `--status-error` | `0 84% 60%` | `#EF4444` | `0 63% 51%` | `#D13333` |
| `--status-in-progress` | `25 95% 53%` | `#F97415` | same | same |
| `--emphasis` | `217.2 91.2% 59.8%` | `#3B82F6` | `213.1 93.9% 67.8%` | `#60A5FA` |

Twelve chart hues `--chart-1..12` are defined (`173 58% 39%`, `12 76% 61%`,
`197 37% 24%`, `43 74% 66%`, `27 87% 67%`, `217 85% 55%`, `280 65% 60%`,
`142 60% 42%`, `330 75% 60%`, `92 55% 45%`, `245 70% 65%`, `0 75% 58%`) —
**identical in light and dark**, which is a defect worth not repeating.

### Colour — the marketing layer (`.toolchain-root`, a bespoke `--tc-*` system)

The homepage does not use the shadcn palette directly. It sits under a
`.toolchain-root` scope with its own ink ladder:

| Token | Light | Dark |
|---|---|---|
| `--tc-ink` | `#070707` | `#FFFFFF` |
| `--tc-ink-2` | `#070707a1` (63%) | `#FFFFFFa8` (66%) |
| `--tc-ink-3` | `#07070773` (45%) | `#FFFFFF7a` (48%) |
| `--tc-ink-4` | `#07070745` (27%) | `#FFFFFF4d` (30%) |
| `--tc-hair` | `var(--color-border)` `#E4E4E7` | `#27272A` |
| `--tc-hair-2` | `border` mixed 58% → transparent | mixed 72% |
| `--tc-accent` | `#2F5CE0` | `#3B82F6` |
| `--tc-panel` (dark inset cards) | `#09090B` | `= --background` |
| `--tc-panel-ink / dim / faint / rule` | `#070707e0 / #07070794 / #0707074d / #0707071f` | `#FFFFFFe0 / #FFFFFF80 / #FFFFFF42 / #FFFFFF1a` |
| `--tch-ground` (hero band ground) | `#F5F5F3` (warm off-white) | — |
| `--tc-plate` | `#FFFFFF` | `#070707` |
| `--headless-color` | `#4B2CE8` | — |

Four-step opacity ink ladder (100 / ~64 / ~46 / ~28 %) is the whole hierarchy
system. There is no separate "muted text colour" — just the same ink at
declining alpha.

### Type scale (actual measured values)

Fluid on desktop, with a fixed set of variables taking over at ≤720px:

```
--tcm-h2: 2.25rem   (36px)  lh 1.18
--tcm-h3: 1.375rem  (22px)  lh 1.30
--tcm-h4: 1.125rem  (18px)  lh 1.35
--tcm-lead: 17px            lh 1.55
--tcm-body: 16px            lh 1.60
--tcm-small: 14px           lh 1.55
--tcm-kick: 13px
--tcm-quote: 22px           lh 1.40
--tcm-gap-h2: 18px   --tcm-gap-h3: 14px
--tcm-head-pt: 72px  --tcm-head-pb: 36px
```

Desktop, as authored:

| Element | Size | Other |
|---|---|---|
| Hero `h1` | `clamp(2.05rem, 4.9vw, 3.7rem)` → 32.8–59.2px | `ls -0.038em`, `lh 1.03`, `max-width 20ch`, centred, `text-wrap: balance` |
| Hero `h1` (alt heroes) | `clamp(1.8rem, 4vw, 3.1rem)` | `ls -0.024em` |
| Hero sub | 15.5px | `lh 1.6`, `max-width 54ch`, `--tc-ink-2`, `margin-top 20px` |
| Band `h2` | `clamp(1.9rem, 3.4vw, 2.9rem)` → 30.4–46.4px | `max-width 17ch` |
| Narrow `h2` | `clamp(1.62rem, 2.5vw, 2.2rem)` | `max-width 22ch` |
| Card `h3` | 15.5 / 16.5px, weight **500** | `ls -0.012em`, `lh 1.25` |
| Beat `h3` | `clamp(24px, 2.4vw, 34px)` | `ls -0.02em`, `lh 1.16`, `max-width 30ch` |
| Card body `p` | 14px | `lh 1.62`, `max-width 46ch`, `margin-top 11px`, `--tc-ink-2` |
| Stat value | **27px**, weight 500 | display face, `ls -0.03em`, `font-variant-numeric: tabular-nums` |
| Stat label | 12.5px | right-aligned, `--tc-ink-2`, `lh 1.4` |
| Marquee row | 12.5px | inline `code` 11px, mono |
| Night-card footnote | 11.5px mono | `lh 1.5`, 1px top rule, 12px pad |
| Diagram micro-labels | **7px** (`--iso-label-size`), 8px (`--eg-label-size`) | mono, `ls 0.02em` |

Everything sits in a narrow weight band — **400/500, occasionally 600. No 700
in the marketing layer.** Measures are capped hard: 20ch headline, 46–54ch
body, 17–30ch band headings.

### Spacing, geometry, elevation

```
--tc-rail: 1104px                          /* content rail */
--tc-rail-outer: 18px
--tc-gut: clamp(20px, 3.1vw, 36px)         /* section gutter */
--tc-card-pad: clamp(17px, 1.9vw, 21px)
--tcm-box-pt / pb: 36px / 38px             /* card vertical padding */
hero padding: clamp(44px,5.6vw,72px) --tc-gut clamp(40px,5vw,64px)
--thread-gauge: 1.5px   --thread-gap: 3px  /* the double-underline motif */
```

- **Card radius 12px.** shadcn components 8px. Chips/inline code 4px. Buttons 6px.
- **Essentially no shadows.** The only two in the whole marketing layer are
  `0 18px 60px #00000080` on floating terminal windows and shadcn's
  `0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a` on popovers.

### Structure — how sections and cards are separated

This is the single most distinctive thing about the site and it is worth
understanding precisely, because it is what you must **not** copy:

- The page is a vertical stack of `<section class="tc-sec">`, each closed by
  `border-bottom: 1px solid var(--tc-hair)`; last child drops it. No margins
  between sections — the hairline *is* the separation.
- Card grids use `gap: 1px` on a hairline-coloured ground and strip inner
  borders (`> * + * { border-left: 0 }`). Cards read as cells in a ruled sheet,
  not as floating objects. Grid breakpoints inline: `grid-cols-3
  max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1`.
- Section headers are `<div class="tc-head"><h2>…</h2><p>…</p></div>`, optionally
  preceded by a 24px Lucide icon at `stroke-width: 1` (`.tc-head-icon`).
  **There is no eyebrow/kicker label above section headings** — no "01 /", no
  all-caps tag. Just icon + h2 + lead.
- Inverted cards are `.tc-cell.is-night > .tc-card`: dark panel, `color: #ffffffe0`,
  and a locally rebound ink ladder + `--iso-accent: #fff`. Used for terminal,
  diagram, and code content.
- Hero is a **card**, not a bleed: `margin: clamp(10px,1.1vw,14px)`,
  1px border, `border-radius: 12px`, on a `#F5F5F3` ground — so the hero floats
  inside an inset frame.
- `data-reveal="true"` attributes drive scroll-in animation; `prefers-reduced-motion`
  is respected.

### Data / numbers

- Stats are a `.tc-stats` list, each row `display: flex; justify-content: space-between;
  align-items: baseline`, value left / label right, `padding-top: 15px`, separated
  by `border-top: 1px solid var(--tc-hair); margin-top: 15px`. Grid variant uses a
  `3px double` top border and 2-up columns.
- Values are display-face, weight 500, **`font-variant-numeric: tabular-nums`**,
  `letter-spacing: -0.03em`, `white-space: nowrap`.
- Technical diagrams carry **7–8px mono labels** — extreme micro-typography as a
  deliberate density signal.

### Information density and theming

- Density is *moderate* on the page but *very high inside cards*: 14px body at
  1.62, 46ch measure, 11–13px mono metadata, 7px diagram labels.
- **Light-first.** Full dark support via `[data-theme=dark]` on the root plus a
  `.dark` class for the shadcn/Fumadocs layer, with a `:root:not([data-theme=dark])`
  branch used for explicit light overrides. Accent shifts `#2F5CE0` → `#3B82F6`.

### Comparison page — NOT FOUND

Probed and all 404: `/compare`, `/comparison`, `/vs`, `/alternatives`,
`/why-gt`, and the `/en-US/` variants; `compare.generaltranslation.com` does not
resolve. The published `sitemap.xml` contains no comparison URL. All homepage
nav hrefs are: `/blog /careers /contact /docs /docs/locadex /docs/next
/docs/react /docs/react-native /enterprise /enterprise/contact /home
/legal/* /pricing /supported-locales`. A `search_code` sweep of the
`generaltranslation` org for compare/comparison `.tsx` returned zero (though
the relevant repos are private, so that is weak evidence).

The nearest thing that exists is **`/en-US/mintlify`** (HTTP 200) — an
integration landing page, not a competitor comparison. It is worth noting as a
structural reference: it uses **numbered `01 / 02 / 03` step blocks** for
"How it works" and a 5-step setup ladder, plus an accordion FAQ — a pattern
absent from the homepage.

**Status: unverified / not found.** If a comparison page exists it is
unpublished, behind the dashboard, or on a preview deployment.

---

## 3. joshuakappler.com

Fetched: HTML (124 KB) + its single CSS chunk (39 KB). Tailwind v4, Next.js.

### Fonts

Self-hosted `.woff2` via `next/font`, all three are **Google Fonts / OFL**:

```
--font-syne:      "Syne", "Syne Fallback"            400–800 variable   → --font-display
--font-dm-sans:   "DM Sans", "DM Sans Fallback"      100–1000 variable  → --font-body
--font-jetbrains: "JetBrains Mono", "…Fallback"      100–800 variable   → --default-mono-font-family
```

Fallback metrics are overridden against Arial (`ascent-override`,
`size-adjust`) so there is no layout shift.

### Colour

| Token | Dark (default) | Light (`html[data-theme=light]`) |
|---|---|---|
| `--color-bg` | `#050505` | `#FFFFFF` |
| `--color-bg-card` | `#0A0A0A` | `#F4F4F2` |
| `--color-bg-elevated` | `#0D0D0D` | `#F4F4F2` |
| `--color-text` | `#FFFFFF` | `#111111` |
| `--color-text-muted` | `#F0F0F0` | `#1A1A1A` |
| `--color-text-dim` | `#D8D8D8` | `#2A2A2A` |
| `--color-accent` | `#D97757` | `#A8451F` |
| `--color-accent-dim` | `#7D3316` | `#7D3316` |
| `--color-border` | `#1E1E1E` | `#CCCCCC` |
| `--color-border-hover` | `#2F2F2F` | `#AAAAAA` |

Nine tokens total. **Dark-first**, light is the override. The accent `#D97757`
is Anthropic's clay/terracotta. Alpha variants are generated inline via
Tailwind slashes (`border-accent/30`, `bg-bg-card/50`, `text-accent/90`,
`bg-accent/[0.03]`) rather than being tokenised — the four-step ink ladder GT
uses is replaced here by opacity-on-demand.

### Type scale (Tailwind defaults, used as-is)

`--spacing: 0.25rem` (4px base). Scale: `xs .75 / sm .875 / base 1 / lg 1.125 /
xl 1.25 / 2xl 1.5 / 3xl 1.875 / 4xl 2.25 / 5xl 3 / 6xl 3.75 / 7xl 4.5 / 8xl 6 /
9xl 8` rem. Radius: `lg .5 / xl .75 / 2xl 1 / 3xl 1.5` rem.

Actual assignments:

| Element | Value |
|---|---|
| Hero `h1` | Syne 700, `text-4xl md:text-6xl lg:text-7xl xl:text-8xl` (36→60→72→**96px**), `leading-[0.92]`, `tracking-tight` (-0.025em) |
| Section `h2` | Syne 700, `text-4xl md:text-5xl lg:text-6xl` (36→48→60px), `tracking-tight` |
| Project `h3` | Syne 700, `text-3xl md:text-4xl` (30→36px), `tracking-tight`, **coloured `text-accent`** |
| Big stat | Syne 700, `text-6xl md:text-8xl lg:text-9xl` (60→96→**128px**), `text-accent/90` |
| Hero lede | DM Sans, `text-lg md:text-xl` (18→20px), `leading-relaxed` (1.625), `text-text-muted`, `max-w-xl` |
| Body | DM Sans, `text-base md:text-lg` (16→18px), `leading-relaxed`, `max-w-3xl` |
| Eyebrow | **JetBrains Mono**, `text-xs` (12px), `uppercase`, `tracking-[0.3em]`, `text-accent` — e.g. `01 / Projects` |
| Card subtitle | JetBrains Mono, `text-xs`, `uppercase`, `tracking-widest` (0.1em), `text-text-dim`, `mt-3` |
| Micro-label | JetBrains Mono, `text-[10px]`, `uppercase`, `tracking-[0.3em]`, `text-text-dim` — e.g. `Technical Details` |
| Caption | JetBrains Mono, `text-[10px]`, `tracking-wider` (0.05em), `text-text-dim` |
| Detail bullet | DM Sans `text-sm` (14px), `text-text-muted` |
| Button / pill | JetBrains Mono, `text-xs`, `uppercase`, `tracking-[0.2em]` |

Three registers, cleanly separated: **Syne = every heading; DM Sans = every
sentence; JetBrains Mono = every label, number, tag, and button.** That mono-
for-all-chrome rule is the strongest single move on the site.

### Spacing rhythm

```
Section:  py-8 md:py-10                    (32 → 40px vertical)
          px-6 md:px-16 lg:px-24           (24 → 64 → 96px horizontal)
Rail:     max-w-6xl mx-auto                (1152px), hero max-w-5xl (1024px)
Card:     p-8 md:p-10 lg:p-12              (32 → 40 → 48px)
Rhythm:   mb-4 / mb-5 / mb-8 / mb-10 / mb-12 / mb-16   (16/20/32/40/48/64)
Gaps:     gap-2 / gap-3 / gap-4 / gap-6    (8/12/16/24)
```

### Card anatomy (the project card — the site's core component)

```
<article>
  <div  border · rounded-3xl (24px) · border-border/60 · bg-bg-card/50
        backdrop-blur-xl · overflow-hidden · transition-all duration-700
        hover:border-border-hover >
    <div h-px  background: linear-gradient(90deg, transparent, #b5824a40, transparent) >
    <!-- 1px gradient hairline across the top edge — the card's signature -->
    <div p-8 md:p-10 lg:p-12 >
      header  flex items-start justify-between mb-8
        left:  h3 (Syne, accent) + mono uppercase subtitle
        right: pill link  px-4 py-2 · font-mono text-xs · rounded-full
                          border-accent/45 · hover:bg-accent/10
      media   horizontal scroller, gap-3, scrollbar-hide
              tiles: w-72 h-[11.25rem] md:w-96 md:h-60 · rounded-xl (12px)
                     border-border/30 · top gradient scrim from-bg-card/50
              + 10px mono caption below
      prose   text-base md:text-lg · leading-relaxed · max-w-3xl · mb-8
      tags    flex-wrap gap-2 · pills: px-3 py-1.5 · text-xs font-mono
                     text-accent · border-accent/30 · rounded-full
                     hover:border-accent/60
      footer  pt-6 · border-t border-border/40
              10px mono uppercase tracking-[0.3em] label
              grid md:grid-cols-2 gap-3 of detail rows:
                4px dot (w-1 h-1 rounded-full, per-row inline hex colour)
                + text-sm text-text-muted, gap-3, items-start
```

### Overall visual language — what makes it feel like his

1. **Numbered sections.** `01 / Projects`, `02 / YouTube`, `03 / About`,
   `04 / Contact` — mono, accent-coloured, 0.3em tracked, above every `h2`.
   GT has nothing like this.
2. **One accent, used constantly.** Terracotta appears in eyebrows, `h3`s, every
   pill border, hover states, the cursor glow, and the card top-edge gradient.
   Everything else is greyscale.
3. **Borders instead of fills.** Almost every element is `border-*/30–60` with a
   transparent or `/50` background. `backdrop-blur-xl` on cards over a textured
   page.
4. **Rounded-full everything** — 126 uses of `rounded-full` in the page. Pills,
   dots, toggles. Combined with `rounded-3xl` cards this is a much softer
   geometry than GT's 12px cells.
5. **Atmosphere layer**: fixed `<canvas>` + a repeating 240px noise PNG at
   `opacity .225` under a `bg-bg/35` scrim, plus a 600px cursor-tracking radial
   glow `rgba(217,119,87,0.07)` with `blur(50px)`.
6. **Choreography**: per-character hero reveal (`opacity 0 / blur(8px) /
   translateY(40px)` per letter), `duration-300` on colours, `duration-700` on
   cards, `translateX(-10px)` stagger on detail rows.
7. **Density**: low at page level (generous 32–48px card padding, 96px gutters)
   but high inside a card — a 2-up grid of 14px technical bullets with
   colour-coded dots, plus 8-tag pill rows.
8. Theme toggle is a fixed 36px circular button top-right.

**Marketing site, not a tool.** Correct for a portfolio, wrong for LaneGuard.
The transferable parts are the numbered-section discipline, the
mono-for-all-chrome rule, and the borders-over-fills restraint.

---

## 4. LaneGuard identity proposal

LaneGuard is a dense anti-cheat test bench: a live game canvas, streaming
charts, a scrolling event log, an inspector, and a long-form technical writeup.
It must read as **measurement equipment**. Constraints I am holding all three
directions to:

- **Dark-first.** Light theme optional and secondary.
- **Exactly one accent**, and that accent must be a hue **not already claimed by
  the semantic triad** — otherwise "the active tab" and "the account is clean"
  look the same. This rules out green, amber/orange, and red as the brand hue.
- Cannot be GT's identity: no Switzer/Inter/Geist Mono, no `#3B82F6`/`#2F5CE0`
  primary, no 12px hairline-gap cell grid as the signature move, no light-first.
- Should not be Josh's portfolio either: no Syne/DM Sans, no `#D97757`, no
  `rounded-3xl` + `backdrop-blur` cards. LaneGuard links *from* the portfolio; a
  distinct product mark is the right relationship.
- All families below are **OFL / Google Fonts**.
- `font-variant-numeric: tabular-nums` is mandatory on every number, everywhere.

---

### Direction A — "Bench Instrument"

**Fonts** (one OFL superfamily, three registers)

| Role | Family | Weights |
|---|---|---|
| UI / headings | IBM Plex Sans | 400, 500, 600 |
| Data, labels, log, code | IBM Plex Mono | 400, 500 |
| Long-form writeup | IBM Plex Serif | 400, 600 |

**Palette**

```
--bg           #0B0C0E    page
--surface      #121417    panel
--surface-2    #171A1E    raised / table zebra / inspector
--line         #22262C    hairline (all separation)
--line-strong  #313841    active panel edge, focus ring base
--ink          #E6EAEF
--ink-2        #9AA4B0    secondary / axis labels
--ink-3        #626D7A    captions, disabled, gridlines
--accent       #3DDCFF    instrument cyan — interaction only
--accent-dim   #0E4F60    accent wash / selected row
--ok           #35C46B
--warn         #E8A93B
--bad          #F0555E
```

Chart series ramp is derived from the accent plus neutrals
(`#3DDCFF → #6FA8C4 → #8E9AA8 → #626D7A`); semantic hues are reserved and never
used for an ordinary series.

**Scale** — 4px base. Spacing `4 8 12 16 24 32 48 64`.
Type `11 12 13 15 18 22 28 40` px. Line-height 1.35 body / 1.15 headings /
1.0 on tabular numerals. Radius `4px` panels, `2px` chips, `0` on tables and
the canvas. Border 1px everywhere; the only shadow in the system is
`0 16px 48px rgba(0,0,0,.55)` on popovers.

**Mood:** a rack-mounted signal analyser — every pixel is a readout, nothing decorates.

---

### Direction B — "Declassified"

**Fonts**

| Role | Family | Weights |
|---|---|---|
| Display / verdict headlines | Instrument Serif | 400 |
| UI / body | Public Sans | 400, 600 |
| Data / log / code | Source Code Pro | 400, 600 |

**Palette** — warm near-black; the accent is achromatic bone, so **all chroma on
screen is a verdict**.

```
--bg           #0C0B0A
--surface      #141311
--surface-2    #1B1917
--line         #262320
--ink          #EFEBE3
--ink-2        #A39C90
--ink-3        #6B655C
--accent       #E8DCC0    bone — rules, active state, brand mark, focus
--ok           #4E9F5B
--warn         #D99A2B
--bad          #C7514E
```

**Scale** — 4px base. Spacing `4 8 12 16 20 32 40 56`.
Type `11 12 14 16 19 24 34 48` px. Long-form measure 68ch at 19px/1.7; dashboard
body 14px/1.5. Radius `2px` everywhere (nearly square). Rules are the only
separator: 1px `--line`, 3px double rule under section heads.

**Mood:** an incident report cleared for release — serif authority, monospace
evidence, colour only where it accuses.

---

### Direction C — "Packet Room"

**Fonts**

| Role | Family | Weights |
|---|---|---|
| All UI chrome, headings, data | Spline Sans Mono | 400, 500, 600 |
| Long-form writeup only | Newsreader | 400, 600 |

Monospace runs the entire application; the essay page switches to a serif so the
argument reads as prose rather than as output.

**Palette**

```
--bg           #06080B
--surface      #0D1116
--surface-2    #131922
--line         #1B222B
--ink          #DCE3EA
--ink-2        #8A97A6
--ink-3        #55616F
--accent       #C7F24E    hazard chartreuse — focus, active, brand
--ok           #2FBF9E    pushed teal so it cannot be confused with the accent
--warn         #FFB020
--bad          #FF5C5C
```

**Scale** — everything on a **12px monospace column grid**; line-height locked to
20px multiples so log rows, table rows, and chart gridlines align across panels.
Type `10 11 12 14 16 20 26 36` px. Spacing `4 8 12 20 32 40`. Radius `0` — no
rounded corners anywhere. Panels are separated by 1px `--line` seams only.

**Mood:** a packet analyser at 3am — a hard grid, hazard accent, zero ornament.

---

### Recommendation: **Direction A — "Bench Instrument"**

IBM Plex is the only widely-available OFL superfamily with a metrically-related
sans, mono, and serif, so one family covers dense bench chrome, tabular
telemetry, and the long-form writeup without a pairing that fights itself — and
its institutional, slightly-engineered voice reads as measurement equipment
rather than as a marketing site, while sharing nothing with GT's
Switzer/Inter/Geist Mono or Josh's Syne/DM Sans/JetBrains Mono. Instrument cyan
is the one hue not already spoken for by the ok/warn/bad triad, so the accent
can carry interaction state without ever being mistaken for a verdict — which
matters more here than anywhere, since asserting verdicts is the product's
entire job. Direction C is the more striking screenshot but all-mono at 11–12px
across a game canvas, four charts, and a long technical essay will fatigue a
reader; Direction B is the better *writeup* page and its bone-accent rule
(chroma == verdict) should be adopted into A regardless.

Borrow explicitly, from the research:

- Glyphfield's **weight cap** (nothing above 550/600) and `font-synthesis-weight: none`.
- Glyphfield's **greyscale-chrome / chroma-is-status-only** discipline.
- Glyphfield's **1px scrollbars** and single elevation model.
- GT's **four-step ink ladder at declining alpha** instead of a pile of grey tokens.
- GT's **hairline-only separation** and hard measure caps (46–54ch body, ~20ch headings).
- GT's **tabular-nums + negative tracking** on every stat value.
- Josh's **numbered section labels** and **mono-for-all-chrome** rule.

Reject explicitly: GT's `gap: 1px` cell grid (its signature), GT's 12px card
radius + inset floating hero, GT's light-first default, Josh's terracotta,
`rounded-3xl`, `backdrop-blur`, noise texture, and cursor glow.
