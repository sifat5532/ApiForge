---
name: frontend_dev_rules
description: Rules for modifying frontend files for the ApiForge project
---

# ApiForge Frontend Agent Guidelines

When working on the ApiForge project, you MUST adhere to the following rules.

---

## 0. Project Structure & Server Routing

The frontend server (`frontend/app.js`) uses this architecture:

- **`frontend/public/resources/`** is the **Express static root**.
  All CSS, JS, and image assets live here and are served from the domain root.
  Example: `public/resources/css/style.css` → accessible at `domain.com/css/style.css`.

- **`frontend/public/pages/`** is where **all HTML files** live.
  HTML is **NOT** inside the static root — it is served via `res.sendFile()` from
  explicit Express route handlers. This enables clean URLs like `domain.com/projects`
  instead of `domain.com/projects.html`.

- Asset `href`/`src` paths inside HTML always use root-relative paths
  (e.g., `href="css/style.css"`, `src="js/app.js"`) because the browser resolves
  them against the domain root, which maps to `public/resources/`.

### Directory layout

```
frontend/
├── app.js                  ← Express server entry point
├── routes/
│   └── pages.router.js     ← Clean URL page routes (one route per HTML page)
└── public/
    ├── pages/              ← All HTML files (served via res.sendFile)
    └── resources/          ← Express static root (assets served from domain root)
        ├── css/
        │   ├── style.css
        │   └── responsive.css
        └── js/
            ├── app.js
            ├── dashboard.js
            └── [page-specific].js
```

### Adding a new page — required steps

1. Create the HTML file at `frontend/public/pages/<pagename>.html`
2. Add a route in `frontend/routes/pages.router.js`:
   ```js
   router.get('/pagename', (req, res) => res.sendFile(path.join(pages, 'pagename.html')));
   ```
3. Asset paths inside the HTML stay unchanged: `css/style.css`, `js/dashboard.js`, etc.
4. All inter-page links use **clean URLs** (e.g., `href="/dashboard"`). Never use `.html` extensions in links.
5. **Unbuilt / stub pages**: use `href="#" data-stub="pagename"` — do **NOT** add a route for them.

---

## 1. Scope of Work

- You are ONLY allowed to work inside the `frontend/public` directory:
  - New HTML pages → `frontend/public/pages/`
  - New CSS assets → `frontend/public/resources/css/`
  - New JS assets  → `frontend/public/resources/js/`
- When adding a new page, also add its route to `frontend/routes/pages.router.js`.
- DO NOT modify, delete, or create files in the backend folder or anywhere outside `frontend/public` (and `frontend/routes/` for route additions) unless explicitly requested.

---

## 2. Tech Stack

- Use ONLY raw HTML, vanilla CSS, and vanilla JavaScript.
- DO NOT use frameworks or libraries such as React, Vue, Svelte, TailwindCSS, Bootstrap, etc.

---

## 3. Design System

Before writing any HTML or CSS, read `.agents/context/design_system.md`.

It contains:
- Every `:root` CSS variable (colors, fonts, radii, container width)
- Every reusable component class already defined in `style.css`
- Every JS-toggled modifier class and when each is applied

**Never invent new color values, font families, or component class names.** Use what already exists. If you genuinely need something new, extend `css/style.css` following the existing pattern (comment header, BEM-ish class names, use only the existing tokens).

---

## 4. Page Anatomy

Every HTML page must follow this structure exactly.

### 4a. Landing / auth pages (`index.html`, `login.html`, `signup.html`, and any new marketing pages)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>[Page Title] — ApiForge</title>
  <meta name="description" content="[Concise page description]" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">

  <!-- Paths resolve against domain root → public/resources/css/ -->
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="css/responsive.css">
</head>
<body>
  <!-- NAV -->
  <header class="nav"> ... </header>

  <!-- MAIN CONTENT -->
  <main> ... </main>

  <!-- FOOTER -->
  <footer class="footer"> ... </footer>

  <script src="js/app.js"></script>
</body>
</html>
```

### 4b. Dashboard pages (`dashboard.html` and any new app pages)

Dashboard pages require an extra inline `<script>` in `<head>` (pre-paint state restore) and a different script at the end:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>[Page Title] — ApiForge</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">

  <!-- Paths resolve against domain root → public/resources/css/ -->
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="css/responsive.css">

  <!-- Pre-paint: restore persisted UI state before first frame -->
  <script>
    (function () {
      try {
        if (localStorage.getItem('apiforge-sidebar-collapsed') === 'true') {
          document.documentElement.classList.add('sidebar-collapsed');
        }
        if (localStorage.getItem('apiforge-onboarding-dismissed') === 'true') {
          document.documentElement.classList.add('onboarding-dismissed');
        }
      } catch (e) { /* localStorage unavailable — use defaults */ }
    })();
  </script>
</head>
<body class="dashboard-body">
  <!-- TOP NAVBAR -->
  <header class="dash-nav"> ... </header>

  <div class="dash-shell">
    <!-- LEFT SIDEBAR -->
    <aside class="sidebar" id="sidebar"> ... </aside>
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

    <!-- MAIN CONTENT -->
    <main class="dash-main"> ... </main>
  </div>

  <script src="js/dashboard.js"></script>
  <!-- Add page-specific script below dashboard.js if needed -->
  <!-- <script src="js/[pagename].js"></script> -->
</body>
</html>
```

---

## 5. JavaScript Module Pattern

- `js/app.js` is shared across all landing/auth pages. Each function checks for its target element and returns early if absent — this makes it safe to include on every landing page.
- `js/dashboard.js` handles the dashboard shell (sidebar, account dropdown, onboarding card). Include it on every dashboard page.
- For page-specific logic, create `js/<pagename>.js` and follow the same pattern:

```js
document.addEventListener('DOMContentLoaded', () => {
  initFeatureA();
  initFeatureB();
});

function initFeatureA() {
  const el = document.getElementById('feature-a-root');
  if (!el) return; // guard — safe on pages where element is absent
  // ...
}
```

---

## 6. localStorage Keys (Do Not Reuse)

These keys are already in use. Do not redefine them or use them for other purposes:

| Key | Type | Used by |
|---|---|---|
| `apiforge-sidebar-collapsed` | `'true'` / absent | `dashboard.js` — sidebar width state |
| `apiforge-onboarding-dismissed` | `'true'` / absent | `dashboard.js` — getting-started card |

New features that need persistence must use a unique key prefixed with `apiforge-`.

---

## 7. Stub Link Policy

Several sidebar links point to pages that do not yet exist.
See `.agents/context/frontend_status.md` → **Stub Link Registry** for the full list.

- **Do NOT build those pages** unless explicitly instructed.
- If you must reference one of those pages in new markup, use `href="#"` and add a `data-stub="[pagename]"` attribute (no `.html` extension in the value — e.g., `data-stub="billing"`, not `data-stub="billing.html"`).
- **Do NOT invent content or structure for a stub page** — leave it for a dedicated task.

---

## 8. Aesthetics & Consistency

- Maintain the existing dark-mode visual style (see `design_system.md` for tokens).
- Use the pre-existing fonts: `Space Grotesk` (headings), `Inter` (body), `JetBrains Mono` (mono/code/meta).
- Rely on and extend the existing CSS files (`css/style.css`, `css/responsive.css`). New CSS goes at the bottom of `style.css` under a clearly labeled comment block.
- Add responsive overrides at the bottom of `responsive.css` under the appropriate breakpoint.
- No inline `style=""` attributes except for dynamic values set by JavaScript (e.g., progress bar `width`).

---

## 9. Iterative Feedback Loop

- Do NOT assume your code works on the first try.
- Write the code → read the file back → verify structure and class names against `design_system.md` → fix issues before declaring a task done.

---

## 10. Context Updating

After completing any generation or modification task, you MUST update `.agents/context/frontend_status.md`:

- Add any new files created to the **Page Inventory** table
- Move items from the **Stub Link Registry** to the page inventory once they are built
- Note any new known issues or decisions under **Known Issues**
- Update the **CSS File Map** or **JS Function Map** if you added new sections or functions
