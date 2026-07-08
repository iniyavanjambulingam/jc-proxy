# jcXproxy Dashboard — CSS Design System

## Color Palette

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| Page background | `#0f1117` | Body, darkest layer |
| Card / Panel | `#161b22` | Cards, modals, header |
| Input / Inset | `#0d1117` | Inputs, provider-detail bg, type-card bg |
| Interactive hover | `#1c2128` | Type card header hover |
| Border subtle | `#21262d` | Provider-detail border, table rows, model-tag bg |
| Border default | `#30363d` | Cards, modals, inputs, buttons |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#e1e4e8` | Body text |
| Secondary | `#c9d1d9` | Buttons, inputs, model tags |
| Muted | `#8b949e` | Labels, meta info, placeholders |
| Empty state | `#484f58` | No-data messages |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Green (success) | `#3fb950` | Health dot, Groq tag, cap.on |
| Green (darker bg) | `#1a3a2a` | Tag backgrounds (Groq, discovered) |
| Green (button) | `#238636` | Primary buttons, toast |
| Green (button hover) | `#2ea043` | Primary button hover |
| Blue | `#58a6ff` | Gemini tag, input focus border, dedicated tag |
| Blue (darker bg) | `#1a2a3a` | Tag backgrounds (Gemini, dedicated) |
| Yellow | `#d29922` | OpenRouter tag, custom tag |
| Yellow (darker bg) | `#3a2a1a` | Tag backgrounds (OpenRouter, custom) |
| Orange | `#f78166` | Cloudflare tag |
| Orange (darker bg) | `#3a1a2a` | Tag background (Cloudflare) |
| Purple | `#bc8cff` | OpenAI-Compatible tag |
| Purple (darker bg) | `#2a2a3a` | Tag background (OpenAI-Compatible) |
| Red (danger) | `#da3633` | Danger buttons, unhealthy dot, error text |
| Red (button hover) | `#f85149` | Danger button hover |

---

## Typography

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

| Element | Size | Weight |
|---------|------|--------|
| Header h1 | 20px | 600 |
| Card header h2 | 16px | 600 |
| Modal header h3 | 16px | — |
| Provider detail h4 | 14px | — |
| Type card h3 | 14px | 600 |
| Body / buttons | 13px | — |
| Meta / labels | 12px | 500 (th) |
| Tags / caps | 11px | 500 |
| Model tags / cap | 10px | — |

---

## Component Reference

### Reset & Base
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: ...; background: #0f1117; color: #e1e4e8; min-height: 100vh; }
```

### Layout
```css
.container { max-width: 1100px; margin: 0 auto; padding: 24px; }
```

### Card
```css
.card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  margin-bottom: 20px;
}
.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-body { padding: 16px 20px; }
```

### Buttons
```css
.btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #21262d;
  color: #c9d1d9;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.btn:hover { background: #30363d; }

.btn-primary { background: #238636; border-color: #238636; color: #fff; }
.btn-primary:hover { background: #2ea043; }

.btn-danger { background: #da3633; border-color: #da3633; color: #fff; }
.btn-danger:hover { background: #f85149; }

.btn-sm { padding: 3px 10px; font-size: 12px; }
```

### Tags (Provider Types)
```css
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

/* Type-specific colors */
.tag-groq             { background: #1a3a2a; color: #3fb950; }  /* green */
.tag-gemini           { background: #1a2a3a; color: #58a6ff; }  /* blue */
.tag-openrouter       { background: #3a2a1a; color: #d29922; }  /* yellow */
.tag-cloudflare       { background: #3a1a2a; color: #f78166; }  /* orange */
.tag-openai-compatible{ background: #2a2a3a; color: #bc8cff; }  /* purple */

/* Model source tags */
.tag-discovered       { background: #1a3a2a; color: #3fb950; }  /* green */
.tag-custom           { background: #3a2a1a; color: #d29922; }  /* yellow */
.tag-dedicated        { background: #1a2a3a; color: #58a6ff; }  /* blue */
```

### Type Cards (Grouped Providers)
```css
.type-card {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
  margin-bottom: 12px;
}
.type-card-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}
.type-card-header:hover { background: #161b22; border-radius: 6px; }
.type-card-header-left { display: flex; align-items: center; gap: 8px; }
.type-card-header-left h3 { font-size: 14px; font-weight: 600; }
.type-card-header-left .count { font-size: 12px; color: #8b949e; }
.type-card-header-right { display: flex; align-items: center; gap: 8px; }
.type-card-toggle {
  font-size: 11px;
  color: #8b949e;
  transition: transform 0.2s;
  display: inline-block;
}
.type-card-toggle.collapsed { transform: rotate(-90deg); }
.type-card-body { padding: 0 12px 12px 12px; }
.type-card-body.collapsed { display: none; }
```

### Provider Detail Card
```css
.provider-detail {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}
.provider-detail h4 {
  font-size: 14px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.provider-detail .meta { font-size: 12px; color: #8b949e; margin-bottom: 4px; }
.provider-detail .caps { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
```

### Capability Badges
```css
.cap {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  background: #21262d;
  color: #8b949e;       /* muted = off */
}
.cap.on {
  background: #1a3a2a;
  color: #3fb950;       /* green = on */
}
```

### Model Tags
```css
.models-list { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.model-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  background: #21262d;
  color: #c9d1d9;
}
```

### Health Indicator
```css
.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.health-dot.healthy   { background: #3fb950; }
.health-dot.unhealthy { background: #da3633; }
```

### Table
```css
table { width: 100%; border-collapse: collapse; }
th, td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #21262d;
  font-size: 13px;
}
th { color: #8b949e; font-weight: 500; }
```

### Modal
```css
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 100;
  justify-content: center;
  align-items: center;
}
.modal-overlay.active { display: flex; }

.modal {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  width: 560px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-body { padding: 20px; }
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #30363d;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

### Form Elements
```css
.form-group { margin-bottom: 14px; }
.form-group label {
  display: block;
  font-size: 12px;
  color: #8b949e;
  margin-bottom: 4px;
}
.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
}
.form-group textarea {
  min-height: 60px;
  resize: vertical;
  font-family: monospace;
}
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #58a6ff;
}
```

### Alias Rows
```css
.alias-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.alias-row input { flex: 1; }
```

### Toast Notification
```css
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #238636;
  color: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 200;
  opacity: 0;
  transition: opacity 0.3s;
}
.toast.show { opacity: 1; }
```

### Empty State
```css
.empty { text-align: center; padding: 32px; color: #484f58; }
```

### Close Button
```css
.close-btn {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 18px;
}
.close-btn:hover { color: #c9d1d9; }
```

---

## Spacing & Sizing

| Context | Value |
|---------|-------|
| Container max-width | 1100px |
| Container padding | 24px |
| Card margin-bottom | 20px |
| Card header/body padding | 16px 20px |
| Type card padding | 12px 16px (header), 0 12px 12px 12px (body) |
| Provider detail padding | 12px |
| Modal width | 560px |
| Modal max-height | 90vh |
| Modal body padding | 20px |
| Button gap (modal footer) | 8px |
| Tag/cap padding | 2px 6px |
| Model tag gap | 4px |
| Capability gap | 6px |

---

## Border Radius

| Element | Radius |
|---------|--------|
| Card | 8px |
| Type card / provider detail | 6px |
| Button | 6px |
| Input / select / textarea | 6px |
| Tag / cap / model tag | 4px |
| Modal | 12px |
| Toast | 8px |
| Health dot | 50% (circle) |
| Badge | 12px (pill) |

---

## Z-Index Stack

| Layer | Z-Index |
|-------|---------|
| Modal overlay | 100 |
| Toast | 200 |

---

## Transitions

| Element | Property | Duration |
|---------|----------|----------|
| Button hover | background | 0.15s |
| Toast show/hide | opacity | 0.3s |
| Type card toggle | transform | 0.2s |

---

## Improvement Notes

### Potential enhancements
1. **Dark mode toggle** — add a light theme variant with inverse palette
2. **Responsive breakpoints** — modal and container need mobile adaptation (< 768px)
3. **Focus ring** — current focus is border-only; adding `box-shadow` would improve accessibility
4. **Transitions** — buttons only animate background; add transition for border-color on focus
5. **Type card hover** — currently only backgrounds hover; add subtle scale or shadow
6. **Skeleton loading** — replace "Loading models..." text with skeleton placeholders
7. **Tag consistency** — model source tags (discovered/custom/dedicated) use same palette as type tags; consider differentiating
8. **Modal scroll** — on small screens, modal can overflow; add `margin: auto` for centering
9. **Button disabled state** — no `.btn:disabled` style currently
10. **Scrollbar styling** — model selector and modal scroll areas use browser defaults; could match dark theme
