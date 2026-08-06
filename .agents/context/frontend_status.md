# ApiForge Frontend Status

This file is a living log of the frontend state.
**The agent MUST update this file upon completing any frontend task.**

---

## Page Inventory

| Page | File | JS | Status |
|---|---|---|---|
| Landing / home | `index.html` | `js/app.js` | ✅ Complete |
| Login | `login.html` | `js/app.js` | ✅ Complete |
| Sign up | `signup.html` | `js/app.js` | ✅ Complete |
| Dashboard | `dashboard.html` | `js/dashboard.js` | ✅ Complete |
| Projects | `projects.html` | `js/dashboard.js`, `js/projects.js` | ✅ Complete |

---

## Stub Link Registry

These links exist in `dashboard.html` but point to pages **that have not been built yet**.
Do not create these pages unless explicitly instructed. See Rule §7 in `frontend_dev_rules.md`.

| Sidebar / UI label | Target file | Location in source |
|---|---|---|
| Liked | `liked.html` | Sidebar nav |
| Templates | `templates.html` | Sidebar nav |
| Leaderboard | `leaderboard.html` | Sidebar nav |
| Notifications | `notifications.html` | Sidebar nav |
| Usage & Billing | `billing.html` | Sidebar nav (Account group) |
| Profile | `profile.html` | Sidebar nav (secondary) + account dropdown |
| Settings | `settings.html` | Sidebar nav (secondary) + account dropdown |

---

## CSS File Map

### `css/style.css` (1,725 lines)

Sections in order (each preceded by a `/* --- */` comment header):

| Section | Classes / what it covers |
|---|---|
| `:root` tokens | All CSS variables (colors, fonts, radii, container) |
| Reset | box-sizing, margin reset, image, button, link, input defaults |
| `body` | Background gradient, font, flex-column layout |
| `:focus-visible` | Accent-colored focus ring |
| `.container` | Max-width centered wrapper |
| Nav | `.nav`, `.nav__inner`, `.brand`, `.nav__links`, `.nav__link`, `.nav__cta`, `.nav__toggle` (hamburger) |
| Buttons | `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--block`, `.btn--loading` |
| Hero | `.hero`, `.hero__inner`, `.eyebrow`, `h1 .accent`, `.lede`, `.hero__actions`, `.hero__meta` |
| Terminal | `.terminal`, `.terminal__bar`, `.terminal__dot`, `.terminal__title`, `.terminal__body`, `.terminal__line`, `.terminal__prompt`, `.terminal__string`, `.terminal__key`, `.terminal__punc`, `.terminal__cursor` |
| Features | `.features`, `.features__inner`, `.feature`, `.feature__tag` |
| Auth | `.auth`, `.auth__card`, `.auth__eyebrow`, `.auth__subtitle`, `.field`, `.field label`, `.field input`, `.field__hint`, `.form__error`, `.auth__submit`, `.auth__switch`, `.auth__divider` |
| Footer | `.footer`, `.footer__inner`, `.footer__links` |
| Section heading | `.section-head` |
| Steps | `.steps`, `.steps__list`, `.step`, `.step__num` |
| Templates | `.templates`, `.templates__grid`, `.template-card`, `.template-card__meta`, `.template-card__stars`, `.template-card__tags`, `.tag` |
| Pricing | `.pricing`, `.pricing__grid`, `.plan`, `.plan--highlight`, `.plan__badge`, `.plan__name`, `.plan__tagline`, `.plan__list` |
| CTA | `.cta`, `.cta__actions` |
| Dashboard — sr-only | `.sr-only` |
| Dashboard — top navbar | `.dash-nav`, `.dash-nav__inner`, `.dash-nav__left`, `.dash-nav__right`, `.sidebar-toggle`, `.breadcrumb`, `.breadcrumb__item`, `.breadcrumb__sep`, `.plan-badge`, `.avatar` |
| Dashboard — account dropdown | `.account-menu`, `.account-menu__trigger`, `.account-menu__dropdown` |
| Dashboard — shell layout | `.dash-shell`, `.sidebar`, `.sidebar__nav`, `.sidebar__group`, `.sidebar__group-label`, `.sidebar__link`, `.sidebar__nav--secondary`, `.sidebar-backdrop` |
| Dashboard — main content | `.dash-main`, `.dash-main__header`, `.dash-main__subtitle`, `.dash-main__grid` |
| Dashboard — onboarding card | `.onboarding-card`, `.onboarding-card__body`, `.onboarding-card__top`, `.onboarding-card__title`, `.onboarding-card__progress`, `.onboarding-card__track`, `.onboarding-card__fill`, `.onboarding-steps`, `.onboarding-step`, `.onboarding-step__icon`, `.onboarding-step__cta`, `.onboarding-card__dismiss` |
| Dashboard — stat grid | `.stat-grid`, `.stat-card`, `.stat-card__label`, `.stat-card__value`, `.stat-card__hint`, `.stat-card__hint--warn` |
| Dashboard — panels | `.panel`, `.panel__head`, `.panel__title`, `.panel__link`, `.project-row`, `.project-row__name`, `.project-row__meta`, `.project-row__link` |
| Dashboard — activity | `.activity-list`, `.activity-item`, `.activity-item__dot`, `.activity-item__text`, `.activity-item__time` |
| Projects — page components | `.projects-header`, `.projects-tabs`, `.projects-tab`, `.tab-badge`, `.projects-toolbar`, `.search-box`, `.filter-select`, `.projects-container`, `.projects-grid`, `.project-card`, `.project-badge`, `.copy-route-btn`, `.projects-empty`, `.skeleton-card`, `@keyframes skeleton-shimmer`, `.pagination-bar`, `.pagination-btn`, `.page-num` |

### `css/responsive.css` (295 lines)

| Breakpoint | What changes |
|---|---|
| `≤1024px` (tablet) | Hero stacks to 1-col, features 2-col, steps/templates/pricing 2-col |
| `≤840px` (mobile nav) | Hamburger appears, nav links become off-canvas dropdown; sidebar becomes off-canvas drawer |
| `≤640px` (mobile) | Single-col layout everywhere, auth card compact, footer stacks, projects header & toolbar full width, pagination bar stacks |
| `≤380px` (small mobile) | Hero h1 smaller, plan badge hidden |

---

## JS Function Map

### `js/app.js` — shared across landing / auth pages

| Function | What it does |
|---|---|
| `initNavToggle()` | Hamburger toggle for `.nav__links` on mobile |
| `redirectIfLoggedIn()` | `GET /auth/me` — if session valid, redirects to dashboard |
| `initTerminalTyping()` | Animated terminal demo on `index.html` |
| `renderTerminalLines()` | Helper — renders terminal lines without animation (reduced-motion) |
| `escapeHtml()` | Escapes `&`, `<`, `>` for terminal output |
| `initLoginForm()` | `#login-form` submit → `POST /auth/login` |
| `initSignupForm()` | `#signup-form` submit → `POST /auth/register` |
| `showError(el, msg)` | Adds `.is-visible` to `.form__error` element |
| `hideError(el)` | Removes `.is-visible` from `.form__error` element |
| `setLoading(btn, bool, label)` | Toggles `.btn--loading` + disabled state on submit button |

### `js/dashboard.js` — dashboard shell only

| Function | What it does |
|---|---|
| `initSidebarToggle()` | Desktop: toggles `html.sidebar-collapsed` + localStorage; Mobile: toggles `html.sidebar-mobile-open` + backdrop |
| `syncToggleAria(toggle, isMobile)` | Keeps `aria-expanded` correct when breakpoint changes |
| `initAccountMenu()` | Toggles `#account-dropdown.is-open`, closes on outside click / Escape |
| `initOnboardingCard()` | Dismiss button → adds `.is-dismissed` + sets localStorage |

### `js/projects.js` — projects page only

| Function | What it does |
|---|---|
| `initProjectsPage()` | Main entrypoint — initializes tab badges, binds controls, triggers shimmer loading |
| `updateTabBadges()` | Updates tab count badges for "My Projects" and "Shared with Me" |
| `bindEvents()` | Event listeners for tabs, search input, filter select, page size, and pagination buttons |
| `renderWithShimmer()` | Shows 6 skeleton shimmer loading cards with a 400ms network delay before rendering real cards |
| `renderProjects()` | Calculates filtered/searched projects, pagination slice, and renders grid cards or empty state |
| `createProjectCardHtml(p)` | Returns HTML string for an individual project card including auth badge, route copy, and last modified author |
| `bindCardActions()` | Card-level handlers: endpoint route copy to clipboard |
| `updatePaginationUI(...)` | Updates pagination info text ("Showing X–Y of Z"), prev/next state, and page number buttons |
| `escapeHtml(str)` | XSS helper escaping special HTML characters |


---

## UI State & Structural Decisions

- **Fonts**: Space Grotesk (headings/display), Inter (body), JetBrains Mono (code/mono/meta)
- **Color scheme**: Dark-mode only. Background `#0f0f0f`, accent orange `#f97316`
- **Styling**: Vanilla CSS only — no frameworks
- **Stack**: Raw HTML + CSS + JS. No build step, no bundler
- **Sidebar**: 240px expanded, 72px icon-only (collapsed). Off-canvas on ≤840px
- **Auth redirect target**: `/pages/dashboard.html` (see Known Issues)

---

## Known Issues & Pending Improvements

- **Breadcrumb is hardcoded** in `dashboard.html` (`task-app / tasks`) — needs dynamic rendering when project pages are built
- **Stat cards are hardcoded** (`2/2 projects`, `14 tables`, `0 APIs`, `0 requests`) — need real data from API
- **Plan badge is hardcoded** (`Free plan / 6/10 tables`) in the dashboard nav — needs real data
- **Avatar initial (`S`) is hardcoded** in account menu — needs to reflect the logged-in user
- **Account dropdown links** (`Profile`, `Settings`, `Sign out`) point to `#` — `Sign out` needs a real logout call
- **`redirectIfLoggedIn()` path**: redirects to `/pages/dashboard.html` — may need adjustment depending on server routing
- **No API yet**: backend routes (`/auth/login`, `/auth/register`, `/auth/me`) are referenced in `app.js` but the backend is not implemented yet. Forms currently fail gracefully with a network error.
