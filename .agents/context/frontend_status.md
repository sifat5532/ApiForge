# ApiForge Frontend Status

This file is a living log of the frontend state.
**The agent MUST update this file upon completing any frontend task.**

---

## Project Structure

```
frontend/
├── app.js                  ← Express server entry point
├── routes/
│   └── pages.router.js     ← Clean URL page routes (one route per HTML page)
└── public/
    ├── pages/              ← All HTML files live here (NOT in static root)
    └── resources/          ← express.static root — assets served from domain root
        ├── css/
        │   ├── style.css
        │   └── responsive.css
        └── js/
            ├── app.js
            ├── dashboard.js
            └── [page-specific].js
```

**Routing model**: Clean URLs (`domain.com/projects`) are achieved by keeping HTML in
`pages/` and serving via `res.sendFile()`. Asset paths inside HTML (`css/style.css`,
`js/app.js`) resolve against the domain root → `public/resources/`.

---

## Page Inventory

| Page | File | JS | Status |
|---|---|---|---|
| Landing / home | `pages/index.html` | `js/app.js` | ✅ Complete |
| Login | `pages/login.html` | `js/app.js` | ✅ Complete |
| Sign up | `pages/signup.html` | `js/app.js` | ✅ Complete |
| Dashboard | `pages/dashboard.html` | `js/dashboard.js` | ✅ Complete |
| Projects | `pages/projects.html` | `js/dashboard.js`, `js/projects.js` | ✅ Complete |
| New Project | `pages/new-project.html` | `js/dashboard.js`, `js/new-project.js` | ✅ Complete |
| Liked Templates | `pages/liked.html` | `js/dashboard.js`, `js/liked.js` | ✅ Complete |
| Notifications | `pages/notifications.html` | `js/dashboard.js`, `js/notifications.js` | ✅ Complete |
| Templates | `pages/templates.html` | `js/dashboard.js`, `js/templates.js` | ✅ Complete |
| Leaderboard | `pages/leaderboard.html` | `js/dashboard.js`, `js/leaderboard.js` | ✅ Complete |
| Logout route | N/A (`/logout`) | Backend `/auth/logout` bridge | ✅ Complete |

---

## Stub Link Registry

These links exist in `pages/dashboard.html` but point to pages **that have not been built yet**.
Do not create these pages unless explicitly instructed. See Rule §7 in `frontend_dev_rules.md`.

| Sidebar / UI label | Target file | Stub `href` / `data-stub` |
|---|---|---|
| Usage & Billing | `pages/billing.html` | `href="#" data-stub="billing"` |
| Profile | `pages/profile.html` | `href="#" data-stub="profile"` |
| Settings | `pages/settings.html` | `href="#" data-stub="settings"` |

---

## CSS File Map

### `css/style.css` (~3,377 lines)

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
| New Project — page components | `.create-project-grid`, `.create-project-card`, `.form-section-title`, `.form-textarea`, `.toggle-field`, `.switch`, `.switch-slider`, `.tag-selection-box`, `.tag-section-block`, `.tag-block-label`, `.popular-tags-group`, `.tag-chip`, `.selected-tags-container`, `.tag-chip__remove`, `.tag-input-group`, `.plan-summary-card`, `.plan-tier-toggle`, `.tier-toggle-btn`, `.plan-badge-pill`, `.plan-facilities-list`, `.plan-limits-list`, `.plan-meter-track`, `.plan-meter-fill` |
| Liked — page components | `.liked-header`, `.liked-header__count`, `.liked-toolbar`, `.liked-grid`, `.liked-card`, `.liked-card__author`, `.liked-card__avatar`, `.liked-card__author-info`, `.liked-card__author-name`, `.liked-card__author-handle`, `.liked-card__unlike-btn`, `.liked-card__title`, `.liked-card__desc`, `.liked-card__tags`, `.liked-tag`, `.liked-card__footer`, `.liked-card__date`, `.liked-card__stars`, `.liked-card__open-btn` |
| Templates — page components | `.tmpl-toolbar`, `.tmpl-filter-row`, `.tmpl-chip-group`, `.tmpl-chip`, `.tmpl-chip--tag`, `.tmpl-grid`, `.tmpl-card`, `.tmpl-card--shimmer`, `.tmpl-card__author-row`, `.tmpl-card__author-name`, `.tmpl-card__title`, `.tmpl-card__title-link`, `.tmpl-card__desc`, `.tmpl-card__tags`, `.tmpl-card__footer`, `.tmpl-card__rating`, `.tmpl-card__rating-val`, `.tmpl-card__rating-count`, `.tmpl-card__meta`, `.tmpl-card__uses`, `.tmpl-card__date`, `.tmpl-auth-badge`, `.tmpl-auth-badge--jwt`, `.tmpl-auth-badge--oauth`, `.tmpl-auth-badge--apikey`, `.tmpl-auth-badge--none`, `.tmpl-shimmer-line`, `.tmpl-shimmer-tag`, `.tmpl-shimmer-tags`, `.tmpl-shimmer-footer`, `@keyframes tmpl-shimmer`, `.tmpl-empty` |
| Notifications — page components | `.notif-page-header`, `.notif-page-header__left`, `.notif-page-header__actions`, `.notif-unread-badge`, `.notif-tabs`, `.notif-tab`, `.notif-tab__count`, `.notif-list`, `.notif-item`, `.notif-item--unread`, `.notif-item--removing`, `.notif-item--shimmer`, `.notif-avatar-col`, `.notif-avatar`, `.notif-avatar--shimmer`, `.notif-avatar--user`, `.notif-avatar__initials`, `.notif-avatar--system`, `.notif-avatar--system-session`, `.notif-avatar--system-warn`, `.notif-avatar--system-billing`, `.notif-avatar--system-activity`, `.notif-unread-dot`, `.notif-body`, `.notif-meta`, `.notif-actor`, `.notif-actor--warn`, `.notif-username`, `.notif-time`, `.notif-text`, `.notif-link`, `.notif-role-badge`, `.notif-role-badge--muted`, `.notif-outcome-badge`, `.notif-outcome-badge--accepted`, `.notif-outcome-badge--declined`, `.notif-collab-status`, `.notif-collab-status--accepted`, `.notif-collab-status--declined`, `.notif-stars`, `.notif-star--filled`, `.notif-star--empty`, `.notif-review`, `.notif-device`, `.notif-session-meta`, `.notif-session-chip`, `.notif-actions`, `.notif-btn-accept`, `.notif-btn-decline`, `.notif-btn-ghost`, `.notif-btn-upgrade`, `.notif-plan-badge`, `.notif-plan-badge--free`, `.notif-plan-badge--lite`, `.notif-plan-badge--pro`, `.notif-strong`, `.notif-limit-val`, `.notif-chips`, `.notif-chip`, `.notif-chip--mono`, `.notif-controls`, `.notif-ctrl-btn`, `.notif-empty`, `.notif-shimmer-line`, `@keyframes notif-shimmer` |

### `css/responsive.css` (330 lines)

| Breakpoint | What changes |
|---|---|
| `≤1024px` (tablet) | Hero stacks to 1-col, features 2-col, steps/templates/pricing 2-col, create-project-grid stacks to 1-col |
| `≤840px` (mobile nav) | Hamburger appears, nav links become off-canvas dropdown; sidebar becomes off-canvas drawer; notif page header stacks |
| `≤640px` (mobile) | Single-col layout everywhere, auth card compact, footer stacks, projects header & toolbar full width, pagination bar stacks, notif controls hidden, notif item 2-col grid |
| `≤380px` (small mobile) | Hero h1 smaller, plan badge hidden |

---

## JS Function Map

### `js/app.js` — shared across landing / auth pages

| Function | What it does |
|---|---|
| `initNavToggle()` | Hamburger toggle for `.nav__links` on mobile |
| `initTerminalTyping()` | Animated terminal demo on `index.html` |
| `renderTerminalLines()` | Helper — renders terminal lines without animation (reduced-motion) |
| `escapeHtml()` | Escapes `&`, `<`, `>` for terminal output |
| `initLoginForm()` | `#login-form` submit → `POST /auth/login` |
| `initSignupForm()` | `#signup-form` submit → `POST /auth/register` |
| `showError(el, msg)` | Adds `.is-visible` to `.form__error` element |
| `hideError(el)` | Removes `.is-visible` from `.form__error` element |
| `setLoading(btn, bool, label)` | Toggles `.btn--loading` + disabled state on submit button |

### `js/auth-redirect.js` — public pages only
Self-executing script that checks session status (`/auth/me`) and redirects to `/dashboard` if the user is already logged in. Used on `index.html`, `login.html`, and `signup.html`.

### `js/auth-guard.js` — dashboard pages only
Self-executing script that checks session status (`/auth/me`). Redirects to `/login` if unauthenticated, or `/` if the backend is down. Used on all private dashboard pages to protect routes.

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

### `js/new-project.js` — new project page only

| Function | What it does |
|---|---|
| `initBreadcrumbFlow()` | Renders dynamic topbar breadcrumbs (`Home / New Project` vs `Home / Projects / New Project`) based on entry origin parameter or referrer |
| `initTagManager()` | Manages dark-mode tag search box, popular tags one-click selection buttons, database tag dictionary autocomplete dropdown, and removable active tag pills |
| `renderPopularTags()` | Renders interactive popular tag chips with instant toggle state synchronization (`.is-selected`) |
| `initProjectForm()` | Form submission handling, validation, loading spinner animation, and redirection |
| `escapeHtml(str)` | XSS helper escaping HTML characters in dynamic tag names and breadcrumbs |

### `js/liked.js` — liked templates page only

| Function | What it does |
|---|---|
| `initLikedPage()` | Main entrypoint — guards to liked.html, binds events, triggers shimmer loading |
| `bindLikedEvents()` | Event listeners for search input, sort dropdown, sort direction toggle, page size select, and pagination prev/next |
| `getFilteredLiked()` | Filters out unliked items, applies search query (name/tag/author/desc), then sorts by selected option and direction |
| `renderLikedWithShimmer()` | Shows 6 skeleton shimmer cards with 400ms delay before rendering real cards |
| `renderLiked()` | Paginates filtered results, renders liked template cards or empty-state, updates header count badge |
| `createLikedCardHtml(t)` | Returns HTML string for one liked-template card — author avatar, name, description, tags, created date, stars, unlike button |
| `bindLikedCardActions()` | Binds unlike button — animates card out (opacity + scale), then removes it from rendered set |
| `updateLikedPaginationUI(...)` | Updates pagination info text, prev/next button states, and page number buttons |
| `escapeHtml(str)` | XSS helper escaping HTML characters in dynamic template data |

### `js/templates.js` — templates feed page only

| Function | What it does |
|---|---|
| `initTemplatesPage()` | Main entrypoint — guards to `#tmpl-container`, binds events, triggers shimmer loading |
| `bindTemplateEvents()` | Event listeners for search input, popularity chips, tag chips, auth filter dropdown, sort select, page size select, and pagination prev/next |
| `getFilteredTemplates()` | Applies search query (name/desc/author/tag), tag filter, auth filter, and sort order to `MOCK_TEMPLATES` |
| `renderWithShimmer()` | Shows 6 skeleton shimmer cards with 420ms delay, then renders real cards |
| `renderTemplates()` | Paginates filtered results, renders template cards or empty-state, updates header count badge |
| `createTemplateCardHtml(t)` | Returns HTML string for one template card — author avatar, auth badge, linked title, description, tags, star rating, use count, date |
| `buildStarsHtml(rating)` | Returns filled/empty star span string (reuses `.notif-star--filled` / `.notif-star--empty`) |
| `updatePaginationUI(...)` | Updates pagination info text, prev/next button states, and page number buttons |
| `clearAllFilters()` | Resets all state and UI controls to defaults, then re-renders |
| `formatUseCount(n)` | Formats use count as e.g. `3.2k` |
| `escapeHtml(str)` | XSS helper escaping HTML characters in dynamic template data |

### `js/notifications.js` — notifications page only

| Function | What it does |
|---|---|
| `initNotificationsPage()` | Main entrypoint — guards to `#notif-feed`, triggers shimmer, binds tabs and toolbar |
| `renderWithShimmer()` | Shows 5 skeleton shimmer items with 420ms delay, then renders real data |
| `buildShimmerHtml(count)` | Returns shimmer list HTML (avatar circle + 3 skeleton lines per item) |
| `renderNotifications()` | Filters by active tab, renders list or empty-state, re-binds card actions |
| `getFiltered()` | Returns `_notifications` subset matching `_activeFilter` |
| `createNotifItemHtml(n)` | Assembles full notification item HTML (avatar, body, controls) |
| `buildAvatarHtml(n)` | Returns user initials avatar (neutral surface, no colour) or system SVG icon avatar per type |
| `systemIconSvg(type, subtype)` | Returns inline SVG icon string for system-generated notifications (no emoji — uses Feather-style paths) |
| `buildBodyHtml(n)` | Routes to the correct body template by `n.type` + `n.subtype` |
| `buildStarsHtml(rating)` | Returns filled/empty star span string for rating notifications |
| `buildControlsHtml(n)` | Returns mark-read + dismiss SVG icon buttons HTML |
| `buildEmptyStateHtml()` | Returns centred empty-state card matching active filter label |
| `updateTabCounts()` | Recounts `_notifications` per type, updates all `.notif-tab__count` badges including Billing |
| `updateUnreadBadge()` | Updates `#notif-unread-count` badge; hides when 0 |
| `bindTabEvents()` | Delegated click on `#notif-tabs` — updates active tab + re-renders |
| `bindToolbarEvents()` | Binds "Mark all as read" and "Clear read" toolbar buttons |
| `bindCardActions()` | Binds mark-read, dismiss, invite accept/decline, and item-click handlers |
| `markRead(id)` | Sets `n.read = true`, re-renders |
| `dismissItem(id)` | Animates item out with `.notif-item--removing`, removes from `_notifications`, re-renders |
| `handleInviteAction(id, action)` | Sets `n._outcome` (accepted/declined), marks read, records in `_respondedInvites`, re-renders |
| `relativeTime(ts)` | Returns human-readable relative time string (e.g. "5m ago", "3d ago") |
| `esc(str)` | XSS helper — escapes `&`, `<`, `>`, `"` |

---

## UI State & Structural Decisions

- **Fonts**: Space Grotesk (headings/display), Inter (body), JetBrains Mono (code/mono/meta)
- **Color scheme**: Dark-mode only. Background `#0f0f0f`, accent orange `#f97316`
- **Styling**: Vanilla CSS only — no frameworks
- **Stack**: Raw HTML + CSS + JS. No build step, no bundler
- **Sidebar**: 240px expanded, 72px icon-only (collapsed). Off-canvas on ≤840px
- **Auth redirect target**: `/dashboard`

---

## Known Issues & Pending Improvements

- **Breadcrumb is hardcoded** in `pages/dashboard.html` (`task-app / tasks`) — needs dynamic rendering when project pages are built
- **Stat cards are hardcoded** (`2/2 projects`, `14 tables`, `0 APIs`, `0 requests`) — need real data from API
- **Plan badge is hardcoded** (`Free plan / 6/10 tables`) in the dashboard nav — needs real data
- **Account dropdown links**: ✅ Fixed — `Sign out` links across all dashboard pages now point to `/logout` and client JS calls backend `${BACKEND_URL}/auth/logout` with session validation and clean redirect to `/login`.
- **Environment and Backend URL Configuration**: ✅ Added `.env` and `.env.example` defining `PORT` and `BACKEND_URL`. Express dynamically serves `/js/config.js` to provide `window.BACKEND_URL` to all pages without requiring ES modules or `type="module"`.
- **`redirectIfLoggedIn()` path**: ✅ Fixed — now redirects to `/dashboard` via clean URL route.
- **No API yet**: backend routes (`/auth/login`, `/auth/register`, `/auth/me`) are referenced in `app.js` but the backend is not implemented yet. Forms currently fail gracefully with a network error.
- **Notifications mock data**: `notifications.js` uses `MOCK_NOTIFICATIONS` array — needs to be wired to a real `/notifications` API endpoint when backend is ready.
- **Notifications controls hidden on mobile (≤640px)**: the dismiss/mark-read icon buttons are hidden at narrow widths; a swipe-to-dismiss UX should be added when building the mobile-native experience.
- **Invite project links**: all `projectHref` / `templateHref` values in mock data are `#` — need to point to real project/view pages when built.
- **Notifications page fully regenerated (2026-08-07)**: HTML rebuilt with correct Billing filter tab, sidebar active state, breadcrumb. JS rewritten with SVG icons (no emoji), fixed `notif-outcome-badge` class, added Billing tab count. CSS extended with all missing classes (`.notif-avatar--user`, `.notif-btn-accept/decline/ghost/upgrade`, `.notif-plan-badge--*`, `.notif-collab-status`, `.notif-actor--warn`, `.notif-star--*`, `.notif-strong`, `.notif-limit-val`, `.notif-chip*`).
- **Templates page filter refactor (2026-08-07)**: Removed auth-type dropdown filter and sort-order dropdown. Added Auth On / Auth Off toggle chips (styled to match `project-badge--auth` / `project-badge--no-auth` from projects.html). Replaced single-tag selection with multi-tag selection across top 5 tags (REST, auth, AI, e-commerce, real-time). `authType` field replaced by boolean `authEnabled` in mock data. Sort is now driven solely by the Popular/Recent chip. New CSS classes `.tmpl-chip--auth-on.is-active` and `.tmpl-chip--auth-off.is-active` added at the bottom of `style.css`.
- **Leaderboard rank badge fix (2026-08-07)**: `renderSection()` now receives the section's `metric` parameter and pre-computes each template's rank in the default (by-metric) sort order. Rank badges (#1, #2, #3) are therefore **always stable** and reflect the true category standing regardless of the active sort option (Default or By Created Date). `renderAll()` updated to pass metric to all three `renderSection()` calls.
