---
name: Vital
description: Agenda multiempresa e CRM por WhatsApp — três interfaces, três linguagens visuais coexistindo no mesmo produto.
colors:
  painel-ink: "#241A28"
  painel-ink-deep: "#3B2B41"
  painel-porcelain: "#FBF6F4"
  painel-paper: "#FFFFFF"
  painel-blush: "#EEDBD6"
  painel-lacquer: "#A32A4E"
  painel-lacquer-deep: "#7E1E3C"
  painel-ultraviolet: "#6A57C7"
  painel-line: "#E7D8D4"
  painel-muted: "#7A6975"
  painel-ok: "#3E7D63"
  painel-warn: "#B4762A"
  vital-ink: "#17141C"
  vital-paper: "#FFFFFF"
  vital-ground: "#F6F4F8"
  vital-line: "#E4E0EA"
  vital-muted: "#6D6678"
  vital-purple: "#4B2E83"
  vital-purple-soft: "#F0EAFA"
  vital-ok: "#2E7D5B"
  vital-warn: "#8A5A00"
  vital-error: "#8A2B2B"
  site-tenant-accent: "#A32A4E"
  # Igual a site-tenant-accent, de propósito: paraTextoBranco() só escurece o
  # necessário para o próprio tom aguentar branco, e #A32A4E já aguenta
  # (7:1) sem mudar nada. Uma marca clara (sálvia, pastel) escurece de
  # verdade aqui — este valor é o caso "já estava bom".
  site-tenant-accent-deep: "#A32A4E"
  site-tenant-accent-soft: "#F6E9ED"
  site-tenant-accent-border: "#E4C7CF"
  site-tenant-tint: "#FBF4F6"
  site-on-accent: "#FFFFFF"
  site-on-accent-deep: "#FFFFFF"
  site-ground: "#FFFFFF"
  site-ink: "#1A1A1A"
  site-gray: "#6B6B6B"
  site-muted: "#737373"
  site-line: "#E8E8E8"
  site-surface: "#FAFAFA"
  # Clínica model — the one site model with template-owned color beyond the
  # neutrals: the two golds belong to the model, never to the tenant.
  site-clinica-ground: "#F7F5ED"
  site-clinica-ink: "#2F3D32"
  site-clinica-gray: "#4F5F52"
  site-clinica-muted: "#5D6A5E"
  site-clinica-line: "#D8D3BF"
  site-clinica-surface: "#EFECE1"
  site-clinica-gold: "#7A5C2A"
  site-clinica-gold-light: "#E8CF91"
  site-clinica-beige: "#E8DFCD"
typography:
  painel-display:
    fontFamily: "Fraunces, Georgia, serif"
    fontWeight: 400
    letterSpacing: "-0.01em"
  painel-body:
    fontFamily: "Karla, system-ui, sans-serif"
    fontSize: "14px"
  painel-mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "10.5px–12.5px"
  vital-body:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
  vital-mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "12.5px"
  site-rotulo:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.1em"
  site-legenda:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "12.5px"
  site-auxiliar:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "13.5px"
  site-corpo-pq:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "14.5px"
  site-corpo:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
  site-body:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  site-titulo-pq:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 700
  site-titulo:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "19px"
    fontWeight: 700
  site-destaque:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "24px"
    fontWeight: 600
  site-secao:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  site-hero:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "34px"
    fontWeight: 700
  # Clínica model. Body stays on site-body (Manrope); only the italic is new.
  site-clinica-display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontWeight: 400
    letterSpacing: "-0.01em"
  site-clinica-hero:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(46px, 6.5vw + 8px, 92px)"
    fontWeight: 500
    lineHeight: 0.92
    letterSpacing: "-0.04em"
  site-clinica-secao:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(34px, 3.4vw + 14px, 58px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  site-clinica-olho:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.28em"
spacing:
  site-1: "4px"
  site-2: "8px"
  site-3: "12px"
  site-4: "16px"
  site-5: "20px"
  site-6: "24px"
  site-7: "32px"
  site-8: "40px"
  site-9: "52px"
rounded:
  painel-sm: "7px"
  painel-md: "12px"
  painel-lg: "20px"
  painel-pill: "999px"
  vital-sm: "9px"
  vital-md: "13px"
  vital-lg: "16px"
  site-uniform: "14px"
  site-compact: "10px"
  site-pill: "999px"
  site-clinica-card: "16px"
  site-clinica-arch: "210px 210px 20px 20px"
components:
  painel-button-primary:
    backgroundColor: "{colors.painel-lacquer}"
    textColor: "#FFFFFF"
    rounded: "{rounded.painel-pill}"
    padding: "11px 18px"
  painel-button-primary-hover:
    backgroundColor: "{colors.painel-lacquer-deep}"
  painel-chip:
    backgroundColor: "{colors.painel-paper}"
    textColor: "{colors.painel-ink}"
    rounded: "{rounded.painel-pill}"
    padding: "10px 15px"
  painel-card:
    backgroundColor: "{colors.painel-paper}"
    rounded: "{rounded.painel-lg}"
  vital-button-primary:
    backgroundColor: "{colors.vital-purple}"
    textColor: "#FFFFFF"
    rounded: "{rounded.vital-sm}"
    padding: "12px 16px"
  vital-card:
    backgroundColor: "{colors.vital-paper}"
    rounded: "{rounded.vital-lg}"
  site-button-primary:
    backgroundColor: "{colors.site-tenant-accent}"
    textColor: "{colors.site-on-accent}"
    rounded: "{rounded.site-pill}"
    padding: "14px 22px"
  site-card:
    backgroundColor: "{colors.site-ground}"
    rounded: "{rounded.site-uniform}"
  site-clinica-button-gold:
    backgroundColor: "{colors.site-clinica-gold-light}"
    textColor: "{colors.site-clinica-ink}"
    typography: "{typography.site-clinica-olho}"
    rounded: "{rounded.site-pill}"
    padding: "14px 24px"
  site-clinica-hero-badge:
    backgroundColor: "{colors.site-clinica-ground}"
    textColor: "{colors.site-clinica-ink}"
    rounded: "{rounded.site-clinica-card}"
    padding: "12px 16px"
  site-clinica-agende-card:
    backgroundColor: "{colors.site-clinica-ground}"
    textColor: "{colors.site-clinica-ink}"
    rounded: "24px"
    padding: "32px 24px"
---

# Design System: Vital

## Overview

**Creative North Star: "Two Ledgers and a Canvas"**

Vital is not one interface wearing three skins — it is three coherent, independently-evolved visual systems, each serving a public that never sees the other two. The product's own architecture forces this: site, painel and `vital.html` are separate Vite bundles, separate CSS files, separate audiences, and the codebase already gives two of the three systems descriptive token names (`porcelain`, `lacquer`, `blush`, `ink`) that read like they were designed on purpose, not defaulted into.

Two of the three are **ledgers** — fixed, opinionated, unapologetically branded design languages that exist regardless of which tenant is using the product. **The Atelier Ledger** (painel) is warm, serif-headlined, porcelain-and-lacquer, built for a person who opens it fifty times a day from a phone at the counter. **The Plain Ledger** (`vital.html`) is the same record-keeping instinct with the warmth stripped out — purple, Inter, mostly borders, because this is where the Vital *team* administers other people's businesses and the tone is administrative trust, not hospitality.

The third is **The Blank Canvas** (site) — the one system in the product whose primary color is not a design decision at all. `--marca` arrives at runtime from the tenant's own config; the system's real signature is everything that *doesn't* change: the pill-shaped buttons, the circular photo grid, the 14px corner radius, the slow zoom-in on the cover photo. Site is the only surface designed to be worn by a color it doesn't choose.

Within that canvas, site's composition now carries a second, more specific thesis: **A Bandeja** (the tray). Mood-referenced from a real neighborhood esthetics studio's Instagram (not a generic spa-site convention — the calibration this pass explicitly worked against was "cream background, elegant serif, gold accent," the category's own cliché), the idea is that each service is an object resting on a lit surface, not an icon floating on a card. One model is a deliberate exception to that calibration, not a contradiction of it: **Clínica** adopts exactly that world — cream paper, one italic serif word per title, a thread of gold — because the client pinned a reference that *is* that world (`Exemplo/artifacts/clinica-estetica`), and a pinned brief outranks the house's own aversion to a cliché. What Clínica refused from that reference was its content, not its look: the fabricated reviews, rating and years stayed out, and its three failing color pairs were corrected (see Colors → Clínica). Two structural consequences: the header no longer depends on a cover photo to look intentional (it didn't have one in the only environment this was built and checked in, and needed to work without one first), and shadow on the service circles is directional — light from one side, tinted from the brand ink — rather than the ambient ownerless glow the rest of the system uses. See `--sombra-bandeja` under Elevation & Depth.

**Key Characteristics:**
- Three separate token vocabularies, never shared, never crossing bundle boundaries — painel's `--lacquer` and site's default `--marca` happen to share a hex value only because the seed tenant's brand color was picked to match, not because the systems are coupled.
- Two fixed brands (painel, Vital) built for operators; one adaptive shell (site) built to disappear behind whichever tenant is using it.
- `lucide-react` is the one true cross-cutting convention: all three bundles use the same icon set, inline, never an icon font.
- Componentry across all three is **refined and comedido**: short transitions (.12–.25s), no scale/bounce on press, shadows shallow and functional. Nothing performs; everything confirms.

## Colors

Three independent palettes. None is a variant of another — treat a color request on one surface as having zero bearing on the other two.

### Painel — The Atelier Ledger
- **Aubergine Ink** (`#241A28`): primary text, the sidebar's own background. The darkest color in the system and the only near-black.
- **Aubergine Ink, Deep** (`#3B2B41`): sidebar hover state, `.btn-d` (dark button) hover.
- **Warm Porcelain** (`#FBF6F4`): page background — never pure white, always this warm off-white.
- **Paper** (`#FFFFFF`): card and input surfaces, sitting one step lighter than porcelain so cards read as objects placed on the page.
- **Blush** (`#EEDBD6`): soft accent background for tags, badges, "you" markers — never a large surface.
- **Lacquer** (`#A32A4E`): the one primary accent — buttons, active nav, links, focus states tied to action.
- **Lacquer, Deep** (`#7E1E3C`): hover/pressed state for lacquer, and the "today" column highlight text in the agenda.
- **Ultraviolet** (`#6A57C7`): reserved for one job — the keyboard focus ring (`:focus-visible`) and the CRM automation bell. Never used as a button color.
- **Line** (`#E7D8D4`): every border, divider, and disabled-state fill in the system.
- **Muted** (`#7A6975`, corrected from `#806E7B`): secondary text — labels, timestamps, helper copy. The original value read 4.42:1 against `--porcelain`, just under WCAG AA's 4.5:1 for normal text when muted copy sits directly on the page background rather than on a `--paper` card; this value clears 4.77:1 there.
- **Ok** (`#3E7D63`) / **Warn** (`#B4762A`) / **Erro** (`#8A2B2B`): status-only. Paid/positive, pending/attention, and failed/destructive — never decorative. `--erro` completes the trio; it existed as a bare literal in eleven places (the delete button on six screens, the failure toast, the no-show tag, a falling variation) before it had a name, and the Vital bundle had already named the same value `--v-erro`. Same value as before, only christened — and `.btn-erro` now carries it, so a destructive button is a class, not an inline style repeated per screen.
- **People and categories are told apart by tone, not by hue** (`PALETA`, in `App.jsx`). Six tones of the panel's own wine (`#A32A4E`, `#59182B`, `#C2476C`, `#711E37`, `#B03B5E`, `#892443`), every one above 4.5:1 against the white initials. It used to be six unrelated hues (wine, violet, green, ochre, pink, blue) and the Summary, the agenda and the charts read as a rainbow. The order is by contrast between neighbours (middle, darkest, lightest, …) so the first three people already come out clearly different. The bar chart on the Summary uses the wine alone; the current month is the darker step. New colours for a person or category come from this list — a seventh hue is not added.

**The Named-Twin Rule.** `--p-marca`, `--p-escuro` and `--p-linha` (defined for the shell) are exact aliases of `--lacquer`, `--ink` and `--line`. They are not a second palette — don't invent a divergent value for one while leaving the other unchanged.

**The Unused-Token Rule.** `--gold` (`#A98243`) is declared in `:root` and used nowhere. Don't treat its presence as license to start using an unreviewed color; either give it a real job or leave it retired.

### Vital — The Plain Ledger
- **Ink** (`#17141C`): primary text — darker and cooler than painel's ink, with no warmth in it.
- **Paper** (`#FFFFFF`) / **Ground** (`#F6F4F8`): surface and page background, the same porcelain-adjacent relationship as painel but desaturated toward gray instead of warm.
- **Line** (`#E4E0EA`): borders and dividers — the system's only structural device, since Vital rarely uses shadow.
- **Muted** (`#6D6678`): secondary text.
- **Purple** (`#4B2E83`): the single fixed accent — buttons, active tab, links, the plan-badge chip. This is Vital's own brand, distinct from any tenant's `--marca`, and it never appears on the site or painel of a tenant.
- **Purple, Soft** (`#F0EAFA`): accent-tinted background for the active tab and the confirmation badge circle.
- **Ok** (`#2E7D5B`) / **Warn** (`#8A5A00`) / **Error** (`#8A2B2B`): status-only, desaturated relative to painel's equivalents to match the quieter overall palette.

### Site — The Blank Canvas, and its four models

Site is no longer one skin — `marca.template` (`'bandeja' | 'quadro' | 'caderneta' | 'clinica'`, tenant-chosen in Configurações → Site da cliente, same section as the color) selects which of four complete visual models renders. **Every model shares one React tree** (`App.jsx`, `Agendar.jsx`, `Grade.jsx` — layout, booking logic, accessibility, all of it) and reads the same class names; only tokens differ, written to `<html data-template="...">` by `tema.js` and consumed through `[data-template="..."]` blocks in `styles.css`. This section (and Typography, Layout, Elevation & Depth, Shapes below) describes **Bandeja**, the original model and the fallback before `tema.js` runs; the other three get their own subsections alongside it, each covering only what changes — a model that doesn't mention a token inherits Bandeja's.

**The tenant's accent color is a cross-cutting axis, independent of model.** Whichever of the four a business picks, their own `corPrimaria` still drives every button, focus ring, and price emphasis — a model changes the *neutrals* it sits on (paper white, graphite dark, kraft, cream), the shape language, the type, and the shadow philosophy, never who owns the accent. A model may also own a second, fixed color of its own the way it owns its neutrals (Clínica's gold, below) — that color is the model's material, never a second tenant setting.

- **Tenant accent** (`#A32A4E`, a rose, is `configPadrao`'s default for any freshly-provisioned tenant — including the bare `default` tenant a subdomain-less `localhost` resolves to; **overridden per tenant at runtime** by `tema.js` from `plataforma.tenants.config`): every button, focus ring, active state, and price emphasis on the site. Never hardcode this value — it is the one color in the entire product that is data, not design. `:root`'s own static `--marca: #3F6350` (a muted sage) is a *different*, narrower thing: the pre-hydration CSS fallback painted for the one frame before `tema.js` runs on any tenant at all, not a value any real tenant is assigned. Laura Faust, Vital's first confirmed client (see PRODUCT.md, "Evidence on Hand"), uses a third value — her own real brand sage, `#98a68c` — but she is now provisioned as an ordinary tenant with her own id and subdomain, not the seed/default slot, so her color is tenant data like any other, not a system default.
- **Tenant accent, deep / soft / border / tint**: four derived shades the tenant's admin never sets directly — `tema.js` computes them from the base accent so hover states and low-emphasis surfaces stay in family automatically.
- **On-accent** (default `#FFFFFF`, **also computed per tenant** by `tema.js`'s `contraste()`): text/icon color placed directly on the *undarkened* tenant accent — used only where the accent itself appears as a thin fill or accessory, not a full-fill surface (see "On-accent, deep" below for that case). Picks pure black (`#1A1A1A`) or pure white by the actual WCAG contrast-ratio formula against each, not an approximation — always the higher-contrast of the two. This still can't guarantee 4.5:1 for every possible tenant color (a mid-tone brand color has no perfect option between black and white), and no tenant-facing warning exists today if their chosen brand color produces poor contrast anywhere it's used — but the function no longer picks the *worse* of the two options, which the previous perceived-luminance threshold occasionally did near its cutoff.
- **Tenant accent, deep** and **on-accent, deep** (both computed per tenant by `paraTextoBranco()`/`contraste()`): together, the site's **full-fill pair** — every solid-color surface (`.b-p`, `.destaque`, `.destaque-selo`, `.promo-selo`, `.jn-op.on`, `.jn-caixa.on`, `.jn-opcao-marca`, `.cal-dia.on`, `.jn-pronto-marca`) uses `accent-deep` as its background and `on-accent-deep` as its text/icon, never the plain accent pair above. `accent-deep` is no longer a fixed "-25% for hover" shade — it's the accent darkened in steps, only as far as it takes for *itself* to hold white text at ≥4.5:1 (`paraTextoBranco`); a tenant color already dark enough (most navy blues, forest greens) comes back almost unchanged. This exists because roughly half the colors a real business picks (a sage, a pastel, Laura Faust's own `#98a68c`) don't hold white at their own intensity — before this pair existed, every one of those full-fill surfaces used the plain accent+on-accent pair and silently read as "ordinary black text," none of the tenant's chosen color actually visible as a fill. This is the highest-leverage fix in the whole personalization system, because it is invisible until a tenant's actual color hits it.
- **Ground** (`#FFFFFF`) / **Ink** (`#1A1A1A`): page background and primary text, both fixed.
- **Gray** (`#6B6B6B`) / **Muted** (`#737373`, corrected from `#9A9A9A`): two steps of secondary text. The original muted value read 2.81:1 against white — below AA even for large text; this value clears 4.74:1.
- **Line** (`#E8E8E8`) / **Surface** (`#FAFAFA`): borders and the one alternate (non-white) section background, used for the footer and calendar day cells.
- **Legible accent** (`--marca-legivel`): `--marca` itself, used as *plain text* — link hover, focus outline, the required-field asterisk, a promo's "economize" line, about fifteen spots total. On a light model this was already almost always fine (most chosen colors contrast with white); it exists because a model's own ground isn't always white, and because a light/pastel accent can fail even against white. Computed by `comContraste()`: keeps the tenant's real color untouched whenever it already clears 3:1 against the model's `--fundo`, and only then nudges it toward black or white, in steps, until it does. Never reads as generic dark gray for a normal color — the nudge is the exception, not the default.
- **Legible-on-light-wash** (`--sobre-marca-clara`): the service-circle initial's own color, sitting on `--marca-clara` (a wash of the same accent). Same problem as above, same fix, different pair — `--marca` and `--marca-clara` share a hue, so a very light or very dark accent can fail contrast against its *own* wash even when it reads fine against `--fundo`.

**The Injectable-Accent Rule.** Site's stylesheet defines `--marca-fundo` (the palest tenant-tinted section background) as a literal fallback color, not left blank — because `tema.js` runs after the storefront API responds, and without a default the services block would flash without a background on first paint. Any new tenant-colored token needs the same static fallback, not just a runtime assignment.

**The Nudge-Don't-Replace Rule.** `comContraste()` (used for both tokens above) is a last resort, not a first move: it returns the tenant's actual color unchanged whenever that color already passes, and only searches for a substitute when it doesn't. A future derived token that needs contrast safety calls this function; it doesn't invent a second "if the color is bad, use gray" branch.

#### Quadro de Horários

Thesis: booking here is as precise as a well-run bus terminal's departure board. The one model with a genuinely different *ground* — dark, not a variant of light.

- **Ground** (`#1C1F1D`, warm graphite, not pure black) / **Ink** (`#F2EFE9`, warm off-white, not pure white).
- **Gray** (`#C9C2B4`) / **Muted** (`#A39C90`, 6.11:1 against ground).
- **Line** (`#34382F`) / **Surface** (`#242825`, one step lighter than ground, for the alternating block background).
- **The wash direction flips here.** `--marca-clara` and `--marca-fundo` (the tenant accent lightened toward white on every other model) mix toward the *model's own ground* instead — `tema.js`'s `FUNDOS` map and `alvoEscuro` logic. Lightening toward white on a dark page would paint a bright patch where a subtle tint belongs; this is the one piece of tema.js that is genuinely model-aware, everything else is shared math.
- No shadow vocabulary at all (`--sombra` and both `--sombra-bandeja*` are `none`) — depth is border and contrast, not light. The one exception: `--sombra-bandeja-hover` becomes a 2px inset ring in the tenant's accent, so a hovered object still responds without inventing a light source a flat board doesn't have.

#### Caderneta

Thesis: booking here is like writing the appointment into a notebook that already knows you.

- **Ground** (`#F1E9DA`, kraft, not the beige-spa cliché — closer to real notebook-cover paper) / **Ink** (`#2B2620`, warm near-black).
- **Gray** (`#5C5140`) / **Muted** (`#6E6350`, 4.89:1 — darkened once from an initial `#8A7F6C` that read 3.26:1, same WCAG-first discipline as every other correction in this document).
- **Line** (`#DDD0B8`) / **Surface** (`#E8DEC8`).
- Shadow is a softer, shorter-throw version of Bandeja's tray light (`--sombra-bandeja`: `-2px 6px 14px -10px rgba(43,38,32,.22)`) — paper lifting slightly, not an object under studio light.
- **Ruled paper, exactly once.** `.identidade`'s background gets a `repeating-linear-gradient` of horizontal lines at the model's `--linha` color — real notebook rule, not a texture image. Confined to the header; the rest of the page stays plain, so the device reads as a considered detail, not wallpaper.
- **One handwritten mark, exactly once.** `.jn-pronto h3` (the booking-confirmation heading — the highest-satisfaction moment in the flow) switches to Caveat, 32px. Nowhere else in the model uses it. A second handwritten element would turn a signature into a costume.

#### Clínica

Thesis: a studio of care presented as a house, not a shop — cream paper, the tenant's own color, and a thread of gold (the direction contract is the comment at the top of `<body>` in `web/index.html`). The world comes from the reference the client pinned herself: `Exemplo/artifacts/clinica-estetica` (`src/App.tsx`, `src/index.css`), a sample site made for her — cream, sage, gold, Manrope with one Instrument Serif italic word per title. The earlier Clínica (white ground, cool near-black, quiet gray shadow, "premium clinic" restraint) is gone; what replaced it is that reference's look, executed whole rather than as a half-measure. What did **not** come across from the reference: its invented content (named testimonials, a "5,0" rating, "+8 anos") — see PRODUCT.md, "Evidence on Hand" — and its three color pairs that failed AA: gold text on cream, cream text on light sage (2.3:1, the reference's own hero), and sage text on cream. Each has a corrected token below.

- **Ground** (`#F7F5ED`, cream — the reference's `hsl(45 32% 96%)`) / **Ink** (`#2F3D32`, a green-black, not a neutral black). The page is paper, not white.
- **Gray** (`#4F5F52`) / **Muted** (`#5D6A5E`): both green-tinted so secondary text belongs to the same material as the ink. Gray is the "Sobre" paragraph, the Agende copy and every list item, and clears 5.1:1 even on the beige band; Muted is used on cream only (the badge's second line, the antes/depois caption, the "Em breve" pill), 5.2:1 there.
- **Line** (`#D8D3BF`) / **Surface** (`#EFECE1`): a warm rule and a one-step-darker paper, same relationship as every other model.
- **Gold** (`#7A5C2A`, `--ouro`): the model's own second color, used as **small text on the three light bands only** — the olho label, the Agende list icons, the empty-state star, the anchor nav's hover, the footer's "Contato" label. 5.7:1 on cream, ≥5.2:1 on the tinted band, 4.7:1 on beige. On a dark band the olho's *label* switches to `--sobre-marca-escura` (this gold would read ~2:1 on the seed tenant's green) and only its fio stays gold.
- **Gold, light** (`#E8CF91`, `--ouro-claro`): the same gold as *material* — the 44px olho fio, the arch's offset ring, the two decorative hero rings (at 30% alpha), the ring on every staff circle, `::selection`, the fill of the gold hero CTA and the WhatsApp FAB (with `--texto` on top, comfortably AA), and the border tint of the badge and the Agende card. Its one text role is *large* text on `--marca-escura`: the italic last word of the company name in the hero, and the italic word of a title on a `.bloco-cheio` band — 3.2:1 for the seed tenant, which is large-text AA and nothing more. It is never small text on a light band (1.9:1 on cream), and never small text on the dark band either: the footer signature and the Destaque's "economize" stay white for that reason.
- **Beige** (`#E8DFCD`, `--bege`): the "Agende" band, and nothing else — the reference's fourth surface, between cream, the tinted band and the dark band.
- **Faixa** (`--faixa: color-mix(in srgb, var(--marca) 18%, var(--fundo))`, ≈`#E6E7DB` for the seed tenant's `#98a68c`): the services band and the Instagram band — the tenant's color mixed into the *cream*, not into white. `--marca-clara` (an 88% mix toward white) gave `#F3F4F1` for a sage — four tones off the cream, a gray stripe instead of the reference's light-green band. This is the one tenant-derived token the model computes in CSS rather than in `tema.js`, because only the model knows its own ground.
- **The dark band is `--marca-escura`, and its text is `--sobre-marca-escura`.** The hero, "Quem cuida de você" (`.bloco-cheio`) and the footer all sit on the tenant's color *darkened only as far as it takes to hold white* (`paraTextoBranco`, see "Tenant accent, deep" above) — `#6A7462` for the seed tenant. The reference painted its hero in the light sage with cream text, 2.3:1; the dark derived shade is the same green with the contrast solved, and it is what lets the same band work for a tenant whose color is a pastel.
- **The italic word's color follows the band it sits on.** `--marca-legivel` on cream (the tenant's color, nudged by `comContraste()` only if it fails 3:1 — `#7A8570` for the seed tenant's sage, which does); `--marca-escura` on the tinted band (`--marca-legivel` is computed against the cream, not against `--faixa`, so it can't be trusted there; the dark shade is guaranteed ≥4.5:1 against white, hence ≥3:1 here); `--ouro-claro` on the dark bands. Same word, three colors, one rule: whichever the band can carry.
- Browser-drawn surfaces are the model's too: `::selection` is light gold on ink, the text caret is `--marca-escura`. The Google Maps embed gets `grayscale(.65) sepia(.15)` at 85% opacity so the map joins the palette instead of arriving from another site.

**The Template-Owns-The-Gold Rule.** Gold belongs to the model, not to the tenant — the way graphite is Quadro's and kraft is Caderneta's. Every business that picks Clínica gets cream + its own `--marca` + this gold; there is no configuration field for it, on purpose (confirmed with the user). A tenant who wants a different second color has picked the wrong model, not found a missing setting.

**The Two-Golds Rule.** `--ouro` is *text*; `--ouro-claro` is *material* (line, ring, fill, selection) and, once, large italic text on the dark band. Don't swap them to "make the gold pop": the dark gold as a fill reads as mud, and the light gold as small text on cream is 1.9:1.

## Typography

Three type systems, matched to what each audience is doing.

### Painel — The Atelier Ledger
**Display Font:** Fraunces (variable, optical size + weight axes, `font-variation-settings: 'SOFT' 60, 'WONK' 1`), falling back to Georgia.
**Body Font:** Karla (300–700), system-ui fallback.
**Label/Mono Font:** IBM Plex Mono (400–600) — every time, hour, log entry, and slot label.

**Character:** A serif with just enough irregularity (`WONK 1`) to feel handwritten-adjacent sits over a plain grotesque body — an atelier ledger, not a spreadsheet. Numbers that matter (stat tiles, the wizard's title) get the serif treatment; numbers that are *data* (a 14:30 slot, a log timestamp) get monospace instead, so the two never compete for the same visual register.

**The Two-Number Rule.** A number is set in Fraunces when it's the headline of the moment (`.stat .v`, the assistant's step title) and in IBM Plex Mono when it's a coordinate someone is scanning against others (agenda times, registry timestamps). Don't set a scannable number in the display serif — it slows the exact reading it needs to support.

### Vital — The Plain Ledger
**Body Font:** `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (400–700).
**Label/Mono Font:** `'IBM Plex Mono', monospace` (400–600) on the audit-trail action label (`.v-rastro-acao`).

**Character:** Body and mono now share one type family — Plex Sans for prose, Plex Mono for the audit trail — instead of pairing an unrelated grotesque with the mono. Administrative and unadorned by intent stays true: no serif anywhere, weight carries the entire hierarchy (600–700 for headings and buttons, 400 for body). The family was Inter until this pass; Inter was declared but never imported in this bundle (a bug fixed the same session it was replaced), and the replacement was a deliberate identity decision, not a bug fix — Inter is flagged as an overused, indistinct face on AI-generated interfaces, and IBM Plex Sans gives Vital a real typographic relationship to its own mono instead of two unrelated families.

**The One-Plex Rule.** Vital's body and mono are both IBM Plex. Don't introduce a third, unrelated family for a new role — extend within Plex Sans's weight range first.

### Site — Bandeja
**Body Font:** Manrope (400–800), system-ui fallback. Replaced Inter this pass, for the same reason as Vital: Inter reads as an unexamined default rather than a chosen voice. Manrope was chosen specifically to preserve the single-family system below — it carries enough warmth in its terminals to still feel like a storefront at display sizes, without needing a second family to do it.

**Character:** One family for everything, including headings — hierarchy comes from size, weight (700 on headings) and negative letter-spacing (`-.02em`) rather than a font pairing. `font-size: 16px` on every form input is a deliberate floor, not a default: below it, iOS auto-zooms the viewport on focus, which would visibly break the booking window mid-flow.

**The One-Family Rule (site).** Bandeja deliberately uses Manrope alone, for every role. Don't add a second family for "more personality" — the model's restraint is the point, and the tenant's own injected accent color is where per-client personality already lives. (Caderneta, below, earns one exception to this instinct — on its own terms, not Bandeja's.)

### Site — Quadro de Horários
**Body Font:** Archivo (400–800) — a grotesk solid enough to carry a signage/industrial register without tipping into display-face territory.
**Mono Font:** JetBrains Mono (400–700) — the one model where a monospace face is load-bearing, not a costume: `--fonte-mono` is applied to every price, date, hour, and total (see the shared selector list at the top of `styles.css`, right after the type-scale block), so numbers read as scannable data the way a real departure board's do.
**Character:** structured and plain-spoken. The company name is the one place the model breaks the site-wide "no uppercase" instinct — `[data-template="quadro"] .identidade h1 { text-transform: uppercase }` — because a printed board's own lettering is capitalized, and this is the model whose thesis is a printed board.

### Site — Caderneta
**Body Font:** Figtree (400–800) — warm humanist grotesk, the body voice.
**Accent Font:** Caveat (600–700), exactly one use: `.jn-pronto h3`, the booking-confirmation heading. See the Caderneta color subsection above for why it stays confined there.

**The One-Mark Rule.** A model may earn one handwritten or otherwise expressive face for one specific, load-bearing moment — never for body text, never for more than one element. Caderneta's confirmation heading is the standing example; a second Caveat usage anywhere else in this model is drift, not reinforcement.

### Site — Clínica
**Body Font:** Manrope — the site's own, inherited from `:root`. Clínica no longer loads a second body family at all: `FONTES.clinica` in `tema.js` requests only `Instrument+Serif:ital@1`, one network request fewer than the previous pairing.
**Display Font:** Instrument Serif, **italic only**, weight 400 (`--fonte-display`, Georgia fallback) — and only ever on one word: the `<em>` inside a section title, and the last word of the company name in the hero. The title itself is Manrope; the display face is the single word.

The pair replaced Montserrat + Tenor Sans (the earlier Clínica pairing, taken from the client's brand kit) because the client then pinned a new reference (`Exemplo/artifacts/clinica-estetica`) whose own pairing is Manrope + Instrument Serif italic. That reference is the origin of the world, so its type came with it; the brand-kit pairing was not wrong, it was superseded.

**Character:** big, light and quiet, with one word that leans. Titles are Manrope at 400 (section titles) and 500 (the hero) with tight negative tracking (`-.04em`) and line-heights under 1 — the weight is in the size, not in the stroke — and the italic serif word carries all the warmth. Everything small goes uppercase and tracked: buttons, the olho, the top bar's name, the nav, the footer signature.

#### Hierarchy (Clínica)
- **Hero name** (`.identidade h1`: Manrope 500, `clamp(46px, 6.5vw + 8px, 92px)`, line-height .92, `-.04em`, `max-width: 12ch`, `text-wrap: balance`): the company name, its last word in Instrument Serif italic `--ouro-claro`. Overrides Bandeja's `clamp(38px, 5vw + 20px, 64px)` in the fluid-sizes table below.
- **Section title** (`.bloco-titulo`: Manrope 400, `clamp(34px, 3.4vw + 14px, 58px)`, line-height .98, `-.04em`, `max-width: 14ch`, `text-wrap: balance`, margin-bottom `--e-8`): "Escolha o seu *momento.*", "Quem cuida de *você.*" — one `<em>` each, chosen per section in the JSX, not mechanically the last word. Overrides Bandeja's `clamp(24px, 2vw + 16px, 30px)`.
- **Olho** (`.olho`: Manrope 700, 11px, `.28em`, uppercase, preceded by a 44px × 1px `--ouro-claro` fio; `--ouro` on light bands, `--sobre-marca-escura` on dark): one per section, above the title. The footer's small "Contato" heading (`.bloco-titulo.pequeno`) is restyled into the same device.
- **Buttons** (`.b`: 11px, 700, `.15em`, uppercase — also inside the booking window, it is one site): the pill shape stays; the voice changes.
- **Top bar** (`.barra-nome`: 12.5px, `.22em`, uppercase; `.barra-nav a`: 11px, 700, `.16em`, uppercase, `--cinza`, gold on hover).
- **Sobre / empty state / Agende copy** (17px, line-height 1.6–1.7, `--cinza`, 44–58ch): reading-size body, not caption-size — the "Sobre" section is only this paragraph under an olho, no invented title.
- **Agende card heading** (`h3`: 24px, 500, `-.02em`); **Destaque price** (`--t-destaque` weight lowered from 700 to 500 so the shared promo card speaks the same light voice as the titles).
- **Footer signature** (`.assinatura`: 11px, `.2em`, uppercase, `--sobre-marca-escura` at full opacity — white, not gold, for the 4.5:1 reason under Colors).

**The Two-Family Exception.** Clínica splits body and display into two families — Manrope for everything, Instrument Serif italic for one word per title. This is the second named exception to the system's One-Family instinct (the first is Caderneta's single Caveat heading): a pairing that arrived with a pinned reference, not a drift back toward "every surface wants two fonts."

**The One-Italic-Word Rule.** The serif appears in italic, at 400, on exactly one word per title, and nowhere else. A second italic word in the same title, a roman Instrument Serif anywhere, or the serif in a paragraph is drift — the device works because it is scarce.

**The Olho-Is-Clínica's Rule.** The olho (fio + tracked label above a title) is a kicker, which the craft floor bans by default; here it is kept because the pinned reference opens every section with it and it is part of what that world *is* — an exception granted by the brief, recorded as such. It exists only in Clínica's JSX (`TituloClinica`, the hero, the Sobre section), always with the fio (without it, it is just a label), one per section. Don't carry it to Bandeja, Quadro or Caderneta; the exception travels with the reference, not with the class name.

### Site's type scale

Eleven fixed role tokens for UI-density text, plus three fluid (`clamp()`) sizes for the handful of places that carry the page's actual editorial weight — see the `site-*` entries under `typography` in the frontmatter for the fixed steps. Two changes to the fixed scale are real (not just renaming): `.cat` (the category name inside the booking window) moved from 18px to `--t-titulo` (19px) to match `.jn-cab h2`'s weight class, and roughly ten near-duplicate values (10.5→11, 12→12.5, 13→13.5, 14→14.5, 15.5→15, and so on) were folded into the nearest step — deltas of half a pixel, imperceptible on screen, real in the stylesheet.

| Token | Size | Used for |
|---|---|---|
| `--t-rotulo` | 11px | Smallest uppercase labels — weekday header, summary "resumo" label, item captions |
| `--t-legenda` | 12.5px | Meta/caption text — form field labels, prices struck through, footnotes |
| `--t-auxiliar` | 13.5px | Secondary body — helper copy, descriptions, guide-column paragraphs |
| `--t-corpo-pq` | 14.5px | Small UI text — most button/label/value text that isn't the primary name |
| `--t-corpo` | 15px | Primary names — service name, option name, header brand icon initial |
| `--t-corpo-gr` | 16px | `<body>`'s own size. Also the floor forced onto every real `<input>`/`<select>`/`<textarea>` — those stay literal `16px`, never this token, so the rule survives even if the scale's values ever move |
| `--t-titulo-pq` | 17px | Sub-headings — guide-column step name, month name, promo-card name |
| `--t-titulo` | 19px | Step titles — booking-window header, category name, confirmation heading |
| `--t-destaque` | 24px | The price on a *secondary* promo card (`.promo-preco`) — see the fluid destaque size below for the primary one |
| `--t-secao` | 26px | `.bloco-titulo.pequeno`'s non-fluid sibling context; superseded for the main section titles by the fluid size below |
| `--t-hero` | 34px | Logo-mark initial, service-circle initial — object marks, not the company name anymore |

**The Sixteen-Sixty Rule.** `--t-corpo-gr` (16px) is a token; the literal `16px` on form inputs is not, on purpose. An input's size exists to stop iOS from zooming, not to express hierarchy — tying it to a token that might later be retuned for typographic reasons would silently reopen that bug.

### Site's fluid sizes

Three places carry real editorial weight and scale with the viewport instead of sitting on a fixed step — introduced when the header stopped needing a photo to feel intentional and started needing to carry that weight in type instead:

| Selector | `clamp()` | Used for |
|---|---|---|
| `.identidade h1` | `clamp(38px, 5vw + 20px, 64px)` | The company name — the single largest, most confident mark on the page, left-aligned, no uppercase |
| `.bloco-titulo` | `clamp(24px, 2vw + 16px, 30px)` | Section titles ("Serviços", "Mais promoções") |
| `.destaque-nome` / `.destaque-valor` | `clamp(24px, 3vw + 12px, 34px)` / `clamp(40px, 6vw, 60px)` | The featured combo's name and its discounted price |

Clínica redefines the first two rows (see its Hierarchy above): the company name goes to `clamp(46px, 6.5vw + 8px, 92px)` and section titles to `clamp(34px, 3.4vw + 14px, 58px)` — both larger and lighter, because in that model the type carries what the reference carried with size and air.

**The Fluid-Is-For-Weight Rule.** A fluid size exists only where the element's job is to carry visual weight on its own — the company name, a section title, a promo's price. Everything else (labels, buttons, body copy, form fields) stays on the fixed 11-step scale; a UI control that scales with viewport width is a control whose hit target and reading rhythm nobody can predict.

## Layout

Painel and Vital still have no formal spacing scale — spacing there is authored per component in literal pixels, and that remains correct until someone deliberately proposes a scale for those two. **Site now has one**, introduced to support personalization work: see `site-1`…`site-9` under `spacing` in the frontmatter.

**Painel** is a fixed-sidebar shell above 900px (240px lateral nav, dark) collapsing to a slide-in drawer with a 56px sticky top bar below it. Content column: `padding: 28px 32px 48px` desktop, `18px 16px 40px` mobile. The week agenda is the one genuinely custom layout: days on the X axis (not staff, which was tried and discarded — a column per person made the week seven taps to see), half-hour gridlines, overlapping appointments resolved into side-by-side lanes rather than stacked.

**Vital** centers a single content column, `max-width: 1000px`, splitting into a two-column `1fr 420px` grid above 900px (pitch copy left, form/card right) and stacking to one column below it.

**Site** is mobile-first and narrow by design: `.env` caps content at 640px so body text stays readable; only the service grid opens up to 900px (`.env-largo`) because a wide grid of circular photos breathes better than a wide column of text. The booking window itself is the one place the system goes wide (three-column grid up to 1120px: guide / step / summary), collapsing to a single column with the summary as a bottom sheet below 860px.

**Site — Clínica widens and slows the rhythm.** Three departures from the Bandeja layout above, all in `[data-template="clinica"]` rules, none in shared markup: (1) sections breathe at `clamp(72px, 9vw, 120px)` of vertical padding instead of `--e-9` (52px) — the reference runs 96–128px between bands, and at 52px the page read as a list, not as a house; fluid so the phone doesn't become a desert. (2) The hero is the one container wider than the rest of the site: `.clinica-hero` caps at **1180px** (the reference's own shell width), a two-column grid `1.05fr / .95fr` with `min-height: 640px` from 860px up, text left and portrait right, stacking to one column with the portrait *below* the text on the phone (the two decorative rings hide below 860px, because there they would cross the name and the button). (3) Every other section stays at **900px** — `.env` is widened from 640px to 900px on this model only, so "Sobre" and the footer share the same left edge as the `.env-largo` titles instead of jumping in from a narrower column; the Sobre paragraph keeps its measure with `max-width: 58ch`. The top bar's anchor nav (Serviços / Equipe / Avaliações / Contato, only the sections that actually rendered) appears from 900px; the Agende band is a `.85fr / 1.15fr` grid from 860px; the staff grid is `auto-fit, minmax(140px, 1fr)` capped at 780px.

**Site reads left, not center.** The header (`.identidade-in`), section titles (`.bloco-titulo`), and the "sobre" paragraph are all left-aligned now, a deliberate break from the earlier center-everything composition — the previous version was the category's own default (cover photo, centered name, centered section titles) closely enough that it was hard to tell this product's booking site from any other's. The service and promo *grids* still center each row internally (`Grade.jsx`'s own balancing logic depends on it, to avoid an orphaned single item on the last row), so a section reads left-anchored at the title and centered in its content grid below — a legitimate, common editorial pattern, not an inconsistency to resolve.

### Site's spacing scale

Nine steps (`--e-1` 4px through `--e-9` 52px, a 4px base per layout.md's own guidance — an 8-only scale misses the useful middle steps), applied wherever an existing literal was an *exact* match. This is a rhythm scale, not a full rewrite: most `gap`/`padding`/`margin` values on site already sat on this rhythm by hand, so tokenizing renamed them rather than changing them — the visual output is unchanged, the source of truth isn't scattered anymore.

| Token | Value |
|---|---|
| `--e-1` | 4px |
| `--e-2` | 8px |
| `--e-3` | 12px |
| `--e-4` | 16px |
| `--e-5` | 20px |
| `--e-6` | 24px |
| `--e-7` | 32px |
| `--e-8` | 40px |
| `--e-9` | 52px |

**The Rhythm-Isn't-Sizing Rule.** Touch targets (40/44/46/48/56/64px `min-height`) stay literal, on purpose. They're a minimum clickable area — an accessibility constant — not a statement about how much air belongs between two elements, and folding them into the spacing scale would blur that distinction the next time either number needs to change for its own reason. A real handful of one-off, optically-tuned values (5, 7, 9, 10, 11, 13, 14, 18, 22, 26, 30px, mostly inside the booking window's denser rows) also stay literal deliberately — they were tuned by eye in a working, shipped interface, and snapping them to the nearest scale step without visually re-verifying every one would trade a confirmed result for an assumed one. Don't treat their literal-ness as unfinished work; treat the nine steps above as where *new* spacing decisions should land first.

## Elevation & Depth

Two of the three systems use soft ambient shadow on floating and interactive elements; the third stays flat and lets borders carry all the depth.

**Site and Painel — layered.** Both rest flat at the surface level (cards, list rows) and reserve shadow for things that float above the page: the booking window (`0 24px 70px -20px rgba(0,0,0,.5)`), the painel's sticky save bar and toasts (`0 8px 30px -14px rgba(0,0,0,.5)`), the site's logo/photo circles — always diffuse and dark-tinted, never colored, never sharp-edged.

Site carries two shadow vocabularies now, used for different jobs. `--sombra` (`0 1px 2px rgba(0,0,0,.04), 0 8px 24px -16px rgba(0,0,0,.18)`) is the original ambient shadow: ownerless light, used where nothing about the surface implies a direction (the booking window, the header logo mark). `--sombra-bandeja` / `--sombra-bandeja-hover` (`-3px 10px 20px -14px rgba(37,45,40,.35), 0 1px 2px rgba(37,45,40,.06)` at rest, deeper on hover) is directional — light from one side, the tint pulled from the brand ink rather than pure black — introduced for the service-circle grid, where the "A Bandeja" direction (see Overview) treats each service as an object resting on a lit surface, not an icon floating in space. Don't reach for `--sombra-bandeja` outside that context; it reads as a specific material choice (an object with weight and a light source), not a generic elevation bump.

**Site — Clínica: green-tinted, long-throw, and a layer of paper.** Clínica redefines all three site shadows in the same green-black as its ink (`rgba(63,80,67,…)`), never gray-black, and drops Bandeja's sideways offset: `--sombra` becomes `0 8px 24px rgba(63,80,67,.06)` (the reference's own `--shadow-sm`, on the antes/depois frame, the Instagram panel and the map), and `--sombra-bandeja` / `-hover` become `0 18px 48px -22px rgba(63,80,67,.22), 0 1px 2px rgba(63,80,67,.05)` / `0 24px 56px -22px rgba(63,80,67,.28), 0 2px 4px rgba(63,80,67,.07)` — a long, soft fall straight down (service circles, staff circles, the floating badge; the FAB sits at the hover value permanently because it is always floating). The Agende card carries its own one-off, warmer shadow (`0 18px 45px rgba(80,70,45,.08)`, brown-tinted for the beige it sits on). Over everything sits **grain**: `main::after`, a fixed SVG `feTurbulence` noise at `opacity: .035`, `z-index: 60` — above the page, deliberately *below* the booking window (`z-index: 100`), which stays clean. More than 3.5% reads as dirt on a photograph. The top bar has no shadow at all on this model; it separates by a 10px `backdrop-filter` blur over 94% cream instead.

**Vital — flat.** No shadow vocabulary at all in `web/src/vital/styles.css`; every card, box and empresa row is a 1px border (`--v-linha`) on a paper or ground surface. Depth reads as a color-value step (paper on ground), not as cast shadow. This is a real, confirmed difference from the other two systems, not an oversight to "fix."

### Named Rules
**The Float-Only-Shadow Rule (site, painel).** Shadow appears only on elements that visually float above the base layer — modals, sticky bars, toasts, the photo/logo circle. A card at rest never carries one.

**The Grain-Stops-At-The-Window Rule (Clínica).** The paper grain is a property of the page, not of the product: it sits at `z-index: 60` and the booking window at 100, so the moment someone is choosing a time the surface is clean. Don't raise the grain above the window, and don't push it past 3.5%.

## Shapes

**Painel** ranges from 7px (small controls, the sidebar toggle) through 12px (cards, inputs, modals sit at 10–20px depending on size) up to a full pill (999px) on every button and chip. The sidebar itself and its rail have no radius — it's the one squared-off surface in the system, anchoring the rounded content against a hard edge.

**Vital** is more restrained: 9px on buttons and inputs, 13px on the auth/cadastro card, 16px on the confirmation panel. Never a pill — this is the clearest single shape difference from painel and site, both of which pill every button.

**Site — Bandeja** commits to one radius almost everywhere via `--raio: 14px` (inputs, options, the booking window itself), except: full circles for the logo and every service/category photo, and a pill (`--pilula: 999px`) for every button and the day-availability dot's parent. The circle is the system's signature silhouette — "recognize the photo before you read the name" is the stated reason services are laid out as a circle grid rather than a list. `--raio` and `--pilula` are two separate tokens on purpose: Quadro (below) sharpens both to the same near-flat value, but a model is free to sharpen containers while keeping buttons pill-shaped, or the reverse, without the two fighting each other.

**Site — Quadro de Horários** sets both `--raio` and `--pilula` to `6px` — the model's one deliberate shape break from the rest of the system. A departure board doesn't have pill-shaped buttons; sharpening both tokens together, instead of leaving buttons pill while squaring off cards, is what makes the model read as one coherent decision rather than a half-measure. Service circles stay circular regardless (that geometry is the shared "recognize the photo" grammar every model inherits, not a Bandeja-only shape) — only radius-based corners flatten.

**Site — Caderneta** keeps `--raio` closer to Bandeja's (12px) and leaves `--pilula` at 999px — its thesis calls for no shape break, so it takes none. A model earns a shape deviation from its own concrete metaphor (Quadro's printed board), never as a generic "make it feel different" move.

**Site — Clínica** rounds a little more, and adds one silhouette. `--raio` goes to **16px** (the badge, the map frame, `--raio` consumers inside the booking window); `--pilula` stays 999px, so every button is still a pill — now an uppercase, tracked one. Two containers sit above the token on purpose: the Agende card at **24px** (the one card on the page that is an invitation, not a row) and the antes/depois frame and Instagram panel at 20px. The signature is the **arch**: the hero portrait is clipped to `210px 210px 20px 20px` (a full half-round on top, soft corners below) at `aspect-ratio: .82` and `max-width: 430px`, with an offset gold ring drawn 12px outside it at `220px 220px 22px 22px` — the ring is a separate `::before`, not a border, so it floats off the photo. The band closes with a cream **ellipse** (`.identidade::after`, 30px tall, `clip-path: ellipse(62% 100% at 50% 100%)`) so the hero ends on a curve, not a rule. Circles remain the shared grammar (96px staff marks, the 56px FAB, the 36px badge icon, the 36px "+" mark on each service card, the two 320/224px decorative rings) — Clínica adds the arch to the circle, it doesn't replace it. The one circle it *did* give up is the service photo: on this model services are **cards** (`.cartao`, `--raio` 16px, a 1.75:1 photo on top — see Cards below), because the client asked for the reference's card layout by name; the circle grid stays the grammar of the other three models.

**Site — `--raio-pq` (10px), one value across every model.** The compact control radius — calendar day, time chip, form field, the booking window's close button, the top bar's nav-link hover — found repeated six times as a bare literal before it had a name. Not redefined per `[data-template]`: unlike `--raio`/`--pilula`, none of its six call sites already varied by model, so giving it one flat value keeps today's rendering identical while still naming the token. A model that wants its own compact-control radius earns that the same way Quadro earned sharpening `--raio`/`--pilula` together — a stated reason, not a drive-by override.

## Components

### Buttons
- **Painel:** pill radius (999px), `padding: 11px 18px`. Primary (`.btn-p`) is lacquer-on-white; dark (`.btn-d`) is ink-on-porcelain for a secondary emphasis tier; ghost (`.btn-g`) is a bordered paper button; a WhatsApp-green variant (`.btn-wa`, `#1f9d55`) exists specifically for the "send via WhatsApp" action and is the one hardcoded off-palette color in the system, justified because it borrows WhatsApp's own brand recognition rather than Vital's.
- **Vital:** 9px radius, full-width by default (`.v-btn`), purple-on-white, `filter: brightness(1.1)` on hover rather than a second named color — the only surface that uses a filter instead of a discrete hover token.
- **Site:** pill radius, `min-height: 48px` (a hard floor for comfortable touch, not a suggestion), primary is tenant-accent-on-white-text; secondary (`.b-c`) is bordered, turning accent-colored border+text on hover.
- **Site — Clínica:** same pills, different voice — every `.b` goes 11px / 700 / `.15em` / uppercase, inside the booking window too, and lifts `translateY(-2px)` on hover (`.18s ease`) instead of only shifting color. One extra variant, **gold** (`.clinica-cta-ouro`: `--ouro-claro` fill, `--texto` on top, `brightness(1.04)` on hover), used in exactly two places: the hero's "Agende seu horário" and the WhatsApp FAB. Every other filled button — the top bar's "Agendar", the Agende card's CTA, "Seguir no Instagram" — is the ordinary `.b-p` in the tenant's `--marca-escura`. Beside the gold CTA sits a **text link** (`.clinica-cta-link`, "Conheça os serviços", same uppercase voice, inherits the band's white, gold on hover), so the hero offers one action and one glance, not two buttons; the same link, in `--texto` with gold hover, closes the services section ("Falar no WhatsApp", only when the tenant has a number). The service cards carry **no visible button at all**: the card is the button (a transparent `.cartao-acao` stretched over it, with an `aria-label`), and the 36px "+" circle in the photo's corner is the only cue — as in the reference.

### Chips (painel only)
- Pill-shaped, paper background, ink text at rest; `.on` state inverts to solid ink with porcelain text. Category-filter chips get a distinct treatment (`.chip-cat.on`: blush background, lacquer-deep text) so "filtering the view" reads differently from "selecting an item" even though both are chips.

### Cards / Containers
- **Painel:** `.card` — paper background, 16px radius (via `--rounded.painel-lg` in the token layer, `border-radius:16px` in code), 1px line border, no shadow at rest.
- **Vital:** `.v-caixa` / `.v-empresa` / `.v-numero` — 13–16px radius, 1px border, no shadow, paper on ground.
- **Site:** the booking window is the signature container — 16px radius, heavy floating shadow, three-column grid at rest; individual option rows (`.jn-opcao`) are 12px radius bordered rows that fill with tenant-accent-soft on hover. Promo cards (`.promo`) follow the Float-Only-Shadow Rule explicitly: flat border at rest, a `translateY(-3px)` lift plus `--sombra-bandeja` and a tenant-accent border on hover — the same directional-light gesture `.svc-circulo` uses, extended here so the two card types read as one family instead of one animated and one static.
- **Site — header:** no longer a fixed-height photo band with an overlapping logo. `.identidade` is its own section with a `--marca-fundo` background, normal document flow (no negative margin, no overlap trick), sized to its content. A cover photo (`marca.capa`), when present, renders as a separate `.capa` strip *above* the header, not the header's backdrop — the header's typographic treatment is identical with or without one. `BarraTopo` tracks this: it renders `firme` (solid, dark text) immediately when there's no cover photo, since the transparent-over-photo treatment has nothing to sit over and would put light-colored text on the header's light background.
- **Site — price/duration:** `.svc-meta` stacks price above duration (price at `--t-titulo-pq`, duration as a small tracked uppercase caption at `--t-legenda`) instead of setting them inline in the same voice — a product-label read, not a price-list row. Promo cards keep their own inline treatment (struck-through/current/economize) since that pattern is about showing a *comparison*, not a single object's label.
- **Site — Destaque (`.destaque`):** the first combo, when one exists, gets a full color-committed block (`background: var(--marca-escura)`, `color: var(--sobre-marca-escura)` — the full-fill pair, see Colors above) instead of joining the promo-card grid — a Committed color strategy used exactly once on the page, for exactly the fact worth committing color to (the number that has to convince on its own: the discounted price, set at the fluid destaque size). Any additional combos still render as ordinary `.promo` cards beneath it, under a "Mais promoções" heading; comparing several offers side by side is a grid's job, a single featured offer is a stage's job. The seal (`.destaque-selo`) sits inverted (`--sobre-marca-escura` background, `--marca-escura` text) and overlaps the block's top edge — a stamp on the object, not a text kicker in the reading flow above a heading. `.promo-selo` (the smaller badge on an ordinary promo card) uses the same full-fill pair, not the plain accent — it's still a solid-color chip, same rule as any other full fill.
- **Site — Clínica's hero (`HeroClinica`, in `Clinica.jsx`).** The one hero in the system with its own component, because its composition (two columns, a portrait slot) can't be reshuffled out of the shared `.identidade` markup. A band of `--marca-escura` with `--sobre-marca-escura` text, `position: relative`, closed underneath by the cream ellipse. Left column (`max-width: 34rem`): the **olho is the tenant's slogan** (white label, gold fio — no invented kicker, the data is the slogan); the **company name** as the `h1`, its last word split off into `<em>` and set in Instrument Serif italic `--ouro-claro` (a one-word name gets no italic — the gesture is the model's, the data is the name); **one sentence** of `sobre` (`primeiraFrase()`, so the hero doesn't repeat the Sobre section); the **gold pill CTA** that opens the real booking window plus the text link to `#servicos`; the address as a link at 80% opacity, gold on hover. Right column (`.clinica-hero-quadro`, max 430px): the **portrait in the arch** (see Shapes), `object-fit: cover; object-position: top`, in **natural color** — the reference tinted it `grayscale(.8) mix-blend-luminosity` under a sage color layer, and the client removed that by her own hand; the build applies no filter and no blend. The seed tenant shows one photo, the monochrome one (`profissional-laura.jpg`); it was the color one (`capa.jpg`) until Sep/2026, when the choice was switched. The build still applies no filter — the black-and-white is in the file itself. Around it the offset gold ring, and at the lower-left corner the **floating badge** (`.clinica-hero-selo`: cream, 16px radius, gold-tinted border, `--sombra-bandeja`, a 36px gold circle with a `Sparkles` icon, "Hora marcada online / sem cadastro, sem senha" at 11px — a product truth, not a slogan) which drifts 7px up and down on a 5s `ease-in-out` loop (`clinica-flutua`). Two decorative gold rings (320px and 224px, 1px at 30% alpha) sit top-right behind the portrait, hidden below 860px. Without a photo the arch shows the business's initial, large, on `--marca` — never an invented image. **This hero has no entrance sequence**: `identidade-sobe` belongs to the shared header and doesn't run here; the badge's float is the only authored motion in the band.
- **Site — Clínica's service cards (`CartoesClinica` / `.cartao`, in `Clinica.jsx`).** The reference's treatment card, carried over whole because the client asked for it by name (2026-09-18): a two-column grid from 700px (one column below), **12px gap** — tight on purpose, so the cards read as one grid and not a stack of ads. Each card: `--raio` (16px), a `--linha` border, a **70% cream** fill over the tinted `--faixa` band (`color-mix(in srgb, var(--fundo) 70%, transparent)`); on hover it goes opaque cream, lifts `translateY(-4px)` over `.3s`, takes `--sombra` and a border of `--ouro-claro` mixed 70% into `--linha`. Top: the photo at **1.75:1**, `object-fit: cover`, in natural color with **no gradient veil** (the reference darkened the bottom to hold an "Imagem ilustrativa" pill; our photos are the tenant's real ones and need no disclaimer), scaling to 1.05 over `.7s` on hover; without a photo, the initial on `--marca-clara` / `--sobre-marca-clara`, the same fallback the circle grid uses. In the photo's top-right corner a **36px circle with a `Plus`** (cream at 85%, a white/50 hairline, `--cinza` icon; `--ouro-claro` fill and `--texto` icon on hover) — decorative, `aria-hidden`. Body at `--e-6` padding: an optional **rótulo** in the olho voice (`--t-rotulo` / 700 / `.2em` / uppercase / `--ouro`), the **name** at `--t-destaque` / 500 / `-.02em`, an optional **description** at `--t-corpo-pq` / 1.6 / `--cinza` clamped to three lines, and a **footer** pushed to the bottom (`margin-top: auto`, so neighbours' footers align) above a `--linha` rule: duration and price in the tracked-caps caption voice (`--t-rotulo` / 700 / `.16em` / `--fraco`). What fills those slots is only tenant data: in **category mode** the rótulo is "N opções", the photo is the first service's, the description is the service names joined by " · ", and the footer is "a partir de" the lowest price; in **service mode** the rótulo is the category (omitted when there is only one), then the service's own description, duration and price ("Sob consulta" when the tenant hides prices). The reference's per-treatment tagline ("Pele renovada") has no field to come from and was not invented. Keyboard focus lands on the whole card (`.cartao:has(.cartao-acao:focus-visible)`, 3px `--marca-escura`); `prefers-reduced-motion` removes the lift and the zoom.
- **Site — Clínica's section title (`TituloClinica`).** Olho + `h2.bloco-titulo` with one `<em>`, wrapped in `Revela`. Every Clínica section opens with it — Sobre (olho only, then the paragraph), Serviços ("Escolha o seu *momento.*"), Equipe ("Quem cuida de *você.*"), Resultados ("Pequenas mudanças, *grandes sensações.*"), Avaliações ("Cuidado que *fica na memória.*"), Agende ("Seu cuidado *começa aqui.*"), Onde estamos ("Um lugar para *você chegar.*"). The italic's color is the band's (Colors → Clínica).
- **Site — Clínica's band order, for the seed tenant.** Hero (`--marca-escura`) → Sobre (cream) → the Destaque promo card (cream, the card itself in `--marca-escura`) → Serviços (`--faixa`) → Equipe (`.bloco-cheio`, `--marca-escura`) → Antes/Depois (`--faixa`) → Avaliações (cream) → Agende (`--bege`) → Instagram (`--faixa`) → Mapa (cream) → Rodapé (`.bloco-cheio`). Four surfaces alternate — cream, tinted, dark, beige — and no two dark bands touch. Sections that depend on data (Equipe, Instagram, Mapa, the promo) drop out silently when the tenant has none, and the order holds.
- **Site — Clínica's full-bleed band (`.bloco-cheio`):** a section whose entire background is the full-fill pair (`--marca-escura` / `--sobre-marca-escura`), not a wash — used on "Quem cuida de você" (`SecaoEquipe`) and the footer's "Contato" (`Rodape`, gated by a `cheio` prop), Clínica-only. It is the same surface as the hero, so the page opens and closes on the tenant's color and returns to it once in the middle. Children with their own fixed-token color (`.equipe-item p`, `.rodape-link`, `.pag`, `.assinatura`, `.bloco-titulo.pequeno`) get scoped overrides to `color: inherit` (or, for `.pag`, an inverted pill matching `.destaque-selo`'s pattern) — everything else inherits legibly by cascade alone. On this band the olho label goes white and the title's italic goes `--ouro-claro`; the footer's "Contato" is restyled as an olho (gold fio, white label, full opacity — the shared footer's `.7` fades would have put 11px text near 3:1), and the signature is white uppercase tracked. **The One-Fill-Doesn't-Repeat-Everywhere Rule.** `.bloco-cheio` is opt-in per section, not a model-wide background swap — Bandeja, Quadro, and Caderneta weren't asked for it and their own neutrals don't need it; don't apply it to a section on another model without the same evidence.
- **Site — Clínica's staff marks (`.equipe-foto`).** 96px circles always inside the dark band: a translucent cream fill (`color-mix(in srgb, var(--fundo) 14%, transparent)`), a 2px `--ouro-claro` ring, the initial at 32px / 700 in the band's own text color, `--sombra-bandeja`. The professional's own color (`p.cor`) goes on the **ring only**, never the fill — a dark staff color as a fill (the seed tenant's moss green, for one) vanished into the band together with the initial.
- **Site — the one authored motion.** `.identidade-in`'s children (logo, name, slogan, address, CTA) animate in on a staggered 0–0.3s sequence on page load (`identidade-sobe`), not on scroll. It is the only orchestrated, load-triggered moment in the system — everywhere else keeps the pre-existing, deliberately minor `.revela` scroll-reveal, so the header's entrance stays the one thing that feels considered rather than the whole page feeling busy. Respects `prefers-reduced-motion` through the system's existing global rule. Clínica's hero opts out of it (see above) and adds one ambient loop instead, the badge's 5s float.
- **Site — booking-window object marks.** `.jn-opcao-marca` / `.jn-opcao-foto` (the round mark beside a service or professional's name inside the booking window) carry the same `--sombra-bandeja` treatment and thin ring as the home's service circles, deepening to `--sombra-bandeja-hover` when the row around them is hovered. The row itself stays flat (Float-Only-Shadow Rule still holds for `.jn-opcao` as a container) — only the small object inside it catches light, the same distinction the home draws between a card and the photo mark on it.
- **Site — the confirmation moment (`.jn-pronto-marca`).** Grew from 62px to 76px, from a flat `--marca-clara` tint to solid `--marca-escura` with `--sobre-marca-escura` text and `--sombra-bandeja`, and gained a one-time scale-in (`pronto-entra`, .5s) on mount. It's the highest-satisfaction instant in the booking flow and the only place inside the window that uses committed color rather than an accent — a small, contained echo of the Destaque treatment, sized for a modal rather than a page.
- **Site — Clínica's extra sections (`Clinica.jsx`).** Six sections and one floating control, Clínica-only, rendered after the service cards: **Equipe** (real staff data — name, role, the initial mark above; never a fabricated photo; inside `.bloco-cheio`), **Antes e depois** (on the tinted `--faixa` band; a genuinely working comparison slider — a visible `<input type="range">`, not a hidden drag trick — that renders two different truths depending on whether the tenant has a real, authorized case on file: with `casos` empty, both sides are a plain label on a flat tint and the section carries a permanent "Em breve" pill; with one or more `casos` (`{ antes, depois, titulo }`, real photos of a real client, entered only with signed image authorization — see `config.antesDepois` in `server/src/lib/tenant.js`), the slider shows the real pair, a corner tag naming each side, and a caption crediting the authorization; more than one case adds a row of `.comparar-caso` pills), **Avaliações** (the honest empty state, below), **Agende** (the beige band: left, a title and three facts of the system — hora marcada, confirmação pelo WhatsApp, sem cadastro — each with a gold icon; right, the **Agende card** (`.clinica-agende-cx`: cream, 24px radius, a border of `--ouro-claro` mixed 55% into `--linha`, the warm `0 18px 45px rgba(80,70,45,.08)` shadow, an olho "Primeiro passo", a 24px/500 heading, one sentence, and a full-width `.b-p` CTA at `18px` vertical padding that opens the real booking window). The reference's beige band was a form that posted to WhatsApp; ours opens the product), **Instagram** (on the tinted band: a `secao-cab` header — olho "Instagram", title "O dia a dia *continua lá.*", and at the right the `@handle` as an uppercase tracked link (`.insta-arroba`, `--texto`, gold on hover) — then the **profile panel** (`.insta-painel`: cream, 20px radius, `--linha` border, `--sombra`), whose header row (`.insta-cab`) is a 56px **avatar** (the tenant's logo, or the initial on `--marca-escura` / `--sobre-marca-escura`, with the same `--ouro-claro` ring the staff marks wear), the handle in bold, the business name under it in `--cinza`, and a `.b-p.b-peq` "Seguir". Under it, only when the tenant has publications, the **3×2 grid** (`.insta-grade`: 2 columns below 560px, square tiles, `gap: 1px` over a `--linha` background — the hairline the real app draws), each tile a link to the post (or to the profile when no post link was given), photo `object-fit: cover`, `scale(1.04)` over `.5s` on hover, a 32px cream `Play` badge top-right on `tipo: 'video'`. The tiles are whatever fills `config.instagramPosts` — today the tenant's own uploads from the painel, later the connected account's — and **never placeholder art**: with none, the panel is just the header and the real link), **Mapa** (a keyless Google Maps embed of the tenant's own address, desaturated into the palette), and the **WhatsApp FAB** (`.clinica-fab`: 56px gold circle, `--texto` icon, `--sombra-bandeja-hover` at rest, `scale(1.05)` on hover, fixed bottom-right above the safe-area inset, `z-index: 30` — below the booking window on purpose; absent when the tenant has no WhatsApp, because a button to nowhere is worse than none). The pattern across all of them: real data renders normally, and where no real data can exist yet, the section says so instead of inventing content — see PRODUCT.md's "Evidence on Hand" and the Nudge-Don't-Replace instinct applied to content, not just color.
- **Site — Clínica's empty state (`[data-template="clinica"] .vazio-cartao`).** Not a dashed box. On this model the "no reviews yet" state is *world text*: a gold `Star` outline and one sentence at 17px / 1.6 in `--cinza`, left-aligned with the title, `max-width: 44ch`, no border, no padding, no radius — the honest sentence in reading size, as if the page had simply said it. The dashed-card version stays on the other models. Same content rule (no fabricated reviews, no "5,0"), different register.
- **Site — the antes/depois drag handle (`.comparar-alca`/`.comparar-bolinha`).** Fixed white and fixed black-on-white, never a token, on purpose — this control floats over a client's photo, not over the model's `--fundo`, and a light or pastel tenant accent would vanish against skin of any tone. The corner tag (`.comparar-tag`) is fixed translucent black for the same reason. This is the one place on the site where a deliberately non-tenant, non-token color set is correct rather than a gap.
- **Site — the hero image carousel (`CarrosselHero`, in `Clinica.jsx`).** `.clinica-hero-visual` accepts `marca.capas` (an array) and auto-advances every 5s when there are 2+ images, pausing entirely under `prefers-reduced-motion`, with a row of 7px dots (`.clinica-ponto`, white at 55% / 100% for the current one) at the foot of the arch; with one image or none it renders a static photo or the initial mark — no pointless single-item rotation. The seed tenant carries a single `marca.capa` (the client kept one photo), so in development the arch is static; no Configurações screen writes `marca.capas` yet, only the single `marca.capa`, so from the painel the rotation is still unreachable — wiring a multi-image upload control is the remaining piece, not a rebuild of this component.

**The Truth-Over-Content Rule.** A section with nothing true to show says so, in the section's own voice, rather than filling the space with plausible-looking content. This applies hardest to content that reads as *evidence* — a before/after photo, a client review, a live social feed — because a visitor reads those as proof, not as decoration; a placeholder dressed as proof is a lie the layout tells even when no line of copy does. Product truth (PRODUCT.md, "Evidence on Hand") governs here at least as much as this document does.

### Inputs / Fields
- All three: 1px bordered, radius matching the surface's own scale (painel/vital ~10px, site 12px), focus state is a border-color shift to the surface's accent plus a soft `color-mix`/`rgba` glow ring at 12–15% opacity — consistent enough across all three that it reads as one shared instinct even though the tokens are unrelated.
- Site enforces `font-size: 16px` on every input specifically to defeat iOS's auto-zoom-on-focus inside the booking window.

### Navigation
- **Painel:** dark (ink) fixed sidebar ≥900px, slide-in drawer + sticky top bar below it. Active item gets a solid lacquer pill background; hover gets a translucent porcelain wash (`rgba(251,246,244,.08)`).
- **Vital:** a flat top bar with pill-style tab buttons (`.v-abas button.on`: purple-soft background, purple text) — no sidebar; Vital's information architecture is shallow enough not to need one.
- **Site:** a single floating top bar that starts transparent-over-cover-photo (white text, dark scrim) and solidifies (`--fundo` background, bottom border) after 120px of scroll — the only navigation in the system with a scroll-driven state change.
- **Site — Clínica:** the same bar, born solid (`temCapa` is forced false — there is no cover strip to float over, the portrait lives inside the hero), and restyled: cream at 94% with a 10px `backdrop-filter` blur, a 70%-alpha line beneath, no shadow; the tenant's name at 12.5px uppercase `.22em` **and no logo mark** — the 30px circle the other models show is unreadable at that size and the client asked for it out, so the tracked name is the bar's mark, as in the reference; and, from 900px, an **anchor nav** (Serviços / Equipe / Avaliações / Instagram / Contato — only the sections that rendered for this tenant, so no link points at a missing `id`) at 11px uppercase `--cinza`, gold on hover. Below 900px the nav hides and the bar keeps only "Falar" and the "Agendar" pill.

## Do's and Don'ts

### Do:
- **Do** keep the three token vocabularies fully separate. A color, radius, or font decision made for painel carries no default authority over vital or site, and vice versa.
- **Do** treat `--marca` and its derived shades on site as runtime data. Never hardcode a specific hex for "the site's brand color" in new site work — reference the CSS variable, and preserve the static fallback for pre-hydration paint.
- **Do** use `--sobre-marca-escura`, not `--sobre-marca`, for text on any surface colored with `--marca-escura` (or any other derived-and-darkened tenant shade). The two can legitimately differ.
- **Do** use the `--marca-escura`/`--sobre-marca-escura` pair, not `--marca`/`--sobre-marca`, for any new *solid-fill* surface on site (a filled button, a filled badge, a selected state) — see Colors, "Tenant accent, deep" — and reserve the plain pair for a thin accent (a border, an icon, a ring) that was never going to hold text at its own intensity anyway.
- **Do** reach for site's `--t-*` and `--e-*` tokens first for any new site typography or spacing — they cover the large majority of real cases, and a new literal value should be the exception you can name a reason for, not the default.
- **Do** use IBM Plex Mono for any new scannable number (times, ids, log entries, code) on painel or Vital; use the surface's display or body font for numbers that are headlines, not coordinates.
- **Do** keep shadow reserved for floating elements on site and painel (modals, sticky bars, toasts) and keep Vital flat — introducing shadow to a Vital surface at rest would be a silent system change, not a bug fix.
- **Do** use lucide-react, inline, for any new icon in any of the three bundles — it's the one convention all three already share.
- **Do** default to CSS for a model difference — tokens, or a narrowly-scoped structural override like Quadro's uppercase h1 — before reaching for a `template === 'x'` branch in `App.jsx`. One flag exists today (`ehClinica`, gating `HeroClinica` vs. the shared stacked `.identidade`, the olho on Sobre and Serviços, the six Clínica-only sections, the footer's `cheio`, the FAB and the top bar's anchor list — all of it in `Clinica.jsx` and a handful of ternaries in `Home`), earned because Clínica's header is a genuinely different composition (two columns, an image slot) and its sections don't exist on the other three — not a precedent for routing every future model difference through JSX. `Agendar.jsx` still has zero branches; keep it that way unless a model's booking-flow composition, not just its skin, is actually on the table.
- **Do** update `FUNDOS` in `tema.js` in the same change that edits a model's `--fundo` in `styles.css`. The two must agree — `FUNDOS` is what lets `comContraste()` and the light/dark wash direction reason about a model's ground without reading computed CSS, and a mismatch silently breaks contrast for that model only. (Clínica's `#F7F5ED` is in both places today.)
- **Do** use `--ouro` (`#7A5C2A`) for small gold text, and only on Clínica's three light bands (cream, `--faixa`, `--bege`) — 5.7 / ≥5.2 / 4.7:1. On a dark band the label goes `--sobre-marca-escura` and only the fio stays gold.
- **Do** keep Clínica's gold as the model's own, exactly as `styles.css` declares it: the tenant configures `--marca`, and the model supplies cream and gold around it. A second color the tenant *could* set is a different product decision, not a small addition to this one.
- **Do** keep the Clínica hero portrait in natural color — no `filter`, no `mix-blend-mode`, no color overlay. The client removed the reference's grayscale/luminosity tint herself; what ties the photo to the palette is the arch, the offset gold ring and the badge, not a wash over her face.
- **Do** give every Clínica title exactly one `<em>`, chosen for the phrase, and let the band decide its color (`--marca-legivel` on cream, `--marca-escura` on `--faixa`, `--ouro-claro` on `--marca-escura`). A one-word company name gets no italic at all.
- **Do** keep Clínica's sections honest before they are pretty: Avaliações renders its world-text empty state until a real review exists, Antes/Depois only shows an authorized real case, Equipe comes from real staff, Instagram's grid shows only publications the tenant actually put there (or, later, the connected account's) and collapses to the header and the real link when there are none. The reference had testimonials, a "5,0", "+8 anos" and six gradient tiles standing in for posts; none of it was carried over, and none of it may be added as placeholder.

### Don't:
- **Don't** reuse painel's `--lacquer` value for Vital's accent or vice versa just because they're visually close — they are two independently-maintained tokens that happen to be near each other today, not the same color.
- **Don't** give a Vital button or card a pill radius or a drop shadow — both are confirmed painel/site signatures that Vital deliberately doesn't share.
- **Don't** treat `--muted` (painel) or `--fraco` (site) as safe for body-length text at their current values without re-checking contrast if you shift them again — both were corrected once already (from `#806E7B`→`#7A6975` and `#9A9A9A`→`#737373`) specifically to clear WCAG AA; re-lightening either reopens that gap.
- **Don't** compute a tenant-derived color's on-top text once and reuse it for every shade derived from that color. `--sobre-marca` and `--sobre-marca-escura` can diverge; a future derived shade (a third hover state, a pressed state) needs its own `contraste()` call, not an assumption borrowed from the base color.
- **Don't** assume painel or Vital have a spacing scale — they still don't, on purpose, and inventing one for either as a side effect of unrelated work isn't this document's call to make.
- **Don't** repeat painel's `.btn-wa` pattern (a hardcoded off-palette brand color) for anything other than an actual WhatsApp affordance — it's a deliberate, singular exception, not a precedent for borrowing outside colors.
- **Don't** design a new site section as if a cover photo, logo, or service photo is guaranteed to exist. Only the seed tenant has them today (Laura Faust's real portraits and service photos); a freshly provisioned tenant has none, and the header redesign exists specifically because the previous one only looked finished with a photo present. Clínica's arch falls back to the initial on `--marca` for the same reason.
- **Don't** reach for `--sombra-bandeja` as a generic "make it pop" hover shadow outside the service-circle/promo-card context — it's a directional, brand-ink-tinted material choice tied to the tray thesis, not a stronger version of `--sombra`.
- **Don't** use `var(--marca)` directly as `color` for real text sitting on the page background in new site work — use `var(--marca-legivel)`. `--marca` alone has no contrast guarantee against a model's `--fundo`; that's exactly the bug this pass found and fixed in roughly fifteen places.
- **Don't** treat Quadro's uppercase hero name, or Caderneta's ruled header and one Caveat heading, as available to any other model. Each is a named exception earned by that model's own concrete metaphor (a printed board capitalizes; a notebook is ruled) — copying the device without the metaphor is decoration, not a system pattern.
- **Don't** set `--ouro-claro` (`#E8CF91`) as small text on any light band — it is 1.9:1 on cream. It is a fill, a line, a ring, a selection color, and once the *large* italic word on the dark band; the dark gold `--ouro` is the text gold.
- **Don't** add a tenant-facing setting for Clínica's gold, or read it from `marca` — it is template-owned (The Template-Owns-The-Gold Rule), like Quadro's graphite and Caderneta's kraft.
- **Don't** use the olho (`.olho`, fio + tracked label) outside Clínica. It is a kicker the craft floor bans by default, kept on this one model because the pinned reference is built on it; on the other three models it would be the drift the floor exists to catch.
- **Don't** assume the gold italic hero word passes for every tenant. `--ouro-claro` on `--marca-escura` has no per-tenant contrast guard (recorded in `ROADMAP.md`, "Achados"): 3.2:1 for the seed tenant is large-text AA, but a tenant whose darkened color lands mid-tone can dip under 3:1, and `tema.js` doesn't know the gold exists. Check it when a new Clínica tenant's color is not clearly dark; the fix, when it comes, is a `comContraste()`-derived token, not a hand-picked second gold.
- **Don't** put reviews, a rating, years of experience, client counts or any other proof-shaped number on a Clínica surface unless it is real tenant data with a field behind it. The pinned reference's "5,0" and "+8 anos" were left out on purpose (PRODUCT.md, "Evidence on Hand"); the empty state is the design.
