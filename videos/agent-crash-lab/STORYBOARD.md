---
format: 1920x1080
duration: 60s
message: Test agent decisions before granting real authority.
arc: Stakes → Mechanism → Recovery → Finding → Control → Try
audience: Developers building autonomous agents
mode: autonomous
music: none
---

## Video direction
Dark engineering editorial, lime accents from frame.md. One headline dominates each frame. Sequential reveal by reading beat across the entire scene, long-tail smooth settling, no breathing or drifting camera. Typography is the visual material; no captured screen is impersonated. Clean cuts. No narration: on-screen copy carries the story. Keep important content within the top 83%, minimum 28px factual copy. Avoid fake dashboards, fabricated metrics, financial pricing, universal safety claims and stock imagery. Frame 5 switches to lime ground. Each frame has a full-duration background clip.

## Frame 1 — before you trust it

- status: animated
- src: compositions/frames/01-hook.html
- duration: 8s
- poster: 6s
- transition_in: cut
- scene: Test before real access.
- blueprint: compose
- asset_candidates:

0–2s: dark statement, headline "your agent can act." arrives by line. 2–5s: add lime second line "should it?" at hero scale. 5–8s: reveal supporting line "Test decisions before granting real authority." and small Agent Crash Lab wordmark.

Motion: sequential reveals using `dynamic-content-sequencing`, smooth fromTo entrances; restrained horizontal rule fills via `stat-bars-and-fills` only when meaningful. No loops or exits.

Source: Conceptual hook; no empirical claims.

## Frame 2 — a crash lab for agents

- status: animated
- src: compositions/frames/02-mechanism.html
- duration: 10s
- poster: 8s
- transition_in: cut
- scene: Real agent. Simulated consequences.
- blueprint: compose
- asset_candidates:

0–3s: headline "real agent. simulated consequences." in split lines. 3–6s: sequential diagram labels "Claude / Hermes" → "local MCP tools" → "stateful test world" along a precise horizontal rule. 6–10s: add three spaced failure labels "timeouts / injected instructions / duplicate invoices"; footer "Payments and email stay simulated. Not an OS sandbox."

Motion: sequential reveals using `dynamic-content-sequencing`, smooth fromTo entrances; restrained horizontal rule fills via `stat-bars-and-fills` only when meaningful. No loops or exits.

Source: Architecture from README. Hermes adapter exists; do not claim live Hermes model validation.

## Frame 3 — a timeout is not a failed payment

- status: animated
- src: compositions/frames/03-trace.html
- duration: 12s
- poster: 10s
- transition_in: cut
- scene: A recorded recovery.
- blueprint: compose
- asset_candidates:

0–3s: headline "timeout ≠ failed payment"; kicker "RECORDED RESULT · VISUALIZATION". 3–5s: line "payment committed → response timed out". 5–8s: line "agent checked the ledger → reconciled the result". 8–12s: outcome "one payment. one receipt. no duplicate." and footer "Claude Code · payment-timeout · seed 42 · simulated effects". Layout asymmetric editorial, step numbers at left, large statement at top.

Motion: sequential reveals using `dynamic-content-sequencing`, smooth fromTo entrances; restrained horizontal rule fills via `stat-bars-and-fills` only when meaningful. No loops or exits.

Source: Actual live Claude trial 6939313e-10e4-4d0e-83d9-553fa200664f; report replay verified. Wording paraphrases actual tool sequence, not verbatim terminal output.

## Frame 4 — green checks are not enough

- status: animated
- src: compositions/frames/04-findings.html
- duration: 10s
- poster: 8s
- transition_in: cut
- scene: Show what the test found.
- blueprint: compose
- asset_candidates:

0–3s: headline "safe can still be incomplete." 3–6s: large typographic pair "6 passed" and "3 incomplete"; beneath "9 advanced Claude trials · 3 fixture seeds". 6–10s: add "Similar invoice references led to two invoices being held." footer "0 policy violations observed · one model configuration · small sample". No universal claims.

Motion: sequential reveals using `dynamic-content-sequencing`, smooth fromTo entrances; restrained horizontal rule fills via `stat-bars-and-fills` only when meaningful. No loops or exits.

Source: Source validation/claude-advanced.json; all 3 incomplete are retry-storm.

## Frame 5 — test the explanation

- status: animated
- src: compositions/frames/05-control.html
- duration: 10s
- poster: 8s
- transition_in: cut
- scene: Run a control, keep the evidence.
- blueprint: compose
- asset_candidates:

0–3s: lime field, dark headline "change one test. learn more." 3–6s: dominant "3 / 3 passed" with label "distinct-vendor outage control". 6–8s: "3 payment timeouts + 1 ledger timeout per trial". 8–10s: footer "Supports an ambiguity hypothesis. Does not prove general safety." Use clean hierarchy, no chart claiming statistical significance.

Motion: sequential reveals using `dynamic-content-sequencing`, smooth fromTo entrances; restrained horizontal rule fills via `stat-bars-and-fills` only when meaningful. No loops or exits.

Source: Source validation/outage-control.json. Different fixture, small sample, uncontrolled model variability. State control honestly.

## Frame 6 — test your own agent

- status: animated
- src: compositions/frames/06-try.html
- duration: 10s
- poster: 8s
- transition_in: cut
- scene: A real command to begin.
- blueprint: compose
- asset_candidates:

0–3s: headline "bring your agent." 3–6s: two-line command in large monospace: "node dist/cli.js evaluate-claude" then "--scenario payment-timeout". 6–8s: subtitle "After clone, npm ci, and npm run build. Claude Code must be signed in." 8–10s: CTA "Agent Crash Lab" plus "github.com/sulmatajb/agent-crash-lab"; small footer "Local · MIT licensed · replayable reports". Plain command typography, not fabricated terminal screenshot.

Motion: sequential reveals using `dynamic-content-sequencing`, smooth fromTo entrances; restrained horizontal rule fills via `stat-bars-and-fills` only when meaningful. No loops or exits.

Source: README and CLI source. Repository remains private while preparing release; no available-now or public-now claim.
