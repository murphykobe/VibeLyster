# Marketplace Agent Connector Design

**Date:** 2026-09-13
**Status:** Rules and escalation model approved 2026-09-13. Endpoint discovery and market research pending before implementation plan.
**Scope:** A packaged agent persona plus CLI tool surface so a personal agent (Hermes) can run the post-listing life of Grailed listings on a daily cron.

## Goal

Stop building listing UX. Build the thing nobody's tool does: the six days after a listing goes live.

A single-tenant agent, running on the owner's own account, wakes once a day and handles the Grailed inbox: answers routine buyer questions, responds to offers inside rules the owner sets, and escalates to the owner only when a decision is binding or the data to answer is missing. Publishing stays with the existing `@vibelyster/grailed-cli`. This connector picks up where that leaves off.

Decided during design review (2026-09-13):
- Personal use only. One account, the owner's. Not a product.
- Post-listing only. Listing creation is already solved by the existing CLIs and by Grailed's own native AI listing flow.
- Decision classes in v1: buyer offers (accept / counter / decline) and buyer questions. Proactive price drops, bumps, and post-sale follow-up are deferred.
- Trigger is a daily cron that polls Grailed. Email-notification triggering was considered and deferred (see Non-goals). The brittleness of polling is accepted; the mitigations below exist because of it.
- Judgment lives in the agent's skill file, not the CLI. The CLI is dumb primitives with JSON output.
- Grailed only in v1. Depop and eBay are later implementations behind the same tool shape.

## Architecture

Two deliverables in two repos, matching the existing `grailed-listing` / `depop-listing` / `ebay-listing` pattern:

### 1. Tool surface: new commands in `VibeLyster/tools/grailed`

The existing CLI gains inbox and offer primitives. Every new command supports `--json` and emits one JSON document on stdout, nothing else, so the agent never parses prose.

| Command | Auth | Returns |
|---|---|---|
| `grailed inbox [--since <iso>] [--unread]` | Yes | Conversations: id, listing id, buyer handle, last message text, last message time, unread flag |
| `grailed conversation <id>` | Yes | Full thread in order: sender, text, time. Plus the linked listing id |
| `grailed reply <conversationId> "<text>"` | Yes | The sent message as Grailed returns it |
| `grailed offers [--pending]` | Yes | Offers: id, listing id, buyer, amount, listing ask price, created, expires |
| `grailed offer <id> accept` | Yes | Result. **Binding.** See Safety |
| `grailed offer <id> decline` | Yes | Result |
| `grailed offer <id> counter <amount>` | Yes | Result |
| `grailed listing <id>` (existing) | Yes | Unchanged. The agent's source of truth for description and measurements when answering questions |

`grailed auth` (existing) gains machine-readable output under `--json`.

### 2. Persona: `marketplace-agent` skill in the ResellAgent repo

An Agent Skills `SKILL.md` (the same open format the three existing listing skills use, so it reads unchanged in Hermes, Claude Code, Codex, and OpenClaw). It contains:

- **Role.** "You run the owner's Grailed inbox. You are the owner's voice, not a bot. Short, human, specific."
- **The rules** (all owner-editable, all in this file, none in the CLI). See Decision rules.
- **The cron runbook.** The exact sequence of commands for one daily run. See Daily run.
- **Escalation contract.** What gets sent to the owner and in what shape. See Escalation.
- **Tool reference.** Every command above with its JSON shape and exit codes.

The listing skills stay separate. This skill assumes listings already exist.

## Session-expiry contract

This is the single most important design rule, and it exists because the trigger is unattended polling.

Grailed session cookies have no refresh. When the owner's cookie expires, a naive daily cron does not error. It returns zero conversations every day, and the owner discovers it when a buyer gives up. That failure is silent and slow, the worst kind.

So: every command distinguishes "session dead" from "nothing new," at the exit-code level.

| Exit code | Meaning | `--json` stdout |
|---|---|---|
| 0 | Success | The result document |
| 1 | Grailed returned an application error | `{"error": "...", "status": <http>}` |
| 3 | **Session expired or invalid** (401, or a login redirect on a page fetch) | `{"error": "SESSION_EXPIRED"}` |
| 4 | Cloudflare edge block (HTML block page, no Grailed backend reached) | `{"error": "CLOUDFLARE_BLOCK"}` |

Exit 3 and exit 4 are never conflated with "empty inbox." The agent's runbook treats both as escalate-immediately.

Session lifecycle on exit 3: the agent first attempts a fresh cookie via the CDP extraction the `grailed-listing` skill already documents (the owner's always-open Chrome). If that fails, it escalates to the owner. Detection of a dead session is the CLI's job. Recovery is the agent's.

## Daily run

One cron, once a day. Idempotent. The runbook in the skill:

1. `grailed auth --json`. Exit 3 or 4 means stop and escalate. Nothing else runs on a dead session.
2. Read the state file (see State). Get `last_run` and the set of already-handled conversation and offer ids.
3. `grailed inbox --since <last_run> --json` and `grailed offers --pending --json`.
4. For each new offer, apply the offer rule. For each conversation with an unanswered buyer message, classify the question and apply the question rule.
5. Execute autonomous actions (replies, counters, declines). Append every action to the ledger.
6. Batch every escalation into one message to the owner.
7. Write `last_run` and the handled-id sets back to the state file.

Idempotency matters because the cron will occasionally run twice, or crash mid-run. A conversation is handled once per inbound message, keyed on the message id, never on the conversation. An offer is handled once, keyed on the offer id. Re-running a completed run must produce zero new actions.

## Decision rules

All rules live in the skill file. Changing a threshold is a text edit, not a CLI release.

### Offers

Relative to the listing's asking price:

| Offer | Action | Autonomous? |
|---|---|---|
| ≥ 90% of ask | Propose accept | **No.** Escalate for owner's one-word confirm |
| 80% to 90% | Counter at the midpoint between offer and ask, rounded to a clean number | Yes |
| < 80% | Decline with a polite floor message ("Lowest I'd go is $X") where X is the 90% line | Yes |

A per-listing override file (`~/.vibelyster/grailed-agent-overrides.json`, listing id to floor amount) lets the owner protect specific pieces. When an override exists it replaces the percentage rule for that listing.

### Questions

The agent classifies each unanswered buyer message:

- **Answerable from listing data** (measurements present, condition described, "still available?", shipping region): reply autonomously, in the owner's voice, from `grailed listing <id>`.
- **Not answerable** (measurements missing, a question about something the listing doesn't say): escalate with a *drafted* reply that needs only the missing fact filled in. The owner answers with the number, the agent sends.
- **Anything the agent is unsure how to classify**: escalate with the thread.

Measurements are the dominant question on Grailed. The share of the inbox that stays autonomous is set almost entirely by whether measurements were captured at listing time. Follow-up (out of scope here): have the listing flow prompt for measurements.

## Escalation

The agent reaches the owner on whatever channel Hermes already uses. Every escalation carries a **proposed action** the owner can approve with one word, never a "please look at this."

Escalate on:

1. Any offer at or above the accept line. Payload: listing, buyer, amount, ask, proposed "accept." Owner replies "yes" or a counter amount.
2. Any question the listing data can't answer. Payload: the buyer's message plus a drafted reply with the blank marked.
3. Exit 3 or 4 from any command. Payload: which, and whether CDP refresh was attempted.
4. A buyer who has sent two or more messages with no reply from either side. Safety net for classification misses.

Everything else is autonomous: counters, declines, answerable questions, availability checks.

## Safety

- **Accept is never autonomous.** A wrong accept is a binding sale; backing out is a refund, and Grailed's Account Health score (May 2026) reduces visibility on refund rate. This is the one action where a mistake compounds.
- **Never send off-platform contact or social handles.** Grailed treats it as a violation. The skill forbids it in the owner's voice rules and the agent refuses buyer requests for it.
- **Every action is written to an append-only ledger** (`~/.vibelyster/grailed-agent-ledger.jsonl`): time, conversation or offer id, action, text sent, rule that fired. This is the receipt. The owner can read what the agent did on their behalf, always.
- **Rate limit.** No more than one reply per conversation per run, and a hard cap on total actions per run, so a classification bug can't spray the inbox.
- **Read-only first.** Phase 1 ships the read commands and escalations only. The agent proposes every action and the owner sends. Autonomy is turned on per rule after the owner has watched it make the calls they would have made.

## State

`~/.vibelyster/grailed-agent-state.json`:

```json
{
  "last_run": "2026-09-13T09:00:00Z",
  "handled_message_ids": ["..."],
  "handled_offer_ids": ["..."]
}
```

Handled-id sets are pruned to the last 30 days on each run so the file doesn't grow unbounded.

## What has to be discovered first

The inbox, conversation, reply, and offer endpoints on Grailed's internal API are **not yet known**. The existing CLI touches none of them. The first task is reverse-engineering them from a live session in the owner's browser (DevTools, Copy as cURL, the same move that fixed both marketplace bugs on 2026-09-13).

This is a real risk to the whole design: Grailed may expose messaging only through a server-rendered page, or through a websocket, rather than clean JSON endpoints the session cookie can hit. Until the endpoints are mapped, the command table above is a target, not a fact. Map first, then confirm the design still holds.

## Testing

`tools/grailed` has no test suite today. This work adds one, because an unattended agent acting on the owner's account is the wrong place to keep verifying by hand.

- Unit tests with recorded JSON fixtures for every new command: output shaping, exit-code mapping (401 to exit 3, block page to exit 4), idempotency keys.
- A live read-only smoke against the owner's own account: `auth`, `inbox`, `offers`. Never a write in automated tests.
- The write commands (`reply`, `offer accept|decline|counter`) are verified once by hand against a real listing before phase 2 turns them on.

## Rollout

1. **Map endpoints.** Live capture. Confirm the command table or revise it.
2. **Phase 1, read-only.** `inbox`, `conversation`, `offers`, `auth --json`, the exit-code contract, the state file, the ledger. The skill runs daily and escalates *every* proposed action. The owner sends by hand. Goal: prove the cron sees what the owner sees, and the session-expiry detection works.
3. **Phase 2, autonomy.** Turn on autonomous counters, declines, and answerable questions. Accept stays gated.
4. **Phase 3, tune.** Two weeks of ledger review. Adjust thresholds in the skill file.

## Non-goals

- Depop and eBay. Later implementations behind the same tool shape. eBay has real messaging and offer APIs and will be the *stable* one; it goes second on purpose so the decision logic is proven first where the owner actually sells.
- Listing creation. Already solved.
- Proactive pricing: scheduled drops, the 7-day bump. These are cron automations without judgment, a separate small piece.
- Post-sale: shipping confirmation, buyer follow-up.
- Email-notification triggering. Deferred, not rejected. Grailed emails on every offer and message, and reading that inbox would be an official signal that never breaks with a WAF change. If daily polling proves as brittle as today suggests, this is the first upgrade to make.
- Multi-tenant, other sellers, productizing.
- Sold-sync (delisting elsewhere the moment something sells). Still the trust feature from the September rethink, but it is its own piece of work and not required for a Grailed-only v1.
