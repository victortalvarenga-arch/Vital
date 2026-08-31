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
---

# Design System: Vital

## Overview

**Creative North Star: "Two Ledgers and a Canvas"**

Vital is not one interface wearing three skins — it is three coherent, independently-evolved visual systems, each serving a public that never sees the other two. The product's own architecture forces this: site, painel and `vital.html` are separate Vite bundles, separate CSS files, separate audiences, and the codebase already gives two of the three systems descriptive token names (`porcelain`, `lacquer`, `blush`, `ink`) that read like they were designed on purpose, not defaulted into.

Two of the three are **ledgers** — fixed, opinionated, unapologetically branded design languages that exist regardless of which tenant is using the product. **The Atelier Ledger** (painel) is warm, serif-headlined, porcelain-and-lacquer, built for a person who opens it fifty times a day from a phone at the counter. **The Plain Ledger** (`vital.html`) is the same record-keeping instinct with the warmth stripped out — purple, Inter, mostly borders, because this is where the Vital *team* administers other people's businesses and the tone is administrative trust, not hospitality.

The third is **The Blank Canvas** (site) — the one system in the product whose primary color is not a design decision at all. `--marca` arrives at runtime from the tenant's own config; the system's real signature is everything that *doesn't* change: the pill-shaped buttons, the circular photo grid, the 14px corner radius, the slow zoom-in on the cover photo. Site is the only surface designed to be worn by a color it doesn't choose.

Within that canvas, site's composition now carries a second, more specific thesis: **A Bandeja** (the tray). Mood-referenced from a real neighborhood esthetics studio's Instagram (not a generic spa-site convention — the calibration this pass explicitly worked against was "cream background, elegant serif, gold accent," the category's own cliché), the idea is that each service is an object resting on a lit surface, not an icon floating on a card. Two structural consequences: the header no longer depends on a cover photo to look intentional (it didn't have one in the only environment this was built and checked in, and needed to work without one first), and shadow on the service circles is directional — light from one side, tinted from the brand ink — rather than the ambient ownerless glow the rest of the system uses. See `--sombra-bandeja` under Elevation & Depth.

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

**The tenant's accent color is a cross-cutting axis, independent of model.** Whichever of the four a business picks, their own `corPrimaria` still drives every button, focus ring, and price emphasis — a model changes the *neutrals* it sits on (paper white, graphite dark, kraft, clinical white-gray), the shape language, the type, and the shadow philosophy, never who owns the accent.

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

Thesis: booking here feels like a real premium clinic — mood-referenced from an actual clinic's site (inspiraestetica.com.br), not the category's generic idea of "premium."

- **Ground** (`#FFFFFF`) / **Ink** (`#1E2023`, cool near-black, not pure black).
- **Gray** (`#4B4F55`) / **Muted** (`#65696F`, 5.52:1 — darkened once from an initial `#767B82` that read 4.26:1, just under AA).
- **Line** (`#E4E5E7`) / **Surface** (`#F6F7F8`).
- Shadow stays ambient and non-directional like Bandeja's original `--sombra`, just quieter (lower opacity, larger blur) — the reference's "sombras sutis," not Bandeja's tray-light.
- **The one structural device Clínica does earn: a two-column header.** `HeroClinica` (in `App.jsx`) replaces the shared stacked `.identidade` with text left / image panel right — the reference's own composition, and the one hero shape in the whole system with a dedicated component instead of a CSS override, because no CSS reshuffle of the shared markup could produce it. `BarraTopo` never gets the transparent-over-photo treatment here (`temCapa` is forced false) since there's no separate cover strip to float over. Without `marca.capa` (true for every seed company today), the image panel shows the business's own initial, large, on a `--marca-fundo` tint — never an invented photo. Beyond that one header, restraint (generous space, quiet shadow, one confident neutral sans) is the identity, and adding a second device the reference didn't have would be decorating a thesis whose whole point is not decorating.

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
**Body Font:** Montserrat (400–800), replacing an earlier placeholder (Hanken Grotesk). **Display Font:** Tenor Sans, on the company name and section titles only (`--fonte-display`) — a Google Fonts stand-in for "ALTA," a tall, thin, geometric sans whose own license couldn't be confirmed; Tenor Sans reads closest to it without the risk. Both came from a second real reference, stronger than the first: the actual brand kit of Laura Faust, Vital's first confirmed client (an esthetics studio, Joinville/SC) — Montserrat + a tall geometric display face is literally her chosen pairing, not just a mood match. Adopted as the model's own default, not a client-only override — the pairing earns its place as a genuinely good "premium clinic" combination on its own terms, the same way her `#98a68c` earned its place as the model's color default (see Colors, above).

**The Two-Family Exception.** Clínica splits body and display into two families — Montserrat for everything, Tenor Sans only for `.identidade h1` and `.bloco-titulo`. This is the second named exception to the system's One-Family instinct (the first is Caderneta's single Caveat heading): a deliberate pairing earned by a real reference, not a drift back toward "every surface wants two fonts."

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

**The Fluid-Is-For-Weight Rule.** A fluid size exists only where the element's job is to carry visual weight on its own — the company name, a section title, a promo's price. Everything else (labels, buttons, body copy, form fields) stays on the fixed 11-step scale; a UI control that scales with viewport width is a control whose hit target and reading rhythm nobody can predict.

## Layout

Painel and Vital still have no formal spacing scale — spacing there is authored per component in literal pixels, and that remains correct until someone deliberately proposes a scale for those two. **Site now has one**, introduced to support personalization work: see `site-1`…`site-9` under `spacing` in the frontmatter.

**Painel** is a fixed-sidebar shell above 900px (240px lateral nav, dark) collapsing to a slide-in drawer with a 56px sticky top bar below it. Content column: `padding: 28px 32px 48px` desktop, `18px 16px 40px` mobile. The week agenda is the one genuinely custom layout: days on the X axis (not staff, which was tried and discarded — a column per person made the week seven taps to see), half-hour gridlines, overlapping appointments resolved into side-by-side lanes rather than stacked.

**Vital** centers a single content column, `max-width: 1000px`, splitting into a two-column `1fr 420px` grid above 900px (pitch copy left, form/card right) and stacking to one column below it.

**Site** is mobile-first and narrow by design: `.env` caps content at 640px so body text stays readable; only the service grid opens up to 900px (`.env-largo`) because a wide grid of circular photos breathes better than a wide column of text. The booking window itself is the one place the system goes wide (three-column grid up to 1120px: guide / step / summary), collapsing to a single column with the summary as a bottom sheet below 860px.

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

**Vital — flat.** No shadow vocabulary at all in `web/src/vital/styles.css`; every card, box and empresa row is a 1px border (`--v-linha`) on a paper or ground surface. Depth reads as a color-value step (paper on ground), not as cast shadow. This is a real, confirmed difference from the other two systems, not an oversight to "fix."

### Named Rules
**The Float-Only-Shadow Rule (site, painel).** Shadow appears only on elements that visually float above the base layer — modals, sticky bars, toasts, the photo/logo circle. A card at rest never carries one.

## Shapes

**Painel** ranges from 7px (small controls, the sidebar toggle) through 12px (cards, inputs, modals sit at 10–20px depending on size) up to a full pill (999px) on every button and chip. The sidebar itself and its rail have no radius — it's the one squared-off surface in the system, anchoring the rounded content against a hard edge.

**Vital** is more restrained: 9px on buttons and inputs, 13px on the auth/cadastro card, 16px on the confirmation panel. Never a pill — this is the clearest single shape difference from painel and site, both of which pill every button.

**Site — Bandeja** commits to one radius almost everywhere via `--raio: 14px` (inputs, options, the booking window itself), except: full circles for the logo and every service/category photo, and a pill (`--pilula: 999px`) for every button and the day-availability dot's parent. The circle is the system's signature silhouette — "recognize the photo before you read the name" is the stated reason services are laid out as a circle grid rather than a list. `--raio` and `--pilula` are two separate tokens on purpose: Quadro (below) sharpens both to the same near-flat value, but a model is free to sharpen containers while keeping buttons pill-shaped, or the reverse, without the two fighting each other.

**Site — Quadro de Horários** sets both `--raio` and `--pilula` to `6px` — the model's one deliberate shape break from the rest of the system. A departure board doesn't have pill-shaped buttons; sharpening both tokens together, instead of leaving buttons pill while squaring off cards, is what makes the model read as one coherent decision rather than a half-measure. Service circles stay circular regardless (that geometry is the shared "recognize the photo" grammar every model inherits, not a Bandeja-only shape) — only radius-based corners flatten.

**Site — Caderneta and Clínica** keep `--raio` closer to Bandeja's (12px) and leave `--pilula` at 999px — neither model's thesis calls for a shape break, so neither takes one. A model earns a shape deviation from its own concrete metaphor (Quadro's printed board), never as a generic "make it feel different" move.

**Site — `--raio-pq` (10px), one value across every model.** The compact control radius — calendar day, time chip, form field, the booking window's close button, the top bar's nav-link hover — found repeated six times as a bare literal before it had a name. Not redefined per `[data-template]`: unlike `--raio`/`--pilula`, none of its six call sites already varied by model, so giving it one flat value keeps today's rendering identical while still naming the token. A model that wants its own compact-control radius earns that the same way Quadro earned sharpening `--raio`/`--pilula` together — a stated reason, not a drive-by override.

## Components

### Buttons
- **Painel:** pill radius (999px), `padding: 11px 18px`. Primary (`.btn-p`) is lacquer-on-white; dark (`.btn-d`) is ink-on-porcelain for a secondary emphasis tier; ghost (`.btn-g`) is a bordered paper button; a WhatsApp-green variant (`.btn-wa`, `#1f9d55`) exists specifically for the "send via WhatsApp" action and is the one hardcoded off-palette color in the system, justified because it borrows WhatsApp's own brand recognition rather than Vital's.
- **Vital:** 9px radius, full-width by default (`.v-btn`), purple-on-white, `filter: brightness(1.1)` on hover rather than a second named color — the only surface that uses a filter instead of a discrete hover token.
- **Site:** pill radius, `min-height: 48px` (a hard floor for comfortable touch, not a suggestion), primary is tenant-accent-on-white-text; secondary (`.b-c`) is bordered, turning accent-colored border+text on hover.

### Chips (painel only)
- Pill-shaped, paper background, ink text at rest; `.on` state inverts to solid ink with porcelain text. Category-filter chips get a distinct treatment (`.chip-cat.on`: blush background, lacquer-deep text) so "filtering the view" reads differently from "selecting an item" even though both are chips.

### Cards / Containers
- **Painel:** `.card` — paper background, 16px radius (via `--rounded.painel-lg` in the token layer, `border-radius:16px` in code), 1px line border, no shadow at rest.
- **Vital:** `.v-caixa` / `.v-empresa` / `.v-numero` — 13–16px radius, 1px border, no shadow, paper on ground.
- **Site:** the booking window is the signature container — 16px radius, heavy floating shadow, three-column grid at rest; individual option rows (`.jn-opcao`) are 12px radius bordered rows that fill with tenant-accent-soft on hover. Promo cards (`.promo`) follow the Float-Only-Shadow Rule explicitly: flat border at rest, a `translateY(-3px)` lift plus `--sombra-bandeja` and a tenant-accent border on hover — the same directional-light gesture `.svc-circulo` uses, extended here so the two card types read as one family instead of one animated and one static.
- **Site — header:** no longer a fixed-height photo band with an overlapping logo. `.identidade` is its own section with a `--marca-fundo` background, normal document flow (no negative margin, no overlap trick), sized to its content. A cover photo (`marca.capa`), when present, renders as a separate `.capa` strip *above* the header, not the header's backdrop — the header's typographic treatment is identical with or without one. `BarraTopo` tracks this: it renders `firme` (solid, dark text) immediately when there's no cover photo, since the transparent-over-photo treatment has nothing to sit over and would put light-colored text on the header's light background.
- **Site — price/duration:** `.svc-meta` stacks price above duration (price at `--t-titulo-pq`, duration as a small tracked uppercase caption at `--t-legenda`) instead of setting them inline in the same voice — a product-label read, not a price-list row. Promo cards keep their own inline treatment (struck-through/current/economize) since that pattern is about showing a *comparison*, not a single object's label.
- **Site — Destaque (`.destaque`):** the first combo, when one exists, gets a full color-committed block (`background: var(--marca-escura)`, `color: var(--sobre-marca-escura)` — the full-fill pair, see Colors above) instead of joining the promo-card grid — a Committed color strategy used exactly once on the page, for exactly the fact worth committing color to (the number that has to convince on its own: the discounted price, set at the fluid destaque size). Any additional combos still render as ordinary `.promo` cards beneath it, under a "Mais promoções" heading; comparing several offers side by side is a grid's job, a single featured offer is a stage's job. The seal (`.destaque-selo`) sits inverted (`--sobre-marca-escura` background, `--marca-escura` text) and overlaps the block's top edge — a stamp on the object, not a text kicker in the reading flow above a heading. `.promo-selo` (the smaller badge on an ordinary promo card) uses the same full-fill pair, not the plain accent — it's still a solid-color chip, same rule as any other full fill.
- **Site — Clínica's full-bleed band (`.bloco-cheio`):** a section whose entire background is the full-fill pair, not a wash — used on "Quem cuida de você" (`SecaoEquipe`) and the footer's "Contato" (`Rodape`, gated by a `cheio` prop), Clínica-only. Exists because Clínica's own neutrals are white/light-gray throughout (ground, `--marca-fundo`'s wash, `--superficie`) and, without at least one true full-color section, the page read as entirely white regardless of the tenant's chosen color. Children with their own fixed-token color (`.equipe-item p`, `.rodape-link`, `.pag`, `.assinatura`, `.bloco-titulo.pequeno`) get scoped overrides to `color: inherit` (or, for `.pag`, an inverted pill matching `.destaque-selo`'s pattern) — everything else inherits legibly by cascade alone. **The One-Fill-Doesn't-Repeat-Everywhere Rule.** `.bloco-cheio` is opt-in per section, not a model-wide background swap — Bandeja, Quadro, and Caderneta weren't asked for it and don't have the same all-white-neutrals problem Clínica does; don't apply it to a section on another model without the same evidence.
- **Site — the one authored motion.** `.identidade-in`'s children (logo, name, slogan, address, CTA) animate in on a staggered 0–0.3s sequence on page load (`identidade-sobe`), not on scroll. It is the only orchestrated, load-triggered moment in the system — everywhere else keeps the pre-existing, deliberately minor `.revela` scroll-reveal, so the header's entrance stays the one thing that feels considered rather than the whole page feeling busy. Respects `prefers-reduced-motion` through the system's existing global rule.
- **Site — booking-window object marks.** `.jn-opcao-marca` / `.jn-opcao-foto` (the round mark beside a service or professional's name inside the booking window) carry the same `--sombra-bandeja` treatment and thin ring as the home's service circles, deepening to `--sombra-bandeja-hover` when the row around them is hovered. The row itself stays flat (Float-Only-Shadow Rule still holds for `.jn-opcao` as a container) — only the small object inside it catches light, the same distinction the home draws between a card and the photo mark on it.
- **Site — the confirmation moment (`.jn-pronto-marca`).** Grew from 62px to 76px, from a flat `--marca-clara` tint to solid `--marca-escura` with `--sobre-marca-escura` text and `--sombra-bandeja`, and gained a one-time scale-in (`pronto-entra`, .5s) on mount. It's the highest-satisfaction instant in the booking flow and the only place inside the window that uses committed color rather than an accent — a small, contained echo of the Destaque treatment, sized for a modal rather than a page.
- **Site — Clínica's extra sections (`Clinica.jsx`).** Five components, Clínica-only, rendered after the service grid: **Equipe** (real staff data — name, role, a color-tinted initial circle, never a fabricated photo; sits inside `.bloco-cheio`, see above), **Antes e depois** (a genuinely working comparison slider — a visible `<input type="range">`, not a hidden drag trick — that now renders two different truths depending on whether the tenant has a real, authorized case on file: with `casos` empty, both sides are a plain label on a flat tint and the section carries a permanent "Em breve" badge; with one or more `casos` (`{ antes, depois, titulo }`, real photos of a real client's face, entered only with signed image authorization — see `config.antesDepois` in `server/src/lib/tenant.js`), the slider shows the real photo pair, a corner tag naming which side is which, and a caption crediting the authorization. More than one case adds a row of `.comparar-caso` pills to switch between them), **Avaliações** (an honest empty-state card, not a carousel dressed around zero real reviews), **Instagram** (a link-out panel to the tenant's real `@handle`, never a fake grid pretending to show live posts the site has no API access to), **Mapa** (a keyless Google Maps embed of the tenant's own address). The pattern across all five: real data renders normally, and where no real data can exist yet, the section says so instead of inventing content — see PRODUCT.md's "Evidence on Hand" and the Nudge-Don't-Replace instinct applied to content, not just color.
- **Site — the antes/depois drag handle (`.comparar-alca`/`.comparar-bolinha`).** Fixed white and fixed black-on-white, never a token, on purpose — this control floats over a client's photo, not over the model's `--fundo`, and a light or pastel tenant accent would vanish against skin of any tone. The corner tag (`.comparar-tag`) is fixed translucent black for the same reason. This is the one place on the site where a deliberately non-tenant, non-token color set is correct rather than a gap.
- **Site — the hero image carousel (`CarrosselHero`).** `.clinica-hero-visual` already accepts `marca.capas` (an array) and auto-advances every 5s when there are 2+ images, pausing entirely under `prefers-reduced-motion`; with one image or none it renders exactly as before (a static photo, or the initial mark) — no pointless single-item rotation. No Configurações screen writes `marca.capas` yet, only the single `marca.capa`, so this mechanism is real and tested but currently unreachable from the painel; wiring a multi-image upload control is the remaining piece, not a rebuild of this component.

**The Truth-Over-Content Rule.** A section with nothing true to show says so, in the section's own voice, rather than filling the space with plausible-looking content. This applies hardest to content that reads as *evidence* — a before/after photo, a client review, a live social feed — because a visitor reads those as proof, not as decoration; a placeholder dressed as proof is a lie the layout tells even when no line of copy does. Product truth (PRODUCT.md, "Evidence on Hand") governs here at least as much as this document does.

### Inputs / Fields
- All three: 1px bordered, radius matching the surface's own scale (painel/vital ~10px, site 12px), focus state is a border-color shift to the surface's accent plus a soft `color-mix`/`rgba` glow ring at 12–15% opacity — consistent enough across all three that it reads as one shared instinct even though the tokens are unrelated.
- Site enforces `font-size: 16px` on every input specifically to defeat iOS's auto-zoom-on-focus inside the booking window.

### Navigation
- **Painel:** dark (ink) fixed sidebar ≥900px, slide-in drawer + sticky top bar below it. Active item gets a solid lacquer pill background; hover gets a translucent porcelain wash (`rgba(251,246,244,.08)`).
- **Vital:** a flat top bar with pill-style tab buttons (`.v-abas button.on`: purple-soft background, purple text) — no sidebar; Vital's information architecture is shallow enough not to need one.
- **Site:** a single floating top bar that starts transparent-over-cover-photo (white text, dark scrim) and solidifies (`--fundo` background, bottom border) after 120px of scroll — the only navigation in the system with a scroll-driven state change.

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
- **Do** default to CSS for a model difference — tokens, or a narrowly-scoped structural override like Quadro's uppercase h1 — before reaching for a `template === 'x'` branch in `App.jsx`. One branch exists today (`ehClinica`, gating `HeroClinica` vs. the shared stacked `.identidade`), earned because Clínica's header is a genuinely different composition (two columns, an image slot) that no CSS reshuffle of the shared markup could produce — not a precedent for routing every future model difference through JSX. `Agendar.jsx` still has zero branches; keep it that way unless a model's booking-flow composition, not just its skin, is actually on the table.
- **Do** update `FUNDOS` in `tema.js` in the same change that edits a model's `--fundo` in `styles.css`. The two must agree — `FUNDOS` is what lets `comContraste()` and the light/dark wash direction reason about a model's ground without reading computed CSS, and a mismatch silently breaks contrast for that model only.

### Don't:
- **Don't** reuse painel's `--lacquer` value for Vital's accent or vice versa just because they're visually close — they are two independently-maintained tokens that happen to be near each other today, not the same color.
- **Don't** give a Vital button or card a pill radius or a drop shadow — both are confirmed painel/site signatures that Vital deliberately doesn't share.
- **Don't** treat `--muted` (painel) or `--fraco` (site) as safe for body-length text at their current values without re-checking contrast if you shift them again — both were corrected once already (from `#806E7B`→`#7A6975` and `#9A9A9A`→`#737373`) specifically to clear WCAG AA; re-lightening either reopens that gap.
- **Don't** compute a tenant-derived color's on-top text once and reuse it for every shade derived from that color. `--sobre-marca` and `--sobre-marca-escura` can diverge; a future derived shade (a third hover state, a pressed state) needs its own `contraste()` call, not an assumption borrowed from the base color.
- **Don't** assume painel or Vital have a spacing scale — they still don't, on purpose, and inventing one for either as a side effect of unrelated work isn't this document's call to make.
- **Don't** repeat painel's `.btn-wa` pattern (a hardcoded off-palette brand color) for anything other than an actual WhatsApp affordance — it's a deliberate, singular exception, not a precedent for borrowing outside colors.
- **Don't** design a new site section as if a cover photo, logo, or service photo is guaranteed to exist. Nothing in this product's dev environment has one today, and the header redesign exists specifically because the previous one only looked finished with a photo present.
- **Don't** reach for `--sombra-bandeja` as a generic "make it pop" hover shadow outside the service-circle/promo-card context — it's a directional, brand-ink-tinted material choice tied to the tray thesis, not a stronger version of `--sombra`.
- **Don't** use `var(--marca)` directly as `color` for real text sitting on the page background in new site work — use `var(--marca-legivel)`. `--marca` alone has no contrast guarantee against a model's `--fundo`; that's exactly the bug this pass found and fixed in roughly fifteen places.
- **Don't** treat Quadro's uppercase hero name, or Caderneta's ruled header and one Caveat heading, as available to any other model. Each is a named exception earned by that model's own concrete metaphor (a printed board capitalizes; a notebook is ruled) — copying the device without the metaphor is decoration, not a system pattern.
