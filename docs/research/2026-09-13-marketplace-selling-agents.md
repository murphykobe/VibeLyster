# Does anything autonomously run a resale seller's inbox? (Grailed / eBay / Depop / Poshmark / Mercari)

**Date:** 2026-09-13

## Bottom line

Nobody has shipped a product that autonomously reads a buyer's inbound message or offer, decides accept/counter/decline/reply, and escalates the ambiguous cases to a human owner, across any of these five marketplaces — and **nothing does it on Grailed at all**, native or third-party, because Grailed has no seller-side automation feature and no public API. The closest thing to genuine inbound-offer automation is **Depop's native "Auto-respond to offers,"** which auto-accepts or auto-counters a buyer's offer against a seller-set floor price — but it only handles offers (not messages), it's a single-threshold rule rather than a negotiation, and it has no escalation path. eBay has the API *primitives* to build real inbound handling (`RespondToBestOffer` in the legacy Trading API, plus the REST Commerce Message API for reading/replying to buyer messages), but no product or MCP server — including the most complete eBay MCP server found (`ebay-mcp`) — actually wires those into an agent. Everywhere else (Poshmark, Mercari, and the entire cross-listing/bot tool category — Vendoo, Closet Tools, PosherVA, OneShop/SuperPosher, Nifty, ClosetPilot, Closo) automation is seller-**initiated** (offers-to-likers, sharing, relisting, Smart Pricing) rather than a response to an **inbound** buyer action, and marketing claims that go further (Closo's "AI agents ... negotiate complex offers ... without human intervention") do not match what the vendor's own product page actually demonstrates.

---

## eBay

### Native features
- **Best Offer auto-accept / auto-decline**: sellers set a price floor (auto-decline) and ceiling (auto-accept); offers in between require a manual decision. Any buyer comment on the offer disables auto-accept (but not auto-decline). Source: [Automatically accept or decline offers – eBay Developers Program](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-auto.html); flow and counter-offer mechanics at [Best Offer flow](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-flow.html) and [Counteroffers](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-counter.html). This auto-accept/decline is threshold-only — it never *counters* automatically, and it doesn't touch messages.
- **RespondToBestOffer** (legacy Trading/XML API): the actual programmatic call a seller (or a seller's agent) would use to Accept, Decline, or Counter an inbound Best Offer. Decline supports multiple offer IDs per call; Accept/Counter do not. Buyer's original offer/counter has a 24-hour reply window; a seller counter gives the buyer 96 hours. Source: [RespondToBestOffer – Trading API](https://developer.ebay.com/devzone/xml/docs/reference/ebay/RespondToBestOffer.html), [RespondToBestOfferRequestType](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/RespondToBestOfferRequestType.html). **This is the one place in the whole survey where a marketplace exposes a real API to programmatically answer an inbound offer** — but it's the old XML Trading API, not the modern REST "Sell" APIs, and (see below) no MCP/agent tool found wraps it.
- **Negotiation API** (`developer.ebay.com/api-docs/sell/negotiation`) is **outbound-only**: `findEligibleItems` returns listings that buyers have watched or cart-abandoned, and `sendOfferToInterestedBuyers` sends those buyers a seller-initiated discount. It has nothing to do with responding to a buyer's Best Offer. Source: [Negotiation API Overview](https://developer.ebay.com/api-docs/sell/negotiation/overview.html), [Negotiation API idea/blog](https://developer.ebay.com/updates/blog/negotiation-api), [Sending offers to buyers with the Negotiations API](https://developer.ebay.com/api-docs/sell/static/marketing/offers-to-buyers.html).
- **Buyer-seller messaging**: legacy Trading API has `GetMemberMessages` (fetch unanswered buyer questions) and `AddMemberMessageAAQToPartner` (reply to a transaction partner, rate-limited to 75 calls/60s per seller). Source: [GetMemberMessages](https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMemberMessages.html), [AddMemberMessageAAQToPartner](https://developer.ebay.com/devzone/xml/docs/reference/ebay/AddMemberMessageAAQToPartner.html). The modern equivalent is the REST **Commerce Message API** (`commerce/message/v1`: `getConversations`, `getConversation`, `sendMessage`, `bulkUpdateConversation`) — confirmed directly from the `ebay-mcp` source below, which links every method back to `developer.ebay.com/api-docs/commerce/message/...`.
- Verdict: eBay is the only marketplace of the five with a documented, callable API for **both** inbound offer response and inbound message reply — but they're two different, non-unified API generations (legacy XML for offers, modern REST for messages), and native auto-response (UI-level) covers only the offer threshold case, not negotiation or messaging.

### Agent tool surface: ebay-mcp
[`github.com/YosefHayim/ebay-mcp`](https://github.com/YosefHayim/ebay-mcp) (also listed as `ebay-api-mcp-server`) is a local MCP server exposing eBay's Sell APIs as agent tools, organized into categories including a `communication` family described in its README as **"Buyer–seller messaging, negotiations, notifications, and feedback"** with the example prompt *"Show recent buyer messages that need a response."* Source: [README.md](https://github.com/YosefHayim/ebay-mcp/blob/main/README.md).

Reading the actual source confirms the scope precisely:
- [`src/api/communication/negotiation.ts`](https://raw.githubusercontent.com/YosefHayim/ebay-mcp/main/src/api/communication/negotiation.ts) implements exactly two methods, `findEligibleItems` and `sendOfferToInterestedBuyers` — i.e. it wraps only the **outbound** REST Negotiation API. It does **not** implement `RespondToBestOffer`, so an agent using this server cannot accept/counter/decline an inbound Best Offer.
- [`src/api/communication/message.ts`](https://raw.githubusercontent.com/YosefHayim/ebay-mcp/main/src/api/communication/message.ts) implements `getConversations`, `getConversation`, `sendMessage`, and `bulkUpdateConversation` against `commerce/message/v1` — this **does** give an agent the ability to read inbound buyer messages and send replies. This is the one genuinely inbound-capable tool found anywhere in this survey, for messages (not offers).

Net effect: `ebay-mcp` lets an AI agent read and reply to buyer *messages*, but not answer buyer *offers* — a gap directly traceable to eBay having no modern REST endpoint for `RespondToBestOffer` and this project not having implemented the legacy XML call.

---

## Grailed

### Native
Grailed's help center describes offers as strictly manual: a buyer proposes a price and **"the individual seller can accept, decline, or counter that proposal"**; once a binding offer is made, the seller has 24 hours to accept or counter before it expires, and countering voids the buyer's prior binding offer. Source: [Offers for Sellers – Grailed](https://support.grailed.com/hc/en-us/articles/30298716328333-Offers-for-Sellers), [Offers for Buyers – Grailed](https://support.grailed.com/hc/en-us/articles/30298575011085-Offers-for-Buyers). No seller-side minimum-offer, auto-accept, or auto-decline setting is documented anywhere on these pages or elsewhere searched; the only automatic guardrail found is a **buyer-side** floor (offers below roughly 60% of listing price are blocked from being submitted at all) reported by secondary sources (unverified against a Grailed primary page — flagged as such).
### API / third parties
Grailed **has no public developer API**; third-party access is scraper-only (Apify, ScrapingBee, RapidAPI listings, a `grailed-api` PyPI scraper package) — none of these touch messaging or offers, only listing data. This matches VibeLyster's own prior finding (`docs/marketplace-api-research.md`) that Grailed's endpoints are reverse-engineered, cookie/CSRF-authenticated internal REST APIs, not a sanctioned public API.
### Verdict
Grailed is the clearest **"nobody does this"** case in the survey: no native auto-response of any kind, no public API, and no third-party tool found (in this research or the project's earlier cross-listing survey) that touches inbound Grailed offers or messages at all.

---

## Depop

### Native — the strongest finding in this survey
Depop's own Help Centre article, **"Auto-respond to offers,"** describes a real inbound-offer-automation feature, live on iOS and Android: *"Set the lowest price you're happy to accept for an item. If a buyer sends an offer at or above that price, it's automatically accepted. If the offer is lower, we'll automatically send a counteroffer at your set price."* It's opt-in per listing (My Depop → listing → "Auto-respond to offers" toggle), and Depop advertises a guaranteed 100% response rate with replies within 60 seconds. Source: [Auto-respond to offers – Depop Help Centre](https://depophelp.zendesk.com/hc/en-gb/articles/42789384303761-Auto-respond-to-offers) (confirmed by full-page fetch).
### Scope limits
This is offer-only automation with a single threshold rule (accept-above / counter-at-floor) — it is not a negotiating agent (no multi-round reasoning, no reading buyer intent/messages, no bundle logic) and the help page documents no escalation-to-owner behavior; the seller's only control is the toggle and the floor price. Depop's separate "Send Offer" and "Make Offer" articles ([Send Offer](https://depophelp.zendesk.com/hc/en-gb/articles/15495796917777-Send-Offer), [Make Offer](https://depophelp.zendesk.com/hc/en-gb/articles/4412315779345-Make-Offer)) describe the plain manual offer flow and outbound offers-to-followers/likers, which is the seller-initiated category, distinct from Auto-respond.
### Verdict
Depop is the only marketplace of the five with a **shipped, native, inbound-offer auto-response feature**. It does not extend to buyer messages.

---

## Poshmark

### No public API; ToS restricts automation
Poshmark's own Terms of Service (fetched directly) prohibit using "any technology, software or automated systems to collect any information or data for the Service" among other automation-adjacent restrictions. Source: [poshmark.com/terms](https://poshmark.com/terms). (Secondary sources such as Vendoo's blog cite a more specific "Automated Participation" clause banning liking/sharing/following bots by name; that exact clause was not found verbatim in the current ToS text fetched for this research, so it is flagged **unverified**.) There is no Poshmark developer API of any kind.
### Third-party tools — all outbound
Every Poshmark automation tool found (Closet Tools, [PosherVA](https://posherva.com/), OneShop/SuperPosher, Nifty, ClosetPilot, Simple Posher, ClosetMate) automates the same outbound set: closet sharing, follow/unfollow, relisting, and **sending offers to likers**. None of the vendor pages or the third-party roundups used to check them ([nifty.ai's Poshmark bot roundup](https://nifty.ai/post/best-poshmark-bot)) describe responding to an inbound buyer offer or inbound buyer message — every "offer" feature these tools have is the seller proactively messaging/discounting to people who already liked the item, not answering someone who made an offer.
### Verdict
No inbound-offer or inbound-message automation found for Poshmark, native or third-party. This confirms/extends the project's earlier finding.

---

## Mercari

### Native
Mercari's own help pages confirm sellers must manually **accept, decline, or counteroffer** a buyer's offer — no auto-accept/auto-decline exists for inbound buyer offers. Source: [How does Offer work for sellers? – Mercari Help](https://www.mercari.com/us/help_center/article/330/). Mercari does have two **outbound**, seller-initiated automations: **Smart Pricing** (automatically lowers the listed price over time toward a seller-set floor) and **Offer to Likers** (a price-drop of 10%+ automatically pushes a time-limited offer to up to 50 recent likers, and can auto-fire on subsequent new likers) — see [How does the "Promote" button work? – Mercari Help](https://www.mercari.com/us/help_center/article/347/) and article 330 above. Both are seller-initiated pricing/marketing automation, not responses to an inbound buyer action.
### Verdict
Manual-only for inbound offers; no messaging automation found; no public API for third parties to build inbound automation on top of.

---

## AI inbox / reply assistants

- **"Seller Auto Reply"** (Chrome Web Store extension): genuinely does auto-reply to inbound buyer messages using AI ("Automatic AI replies to supported unread buyer messages," using listing info and conversation context), and explicitly does **not** handle offers/price negotiation — it's scoped to routine questions and buyer qualification. Critically, it targets **Facebook Marketplace only**, not any of the five marketplaces in scope, and it is "not affiliated with... Meta." Escalation is limited to a manual pause/edit-instructions control, not automatic hand-off. Source: [Seller Auto Reply – Chrome Web Store](https://chromewebstore.google.com/detail/seller-auto-reply/adhjebdkkdhldnifjnoaeahlgpmejkgl).
- **"AI Reply Assistant"** (Chrome Web Store): a generic social-media DM/comment/review reply generator (multi-LLM backend), not marketplace-specific; relevance to reselling is unverified and appears out of scope.
- No AI reply/inbox assistant was found that is built for eBay, Grailed, Depop, Poshmark, or Mercari specifically and that touches buyer *offers* (as opposed to general Q&A).

## Agent-native entrants ("AI selling agent" / "AI negotiator")

- **Closo** ("AI agents that run the busywork," flagged in prior VibeLyster research as unspecified) was checked directly on its dedicated agents page. The marketing copy claims its AI "monitor[s] buyers in real-time and can automatically send personalized discounts to interested watchers or **negotiate complex offers**... without human intervention," but the actual demonstrated feature on the same page is the **Auto-Offers agent**, described concretely as: *"Sends offers to likers and watchers across marketplaces, closing deals you'd never chase by hand,"* shown sending a fixed number of outbound discounted offers to watchers within seller-set caps (daily limits, price floor, max discount). Source: [Closo AI Agents](https://closo.co/pages/agents). **This is an outbound offers-to-watchers feature, not inbound negotiation** — the "negotiate complex offers" language in the marketing copy is not backed by any inbound-negotiation mechanism shown on the page. Flagged explicitly: vendor marketing here outruns the shipped feature.
- General 2026 "AI sales agent" search results returned enterprise B2B sales-agent vendors (Creatio, Fin AI, Sintra, Shopify's own commerce-agent content) with no product built for consumer resale marketplace inboxes; none reference Grailed/eBay/Depop/Poshmark/Mercari.
- No other 2025–2026 startup was found explicitly marketed as an "AI negotiator" for resale sellers' buyer conversations.

## Agent tool surfaces (MCP / Agent Skills / CLIs) beyond ebay-mcp

- **`ebay-mcp`** — see eBay section above; the only tool surface found with any negotiation/messaging capability, and even it is outbound-offer + inbound-message only (no inbound-offer response).
- **`secondhand-mcp`** ([github.com/jlsookiki/secondhand-mcp](https://github.com/jlsookiki/secondhand-mcp), also listed as [secondhandmcp.com](https://secondhandmcp.com/)) covers Facebook Marketplace, eBay, Depop, and Poshmark, but is **read-only**: its tools are `search_marketplace`, `get_listing_details`, and `list_marketplaces` — no contact/message/offer capability at all.
- Several Apify-hosted MCP servers (e.g. [Mercari + Poshmark + Depop Scraper MCP](https://apify.com/crawlerbros/mercari-poshmark-depop-scraper/api/mcp)) are likewise scraping/search tools only.
- No MCP server, Agent Skill (checked agentskills.io-adjacent marketplaces: AgentSkills.to, Agensi), or OpenClaw/Hermes community skill was found that exposes Poshmark, Mercari, Depop, or Grailed seller **messaging or offers** to an agent. The Agent Skills ecosystem searched is presently oriented toward coding-agent skills, not resale-marketplace actions.

---

## Comparison table

| Product | Marketplaces | Responds to inbound offers? | Replies to buyer messages? | Escalation to owner? | Source |
|---|---|---|---|---|---|
| eBay Best Offer auto-accept/decline (native, UI) | eBay | Yes — threshold accept/decline only, no counter | No | No | [eBay Developers](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-auto.html) |
| eBay `RespondToBestOffer` (Trading API) | eBay | Yes, if a seller builds on it (Accept/Counter/Decline) — API exists, no found product wraps it | No | Seller-built | [Trading API](https://developer.ebay.com/devzone/xml/docs/reference/ebay/RespondToBestOffer.html) |
| eBay Negotiation API (REST) | eBay | No — outbound to watchers/cart-abandoners only | No | N/A | [Negotiation API](https://developer.ebay.com/api-docs/sell/negotiation/overview.html) |
| eBay Commerce Message API | eBay | No (message-only) | Yes — read/send, seller-built | Seller-built | [ebay-mcp source](https://raw.githubusercontent.com/YosefHayim/ebay-mcp/main/src/api/communication/message.ts) |
| `ebay-mcp` (GitHub) | eBay | No (wraps outbound Negotiation API only) | Yes (wraps Commerce Message API) | Not built in | [github.com/YosefHayim/ebay-mcp](https://github.com/YosefHayim/ebay-mcp) |
| Depop "Auto-respond to offers" (native) | Depop | Yes — auto-accept above floor, auto-counter at floor | No | No | [Depop Help Centre](https://depophelp.zendesk.com/hc/en-gb/articles/42789384303761-Auto-respond-to-offers) |
| Mercari Offer feature (native) | Mercari | No — manual accept/decline/counter only | No | No | [Mercari Help](https://www.mercari.com/us/help_center/article/330/) |
| Mercari Smart Pricing / Offer to Likers (native) | Mercari | No (outbound only) | No | No | [Mercari Help](https://www.mercari.com/us/help_center/article/347/) |
| Grailed Offers (native) | Grailed | No — manual accept/counter/decline, 24h window | No | No | [Grailed Support](https://support.grailed.com/hc/en-us/articles/30298716328333-Offers-for-Sellers) |
| Poshmark bots (Closet Tools, PosherVA, OneShop, Nifty, ClosetPilot, etc.) | Poshmark | No — offers-to-likers outbound only | No | No | [nifty.ai roundup](https://nifty.ai/post/best-poshmark-bot), [PosherVA](https://posherva.com/) |
| Closo "AI agents" | Poshmark, eBay, Mercari, Depop, Vinted, Shopify | Marketing claims "negotiate," but shown feature is outbound-only | Not demonstrated | Not documented | [Closo Agents page](https://closo.co/pages/agents) |
| Seller Auto Reply (Chrome ext.) | Facebook Marketplace only (out of scope) | No | Yes | No (manual pause only) | [Chrome Web Store](https://chromewebstore.google.com/detail/seller-auto-reply/adhjebdkkdhldnifjnoaeahlgpmejkgl) |
| `secondhand-mcp` | FB Marketplace, eBay, Depop, Poshmark | No | No | N/A | [GitHub](https://github.com/jlsookiki/secondhand-mcp) |

---

## Gaps: what nobody does

1. **No end-to-end inbound-negotiation agent exists on any of the five marketplaces.** Nothing reads a buyer's offer *and* their accompanying message, reasons about both together (e.g., "I'll take $80 if you cover shipping"), and replies in kind — every native/third-party feature found treats offers and messages as separate channels, and only Depop automates the offer channel at all.
2. **Escalation to a human owner is not a feature anyone ships.** No product found has a "hold for owner review" band distinct from auto-accept/auto-decline — eBay's UI-level auto-accept/auto-decline comes closest structurally (an implicit middle band requires manual action) but that's a side effect of two thresholds, not a designed escalation workflow with buyer-facing acknowledgment.
3. **Grailed and Poshmark have zero official automation surface** — no public API, no native auto-response — so any inbound automation there is necessarily unsanctioned browser/API automation (same reverse-engineered pattern VibeLyster already uses for listing creation), not a sanctioned integration.
4. **eBay's own API surface is split across two generations** (legacy XML `RespondToBestOffer` for offers vs. modern REST `commerce/message/v1` for messages), and the most complete community MCP server for eBay has not bridged that gap — it implements the message side but not the offer-response side.
5. **Vendor marketing outpaces shipped product** (Closo). Treat any "AI agent negotiates for you" claim as unverified until checked against the vendor's own worked example, not just their headline copy.

## Implications for VibeLyster's marketplace-agent connector

- **Depop**: since Depop already ships native per-listing auto-accept/auto-counter, VibeLyster's Depop connector shouldn't reimplement offer-threshold logic — it should read/respect the seller's existing Auto-respond setting (or let the owner configure it through VibeLyster) and put its own value-add into the thing Depop doesn't cover: reading and replying to buyer *messages*, which has no native equivalent.
- **eBay**: this is the best-supported marketplace for a real "handle my inbound negotiation" build, but it requires two integrations, not one — the modern REST Commerce Message API (`getConversations`/`sendMessage`) for messages, and the legacy XML Trading API's `RespondToBestOffer` for offers, since the modern REST Negotiation API is outbound-only. `ebay-mcp` is a useful reference for the message side but VibeLyster's own `ebay-cli` would need to implement `RespondToBestOffer` itself — nothing off-the-shelf does it.
- **Grailed and Poshmark**: no public API exists for messages or offers on either platform, so any inbound handling has to go through the same reverse-engineered internal-API pattern already documented in `docs/marketplace-api-research.md` (CSRF/session-cookie auth) and already proven for Grailed/Depop listing creation and image upload — budget for the same discovery + breakage-maintenance cost that the recent Cloudflare/impit fixes required, since these are unofficial surfaces that can change without notice.
- **Escalation-to-owner is a genuine differentiator, not a catch-up feature.** Nobody surveyed — native platform or third party — ships a designed "auto-accept above X / auto-decline below Y / hold the middle band for owner sign-off" workflow across both offers and messages. That's an opening for VibeLyster rather than a feature gap to close against competitors.
- **Don't trust "AI agent" competitor claims (Closo) at face value** when scoping VibeLyster's positioning — verify against the vendor's own worked example before assuming feature parity exists; in Closo's case it currently doesn't for inbound negotiation.

---

## Sources

- [Automatically accept or decline offers – eBay Developers Program](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-auto.html)
- [Best Offer flow – eBay Developers Program](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-flow.html)
- [Counteroffers – eBay Developers Program](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-counter.html)
- [RespondToBestOffer – Trading API](https://developer.ebay.com/devzone/xml/docs/reference/ebay/RespondToBestOffer.html)
- [RespondToBestOfferRequestType – Trading API](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/RespondToBestOfferRequestType.html)
- [Negotiation API Overview – eBay Developers Program](https://developer.ebay.com/api-docs/sell/negotiation/overview.html)
- [The idea behind Offer to Buyers – eBay Developers Program blog](https://developer.ebay.com/updates/blog/negotiation-api)
- [Sending offers to buyers with the Negotiations API](https://developer.ebay.com/api-docs/sell/static/marketing/offers-to-buyers.html)
- [GetMemberMessages – Trading API](https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMemberMessages.html)
- [AddMemberMessageAAQToPartner – Trading API](https://developer.ebay.com/devzone/xml/docs/reference/ebay/AddMemberMessageAAQToPartner.html)
- [ebay-mcp – GitHub repo](https://github.com/YosefHayim/ebay-mcp)
- [ebay-mcp README.md](https://github.com/YosefHayim/ebay-mcp/blob/main/README.md)
- [ebay-mcp src/api/communication/negotiation.ts](https://raw.githubusercontent.com/YosefHayim/ebay-mcp/main/src/api/communication/negotiation.ts)
- [ebay-mcp src/api/communication/message.ts](https://raw.githubusercontent.com/YosefHayim/ebay-mcp/main/src/api/communication/message.ts)
- [Offers for Sellers – Grailed Support](https://support.grailed.com/hc/en-us/articles/30298716328333-Offers-for-Sellers)
- [Offers for Buyers – Grailed Support](https://support.grailed.com/hc/en-us/articles/30298575011085-Offers-for-Buyers)
- [Auto-respond to offers – Depop Help Centre](https://depophelp.zendesk.com/hc/en-gb/articles/42789384303761-Auto-respond-to-offers)
- [Send Offer – Depop Help Centre](https://depophelp.zendesk.com/hc/en-gb/articles/15495796917777-Send-Offer)
- [Make Offer – Depop Help Centre](https://depophelp.zendesk.com/hc/en-gb/articles/4412315779345-Make-Offer)
- [How does Offer work for sellers? – Mercari Help](https://www.mercari.com/us/help_center/article/330/)
- [How does the "Promote" button work? – Mercari Help](https://www.mercari.com/us/help_center/article/347/)
- [Poshmark Terms of Service](https://poshmark.com/terms)
- [PosherVA](https://posherva.com/)
- [5 best Poshmark bots for sellers in 2026 – nifty.ai](https://nifty.ai/post/best-poshmark-bot)
- [The 4 best Depop bots for automation and more sales (2026) – nifty.ai](https://nifty.ai/post/best-depop-bot)
- [Closo AI Agents – 24/7 Automation for Resale Businesses](https://closo.co/pages/agents)
- [Seller Auto Reply – Chrome Web Store](https://chromewebstore.google.com/detail/seller-auto-reply/adhjebdkkdhldnifjnoaeahlgpmejkgl)
- [AI Reply Assistant – Chrome Web Store](https://chromewebstore.google.com/detail/ai-reply-assistant/ldgbfmhdaebpbfjcnhbjhhfhhdpndpjb)
- [secondhand-mcp – GitHub](https://github.com/jlsookiki/secondhand-mcp)
- [secondhandmcp.com](https://secondhandmcp.com/)
- [Mercari + Poshmark + Depop Scraper MCP server – Apify](https://apify.com/crawlerbros/mercari-poshmark-depop-scraper/api/mcp)

**Unverified / secondary claims flagged in text:** Grailed's buyer-side "no offer below ~60% of listing price" floor (no Grailed primary page found describing it); Poshmark's specific "Automated Participation" ToS clause naming liking/sharing/following bots (not found verbatim in the current ToS text; the broader anti-automation clause was confirmed directly).
