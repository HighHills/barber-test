---
name: Groomed Slate
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#534434'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#867461'
  outline-variant: '#d8c3ad'
  surface-tint: '#855300'
  primary: '#855300'
  on-primary: '#ffffff'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#ffb95f'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#006c49'
  on-tertiary: '#ffffff'
  tertiary-container: '#30c88f'
  on-tertiary-container: '#004e34'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
  price-kpi:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system is engineered for modern barbershop point-of-sale terminals and customer-facing membership dashboards. The brand aesthetic merges the tactile craft of traditional grooming with high-velocity, reliable SaaS operations. It evokes craft confidence, operational swiftness, cleanliness, and elevated hospitality.

The design movement is **Modern Clean Minimalist** balanced with micro-tactile accents:
- Ultra-crisp structural surfaces on cool slate undertones.
- Precision lines with generous touch targets suitable for active barber stations and quick customer self-check-in.
- Amber-gold accents that signal craft status, membership tiering, and primary transactional momentum without visual clutter.

## Colors

The palette leverages a crisp, hygienic foundation accented with warm amber tones reminiscent of brass barber shears, warm lather, and gold tier status.

### Functional Palette
- **Canvas / Background**: `#F8FAFC` (Slate 50) delivers an eye-friendly, glare-free workspace under shop lighting.
- **Card / Surface**: `#FFFFFF` provides absolute contrast against the slate foundation.
- **Text Primary**: `#0F172A` (Slate 900) ensures AAA accessibility for legibility at arm's length on POS mounts.
- **Text Secondary**: `#64748B` (Slate 500) for supporting metadata, service durations, and secondary metrics.
- **Text Muted**: `#94A3B8` (Slate 400) for timestamps, non-interactive hints, and input placeholders.
- **Border / Hairline**: `#E2E8F0` (Slate 200) for crisp division without harsh contrast.

### Action & Status
- **Primary Brand / Action**: `#F59E0B` (Amber 500) serves as checkout buttons, loyalty milestones, and active states.
- **Action Hover / Pressed**: `#D97706` (Amber 600).
- **Soft Accent Fill**: `#FEF3C7` (Amber 100) used for selected table rows, active tab badges, and member perk cards.
- **Success / Complete**: `#10B981` (Emerald 500) for successful transactions, open barber chairs, and active recurring memberships.

### Membership Tier Tokens
- **Platinum**: `#475569` text on `#F1F5F9` surface with `#CBD5E1` border.
- **Gold**: `#B45309` text on `#FEF3C7` surface with `#FDE68A` border.
- **Silver**: `#475569` text on `#E2E8F0` surface with `#CBD5E1` border.
- **Bronze**: `#9A3412` text on `#FFEDD5` surface with `#FED7AA` border.
- **Non-Member / Guest**: `#64748B` text on `#F8FAFC` surface with `#E2E8F0` border.

## Typography

The typography pairs **Plus Jakarta Sans** for headlines, labels, numerical values, and badges with **Inter** for dense transactional tables, booking logs, and receipt breakdowns.

- **Plus Jakarta Sans**: Delivers geometric warmth, precision, and modern premium service branding. Used for prices, KPI counters, modal titles, and membership badges.
- **Inter**: Neutral, hyper-legible workhorse for scanning client history, formulas, notes, and inventory tables.
- **Numbers & Monospace Figures**: Numerical figures across cart checkouts and till balances must use `font-variant-numeric: tabular-nums` to ensure exact column alignment.

## Layout & Spacing

The system runs on an 8pt base grid with an adaptable layout system tailored for dual environments: desktop POS/tablets and client mobile dashboards.

### Breakpoints & Grid Models
- **Mobile (<640px)**: Single-column flow, edge margins of `1rem`, vertical stacked rhythm using `space-md` gaps. Sticky bottom primary action bars for payment execution.
- **Tablet / POS Terminal (641px - 1024px)**: 8-column layout. Split-view layout default: 60% service & barber seat selector, 40% active cart / checkout ticket. Gutter: `1.25rem`.
- **Desktop Dashboard (>1024px)**: 12-column layout max-width 1440px with `2rem` outer canvas padding. Gutter: `1.5rem`. Side-nav fixed at 260px.

## Elevation & Depth

Visual hierarchy uses **ambient, low-saturation slate shadows** combined with fine borders. Elements avoid heavy skeuomorphic drops to maintain a sterile, modern shop feel.

- **Level 0 (Flat / Canvas)**: `#F8FAFC` base page.
- **Level 1 (Card & Section Containers)**: `#FFFFFF` fill, bordered by `1px solid #E2E8F0`, shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Hovered Cards & Dropdowns)**: `#FFFFFF` fill, border `1px solid #CBD5E1`, shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modals & POS Checkout Drawers)**: `#FFFFFF` fill, shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`, with backdrop overlay `rgba(15, 23, 42, 0.4)`.

## Shapes

The roundedness level is **Rounded (Level 2)**. The base geometry balances modern digital design with approachable rounded corners.

- **Standard Buttons, Inputs & List Cards**: `0.5rem` (8px).
- **Surface Cards & Modal Panels**: `1rem` (16px) for spacious outer boundary framing.
- **Membership Tier Badges, Avatars & Quantity Pills**: Fully rounded pill shapes (`9999px`) to emphasize distinct loyalty status and swift interactive feedback.

## Components

### Buttons
- **Primary Action (Charge / Confirm / Join)**: `#F59E0B` background, `#0F172A` high-contrast bold typography (`label-lg`), height `48px` on POS, `42px` on dashboard. Hover: `#D97706`. Focus outline: 2px amber ring with 2px offset.
- **Secondary (Add Service / Split Bill)**: White background, `#0F172A` text, `1px solid #E2E8F0`. Hover: `#F8FAFC` background with `#CBD5E1` border.
- **Destructive (Void / Cancel)**: Soft crimson tint `#FEE2E2`, `#DC2626` text.

### Membership Badges (Pills)
- Rendered as strict pill capsules (`rounded-full`) with `label-sm` font, uppercase tracking (`0.04em`), and padding `0.25rem 0.75rem`.
- **Platinum**: Gray/silver metallic gradient border, deep slate text.
- **Gold**: Amber fill (`#FEF3C7`), gold border (`#FDE68A`), dark amber text (`#B45309`).
- **Silver**: Slate-100 fill, light border, `#475569` text.
- **Bronze**: Soft rust tint fill, bronze text (`#9A3412`).
- **Non-Member**: Subtle ghost pill with `#94A3B8` border and slate text.

### Cards & Service Tiles
- Pure `#FFFFFF` surfaces with subtle `1px solid #E2E8F0` border.
- POS Service Selection Card: 80px minimum touch target height, displaying service name (`headline-sm`), duration (`body-sm` in slate-500), and price in bold slate-900 right-aligned. Selected state switches border to `2px solid #F59E0B` with `#FEF3C7` inner wash.

### Input Fields & Search Bars
- Background: `#FFFFFF`, `1px solid #E2E8F0`, height `44px`, padding `0 1rem`.
- Text: `14px Inter` `#0F172A`, placeholder in `#94A3B8`.
- Focus state: Border transition to `#F59E0B` with `0 0 0 3px rgba(245, 158, 11, 0.15)`.

### Lists & Queue Tables
- Clean zebra-free rows bordered bottom by `1px solid #F1F5F9`.
- Row height: `56px` for high touch fidelity in fast checkout workflows.
- Contains customer profile avatar, loyalty pill badge, assigned barber tag, and payment status chip.

### Checkboxes & Segmented Controls
- Checkbox: `20x20px`, `rounded-md`, `#E2E8F0` border. Active state: `#0F172A` background with crisp white checkmark icon.
- Segmented Chair/Barber Switcher: Pill track in `#F1F5F9` background, active segment slides with white surface and level-1 shadow.