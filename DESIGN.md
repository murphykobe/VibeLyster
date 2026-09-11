# Design System — VibeLyster · "PAPER TRAIL"

> Care-tag modernism. Nothing in this app should look like software — it should look
> like the paperwork of a very good seller: tagged, stamped, manifested, shipped.
> Created 2026-06-12 via /design-consultation (Claude + Codex + indie-voice synthesis).
> Preview artifact: `/tmp/design-consultation-preview-vibelyster.html` (regenerable from this doc).

## Product Context
- **What this is:** iOS app (Expo / React Native) that turns photos + a voice note into AI-drafted listings, cross-posted to Grailed, eBay, and Depop.
- **Who it's for:** Individual fashion/streetwear/vintage resellers — people steeped in archive-fashion culture who flip volume from home.
- **Space/industry:** Resale tooling. Peers: SellRaze (clean generic SaaS), Vendoo (purple-gradient SaaS), Grailed (stark utilitarian editorial — the credibility benchmark).
- **Project type:** Mobile app (iOS first), with Expo web export.

## Aesthetic Direction
- **Direction:** PAPER TRAIL — care-tag modernism / print ephemera that happens to be interactive.
- **Decoration level:** Intentional — hairline rules (like wash-tag print lines), rubber-stamp ink, sticker-shaped action chips. No gradients, no glassmorphism, no floating card shadows, no blobs.
- **Mood:** The back office of someone with taste. Machine-printed truth, marked up in ballpoint, approved with a stamp. The first-3-seconds feeling is *being in on it* — the in-group recognition of spotting four white stitches on a blank label.
- **Core metaphor (governs everything):** the app is paperwork. The AI types; the user marks up the proof; publishing is printing; confirmation is a receipt.
- **Reference languages:** garment care tags, thrift price guns, thermal receipts, USPS labels, 90s lookbooks, zines.

## Typography

Three inks, three jobs. All free via Google Fonts (Expo: `@expo-google-fonts/*`).

- **Display / stamps / wordmark:** Archivo Black — compressed street-poster confidence, all-caps.
- **UI / body / item titles:** Archivo (variable), set tight (width ~87%) — blank-label grotesk energy.
- **Data ink (every number in the app):** Space Mono — prices, SKUs, timestamps, counts, platform codes, statuses. Machine-printed truth. Monospace = inherently tabular.
- **Editorial voice:** Fraunces Italic — used sparingly and large: the AI-generated title on draft review, empty states, the sold celebration. **One editorial moment per screen, never more.** (Chosen over Instrument Serif — too quirky/showy; over Newsreader — user preferred Fraunces' warmth.)
- **Paid upgrade path (post-launch, optional):** Obviously Narrow (display), Neue Haas Grotesk (UI), Söhne Mono or OCR-B (data), PP Editorial New (editorial).
- **Scale (px):** caption 10 · meta 11 · body-sm 13 · body 15 · title 17 · heading 22 · editorial 24 · display 34 · stamp-lg 44. Mono runs 1px smaller than its paired sans size.

## Color

- **Approach:** Restrained — the colors of real paperwork. Accent is rare and means "act."

| Token | Hex | Role |
|---|---|---|
| `ground` "Label Stock" | `#F2EEE3` | App background — unbleached care-tag cream, never white |
| `surface` | `#FAF7EE` | Inputs, receipt paper, spec tags |
| `ink` "Ribbon Black" | `#1C1A17` | Primary text — warm thermal-printer black (13:1 on ground) |
| `ink-muted` | `#6E675C` | Secondary text, timestamps |
| `accent` "Price Gun Orange" | `#FF4D00` | Primary actions ONLY (capture, publish). Never decorative |
| `stamp` "Sold Red" | `#C8331F` | SOLD stamps, failure/destructive |
| `ballpoint` "Ballpoint Blue" | `#2438B8` | User edits to AI text, links, annotations |
| `deadstock` "Deadstock Green" | `#22382B` | Dark-mode ground |

- **Semantic:** success `#2F6B4F` (Grailed-green ink) · warning `#B8860B` · error `#C8331F` · info `#2438B8`. Rendered as left-rule printed lines (`OK / NOTE / FAIL / INFO` prefixes in mono), not toasts.
- **Dark mode ("Deadstock Mode"):** ground `#22382B`, surface `#1B2D23`, ink `#F2EEE3`, ballpoint lightened to `#8FA0FF`, stamp `#E0492F`. Keep the warm print feel; never near-black.
- **Hard rules:** No purple. No gradients. No platform brand colors (see Platform Status).

## Spacing
- **Base unit:** 4px
- **Density:** Compact — the manifest respects someone flipping 40 items, not browsing 4.
- **Scale:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(24) 2xl(32) 3xl(48)

## Layout
- **Approach:** Hybrid — dense ledger discipline for inventory, one poster moment for capture.
- **Dashboard = the Manifest:** one item per row (flash-photo thumb with 1px ink border, title in Archivo, price in mono, platform codes), hairline rules between rows, new captures feed in from the top like thermal paper. Footer is a running receipt subtotal: `14 ITEMS / 9 LIVE / $1,240 LISTED`. Never a 2-up card grid.
- **Capture:** full-bleed camera, voice waveform, price-gun-orange shutter. Not a floating "+".
- **Draft review = the Proof:** photo, AI title in Fraunces Italic, spec-tag table (dotted rules, mono keys), user edits rendered in Ballpoint Blue italic with a ✎. Approve = stamp.
- **Publish = Printing:** progress is paper feeding; confirmation is a torn-edge receipt listing each platform's result.
- **Border radius:** 0 everywhere. Paper has corners. (Exception: native iOS controls keep system shapes.)
- **Max content width (web export):** 680px single column.

## Platform Status (signature pattern)
- Platforms are printed codes in Space Mono: `GRL` / `EBY` / `DPP` — never logos, never brand colors.
- State is print treatment: **outline box** = draft · **solid ink** = live · **strikethrough** = failed · **red stamp** = sold.
- Stamps go ON the photo, slightly rotated (-6° to -12°), misregistered ink texture: grey `DRAFT` diagonal on draft photos, red `SOLD` slammed across sold items (with a single heavy haptic when it lands).

## Motion
- **Approach:** Minimal-functional with three mechanical signatures. Paper, not springs.
  1. **Thermal feed** — list items enter vertically with stepped easing (new capture prints into the manifest)
  2. **Stamp thunk** — scale-down + single heavy haptic (`Haptics.ImpactFeedbackStyle.Heavy`) when status lands
  3. **Receipt print** — publish progress feeds downward; confirmation tears
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out); no bounce, no overshoot.
- **Duration:** micro(80ms) short(180ms) feed(350ms) print(600ms)
- **Haptic signature:** the price gun — one decisive *ka-chunk* per meaningful action. No haptic chatter.

## The AI Gets No Sparkle (hard rule)
No ✨ icon, no purple, no chat bubble, no mascot, no "generating magic…" copy. The AI's output appears as a typed spec tag; user corrections render in Ballpoint Blue. Machine types → human marks up → stamp approves. Loading copy is mechanical: `TRANSCRIBING…`, `TYPING DRAFT…`, `PRINTING…`.

## Anti-Slop Rules (never)
Purple/violet gradients · centered hero copy · 3-column icon grids · rounded blob backgrounds · uniform bubbly border-radius · gradient CTAs · sterile white dashboard cards · sparkle icons · spring-bounce physics · status dots/pills.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-12 | PAPER TRAIL direction adopted | Claude, Codex, and indie subagent independently converged on print/paper materiality; category default (enterprise SaaS) fails this audience while their culture's print vernacular is unused |
| 2026-06-12 | Manifest ledger over card-pile dashboard | Scales to 40+ items; density is respect for volume sellers (user-confirmed over Codex's poster-pile) |
| 2026-06-12 | Monochrome printed platform codes | Brand-color dots drag the SaaS look back in (user-confirmed) |
| 2026-06-12 | Fraunces Italic as editorial voice | Instrument Serif Italic rejected as too quirky; Fraunces chosen over Newsreader/EB Garamond from rendered comparison (user-confirmed) |
| 2026-06-12 | Free font stack as default | Ships in Expo today at $0; paid upgrades documented |
