# ApiForge Design System Reference

This file is the agent's authoritative reference for the ApiForge frontend design system.
**Read this before writing any HTML or CSS.** Use only the tokens and classes documented here.

---

## CSS Custom Properties (`:root`)

### Colors

| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0f0f0f` | Page background |
| `--surface` | `#161616` | Sidebar, secondary surfaces |
| `--surface-raised` | `#1a1a1a` | Cards, auth card, terminal, panels, stat cards |
| `--border` | `#2a2a2a` | Default borders |
| `--border-hover` | `#3a3a3a` | Hovered borders |
| `--accent` | `#f97316` | Primary orange — CTAs, active states, progress fills, accent dots |
| `--accent-light` | `#fb923c` | Hover state for accent, eyebrow text, link text, stars |
| `--accent-dark` | `#ea580c` | Darker accent (available for use, not yet used in CSS) |
| `--accent-glow` | `rgba(249,115,22,0.16)` | Active sidebar item background, body gradient |
| `--text` | `#e5e5e5` | Primary text |
| `--text-muted` | `#8a8a8a` | Secondary text, labels, hints |
| `--text-faint` | `#4a4a4a` | Tertiary / decorative text, timestamps |
| `--success` | `#22c55e` | Success green — eyebrow dot, completed onboarding steps |
| `--error` | `#f87171` | Error red — form errors, danger menu items |

### Typography

| Variable | Value | When to use |
|---|---|---|
| `--font-display` | `'Space Grotesk', sans-serif` | All headings (`h1`–`h3`), brand name, plan names, stat values, panel titles |
| `--font-body` | `'Inter', sans-serif` | All body copy, form labels, general UI text |
| `--font-mono` | `'JetBrains Mono', monospace` | Code, terminal output, eyebrows, tags, meta info, breadcrumbs, footer, sidebar group labels |

### Layout & Shape

| Variable | Value | Usage |
|---|---|---|
| `--container` | `1120px` | Max-width for content columns |
| `--radius-sm` | `6px` | Buttons, inputs, small chips |
| `--radius-md` | `10px` | Template cards, stat cards, dropdowns |
| `--radius-lg` | `16px` | Auth card, terminal, plan cards, panels, onboarding card |

---

## Button Classes

| Class combination | Appearance | Use case |
|---|---|---|
| `.btn.btn--primary` | Orange fill, dark text | Primary CTA |
| `.btn.btn--ghost` | Transparent + `--border` border | Secondary action |
| `.btn.btn--primary.btn--block` | Full-width primary | Auth form submit |
| `.btn.btn--ghost.btn--block` | Full-width ghost | Pricing card secondary |
| `.btn.btn--primary.btn--sm` | Compact primary | Dashboard nav "New project" |
| `.btn.btn--loading` | 0.7 opacity, pointer-events none | Applied by JS during async requests |

---

## Landing & Marketing Component Classes

### Navigation
```
.nav                   sticky header (landing pages)
.nav__inner            flex row, max-width container
.brand                 mono logo text; .brand span = accent-colored "Forge"
.nav__links            horizontal link group; .is-open = mobile dropdown open
.nav__link             individual nav link
.nav__cta              flex group of CTA buttons
.nav__toggle           hamburger button (hidden on desktop, shown ≤840px)
```

### Eyebrow / Pill Badge
```
.eyebrow               pill with green dot prefix, mono font, accent-light text
                       → used inside .section-head or above h1 on hero
```

### Hero Section
```
.hero                  section with top padding
.hero__inner           2-col grid (text | terminal); stacks to 1-col ≤1024px
.lede                  large body paragraph below h1 (class on <p>)
.hero__actions         flex row of CTA buttons; stacks to col ≤640px
.hero__meta            mono small-print stat row below actions
```

### Terminal Widget
```
.terminal              dark card with border-radius-lg, shadow
.terminal__bar         top bar with dots + title
.terminal__dot         decorative circle (3 of them)
.terminal__title       mono filename label in bar
.terminal__body        scrollable code area, min-height 220px
.terminal__line        one line of output (text-muted)
.terminal__prompt      $ prefix (accent-light)
.terminal__string      string values (lime green #a3e635)
.terminal__key         key names (sky blue #7dd3fc)
.terminal__punc        punctuation (text-faint)
.terminal__cursor      blinking block cursor (accent color)
```

### Section Heading (shared)
```
.section-head          centered block: max-width 620px, auto margins
  .eyebrow             → pill badge (centered via margin:auto)
  h2                   display font, clamp size
  p                    text-muted description
```

### Steps (How It Works)
```
.steps                 section with top/bottom padding, border-top
.steps__list           3-col grid → 2-col ≤1024px → 1-col ≤640px
.step                  individual step block
.step__num             circular mono number, accent color, border, surface-raised bg
```

### Features Strip
```
.features              section with padding, border-top
.features__inner       3-col grid → 2-col → 1-col; padding-top 64px
.feature               individual feature block
.feature__tag          mono comment-style label (e.g. "// builder"), accent color
```

### Template Cards
```
.templates             section
.templates__grid       3-col grid → 2-col → 1-col
.template-card         surface-raised card with hover lift + border transition
.template-card__meta   mono flex row: author + star count
.template-card__stars  accent-light star count
.template-card__tags   flex wrap of .tag chips
.tag                   mono pill chip (border, text-muted)
```

### Pricing Cards
```
.pricing               section
.pricing__grid         3-col grid → 2-col → 1-col; align-items stretch
.plan                  flex-col card (surface-raised, border-radius-lg)
.plan--highlight       accented border + orange glow shadow (most popular)
.plan__badge           orange pill badge ("Most popular")
.plan__name            display font plan name
.plan__tagline         text-muted tagline
.plan__list            checklist; each li has ::before "✓" in accent-light
```

### Final CTA
```
.cta                   centered section, border-top
.cta__actions          centered flex row of buttons → stacks ≤640px
```

### Footer
```
.footer                border-top, padding, margin-top: auto
.footer__inner         flex row (copyright | links); stacks ≤640px
.footer__links         flex row of muted anchor links
```

---

## Auth Page Component Classes

```
.auth                  flex center wrapper (flex:1, padding)
.auth__card            white-ish card (surface-raised, border, radius-lg, shadow)
.auth__eyebrow         mono comment label above h1 (e.g. "// authenticate")
.auth__subtitle        text-muted subtitle below h1
.auth__submit          margin-top on submit button
.auth__switch          centered "Already have an account?" link row
.auth__divider         horizontal rule with centered label (flex + ::before/after lines)

.field                 form field wrapper (margin-bottom: 18px)
  label                display block, 0.78rem, text-muted
  input                full-width, bg=#bg, border, radius-sm; :focus → accent border
  .field__hint         tiny helper text below input (text-faint)

.form__error           hidden by default; .is-visible → display:block
                       red-tinted bg, error-color text, padding, radius-sm
```

---

## Dashboard Shell Component Classes

### Top Navbar
```
.dash-nav              sticky top navbar (z:60), blur bg
.dash-nav__inner       flex row space-between
.dash-nav__left        flex row: sidebar-toggle + brand + breadcrumb
.dash-nav__right       flex row: plan-badge + new-project btn + account-menu
.sidebar-toggle        icon button (36×36), border, text-muted
.breadcrumb            mono flex row of path segments
  .breadcrumb__item    muted link; --current = text (white)
  .breadcrumb__sep     faint slash separator
.plan-badge            two-line display: tier (accent-light) + usage (text-faint)
.plan-badge__tier      UPPERCASE mono label
.plan-badge__usage     hidden ≤1024px
.btn--sm               compact button variant (9px 16px padding, 0.82rem font)
```

### Account Menu
```
.account-menu          relative wrapper
.account-menu__trigger 36×36 circle button
.avatar                display initial letter (display font, accent-light)
.account-menu__dropdown absolute dropdown; .is-open → display:flex
  a                    menu item; a.is-danger:hover → error color
```

### Shell Layout
```
.dash-shell            flex row (sidebar + main), flex:1
```

### Sidebar
```
.sidebar               240px wide, surface bg, border-right
                       → 72px when html.sidebar-collapsed
                       → fixed off-canvas (translateX(-100%)) ≤840px
                       → slides in when html.sidebar-mobile-open
.sidebar__nav          flex-col space-between, full height, padding 20px 12px
.sidebar__group        group of nav items
.sidebar__group-label  UPPERCASE mono section label (hidden when collapsed)
.sidebar__link         flex row (icon + text); .is-active → accent-glow bg + accent-light text
                       → icon-only + centered when html.sidebar-collapsed
                       → tooltip on hover when collapsed (via ::after)
.sidebar__nav--secondary bottom group, border-top
.sidebar-backdrop      dim overlay, shown ≤840px when sidebar-mobile-open
```

### Main Content Area
```
.dash-main             flex:1, min-width:0, padding 40px
.dash-main__header     margin-bottom: 28px
.dash-main__subtitle   text-muted subtitle below h1
.dash-main__grid       2-col grid (1.3fr 1fr) → 1-col ≤1024px
```

### Onboarding Card
```
.onboarding-card       flex row card; hidden when html.onboarding-dismissed or .is-dismissed
.onboarding-card__body flex:1
.onboarding-card__top  flex row: title + progress text
.onboarding-card__title display font label
.onboarding-card__progress mono faint progress text
.onboarding-card__track progress bar track (6px, --bg)
.onboarding-card__fill  progress bar fill (accent, width set inline by JS or HTML)
.onboarding-steps      flex col of step rows
.onboarding-step       flex row; .is-done → icon green fill + label text-white
                        .is-pending → empty circle icon
.onboarding-step__icon 20×20 circle (border); done = success bg
.onboarding-step__cta  margin-left:auto CTA button
.onboarding-card__dismiss X button (top-right)
```

### Stat Grid
```
.stat-grid             4-col grid → 2-col ≤1024px → 1-col ≤640px
.stat-card             surface-raised card, radius-md
.stat-card__label      UPPERCASE mono faint label
.stat-card__value      large display font number
.stat-card__hint       small helper text; --warn variant = accent-light
```

### Panels (Recent Projects / Activity)
```
.panel                 surface-raised card, radius-lg
.panel__head           flex row: title + link
.panel__title          display font heading
.panel__link           small accent-light "View all →" link

.project-row           flex row, border-bottom (last-child: no border)
.project-row__name     display font, semi-bold
.project-row__meta     mono faint row of dot-separated stats
.project-row__link     → arrow link, accent-light on hover

.activity-list         flex col, gap 16px
.activity-item         flex row: dot + text
.activity-item__dot    8px orange circle
.activity-item__text   text-muted description; strong = text-white
.activity-item__time   mono faint timestamp (display:block)
```

---

## JS-Toggled State Classes

These classes are set programmatically — do not apply them manually in static HTML unless simulating a state.

| Class / selector | Applied to | Set by | Effect |
|---|---|---|---|
| `html.sidebar-collapsed` | `<html>` | `dashboard.js` + localStorage | Sidebar → 72px icon-only |
| `html.sidebar-mobile-open` | `<html>` | `dashboard.js` | Off-canvas sidebar slides in + backdrop visible |
| `html.onboarding-dismissed` | `<html>` | Inline `<script>` in head | Onboarding card hidden before paint |
| `.nav__links.is-open` | `.nav__links` | `app.js` | Mobile nav dropdown revealed |
| `.account-menu__dropdown.is-open` | `#account-dropdown` | `dashboard.js` | Account dropdown visible |
| `.onboarding-card.is-dismissed` | `#onboarding-card` | `dashboard.js` | Card hidden (JS side-effect) |
| `.onboarding-step.is-done` | `.onboarding-step` | Static HTML | Completed step (green icon) |
| `.onboarding-step.is-pending` | `.onboarding-step` | Static HTML | Pending step (empty circle) |
| `.form__error.is-visible` | `.form__error` | `app.js` | Inline error message shown |
| `.btn--loading` | submit buttons | `app.js` | Button disabled + faded during fetch |
| `.sidebar__link.is-active` | `.sidebar__link` | Static HTML | Highlights current page in sidebar |
