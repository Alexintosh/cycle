---
name: cycle-package-authoring
description: Use when creating, updating, or publishing Cycle packages. Covers the product spirit, package design heuristics, research quality standards, supported time frequencies, authentication patterns, and API publishing flow. Use it whenever an LLM needs to turn a domain such as health, home, taxes, or admin into installable Cycle packages with strong item descriptions, links, and optional video guidance.
---

# Cycle Package Authoring

Cycle is not a calendar planner. It is a recurring life tracker built around time buckets such as daily, weekly, monthly, quarterly, semiannual, and yearly.

Packages should reflect that spirit:

- Install working life systems, not random tips.
- Bundle a coherent area of recurring life.
- Prefer durable recurring maintenance, rituals, and admin over one-off tasks.
- Write item descriptions so a user can understand what to do, why it matters, and where to learn more.

If behavior is unclear, treat these files as source of truth:

- `README.md`
- `apps/backend/src/modules/packages/types.ts`
- `apps/backend/src/modules/packages/service.ts`
- `apps/backend/src/modules/packages/routes.ts`
- `apps/frontend/src/routes/packages-page.tsx`

## Workflow

1. Define the user segment and scope.
2. Research the domain using primary sources first.
3. Decide whether this should be one package or several add-ons.
4. Map each item to a supported Cycle timeframe.
5. Write descriptions with concrete instructions, links, and videos when they materially help.
6. Publish through the package API.
7. Verify the package appears in `/packages/mine` and `/packages/registry`.

## Research Standard

Prefer the highest-quality sources available:

- Official government, standards, medical, or product documentation first.
- Primary sources before blogs or summaries.
- Exact dates and windows when the topic is time-sensitive.
- Current-year or current-season guidance when deadlines, laws, or compliance may have changed.

For high-stakes domains such as tax, legal, health, or finance:

- Always verify live sources before publishing.
- Use absolute dates such as `March 31, 2026`, not just `end of March`.
- State assumptions in the package description when the package only fits some users.

When useful, include video help in the item description:

- Prefer official videos from the same authority or institution.
- Only include videos that directly show the task or official workflow.
- Put the main written source first, then the video.

## Package Design Rules

- All packages are public by default.
- There are no drafts. `POST /packages` and `PATCH /packages/:id` publish immediately.
- A user owns many packages. Each published package belongs to one user.
- Keep packages focused. Split add-ons when the audience or compliance surface changes materially.
- Keep items atomic. One recurring outcome per item.
- Prefer plain language titles. Descriptions can carry the nuance.

Good split examples:

- `Portugal Tax Admin - Resident Base`
- `Portugal Tax Admin - Self-Employed Add-on`
- `Portugal Tax Admin - Property and Vehicle Add-on`

Bad split examples:

- One giant package that mixes base resident tax, freelancer VAT, landlord obligations, and vehicle taxes for everyone.

## Time Frequency Model

Supported timeframes are fixed:

- `daily`
- `weekly`
- `monthly`
- `quarterly`
- `semiannual`
- `yearly`

Do not invent unsupported values such as:

- `Q1`
- `Q2`
- `first 6 months`
- `biennial`
- `as-needed`

How to choose:

- `daily`: things expected every day or most days
- `weekly`: things counted across a week
- `monthly`: recurring monthly maintenance or review
- `quarterly`: every 3 months, especially filings and reviews
- `semiannual`: every 6 months
- `yearly`: annual reviews, filings, renewals, and deadlines

Important limitation:

- Cycle tracks recurrence buckets, not anchored months.
- If a task is annual but must happen in a specific window, keep `timeframe: "yearly"` and put the exact window in the description.
- Example: a Portuguese IRS filing task should be `yearly`, with the description stating `File between April 1 and June 30`.

## Writing Strong Items

Each item should include:

- A clear title with one action.
- A short explanation of what to do.
- Why it matters or what risk it avoids.
- A direct official link when available.
- Optional official video help when it materially reduces friction.

Use `goal` intentionally:

- `1` for one completion in that timeframe.
- Higher numbers when the user should hit the item multiple times in the same bucket.
- `null` when the item is flexible and should not display a numeric target.

Use `section` as the installed habit category:

- The package system writes `section` into the habit `category`.
- Common values already seen in the repo include `UPKEEP` and `OTHER`.
- You may use domain-appropriate stable labels such as `ADMIN`, `HEALTH`, `FINANCE`, `PROPERTY`, or `VEHICLES` when that improves clarity.

Color and emoji:

- Always set an emoji.
- Set a color for visual grouping.
- Be consistent inside a package.

## Authentication Patterns

Cycle supports two relevant auth modes for package publishing:

1. Internal bypass mode
   When `AUTH_BYPASS_ENABLED=true`, requests act as the configured default user. Direct API calls do not need an `Authorization` header.

2. Standard auth mode
   When bypass is off, package routes require `Authorization: Bearer <token>`.
   Tokens come from the normal auth flow such as OTP or passkey sign-in.

Check the mode first:

```bash
curl -sS "$BASE_URL/auth/mode"
```

Expected responses:

- `{"success":true,"data":{"mode":"bypass"}}`
- `{"success":true,"data":{"mode":"standard"}}`

## API Publishing Flow

Use the package API directly when you do not need to touch the UI.

Common routes:

- `GET /packages/registry`
- `GET /packages/mine`
- `POST /packages`
- `PATCH /packages/:packageId`

Payload shape:

```json
{
  "title": "Package title",
  "description": "What this package covers and for whom.",
  "version": "1.0.0",
  "tags": ["tag-one", "tag-two"],
  "items": [
    {
      "id": "stable-item-id-or-omit-on-create",
      "timeframe": "monthly",
      "emoji": "🧾",
      "title": "Do the recurring thing",
      "description": "Explain the task, why it matters, and link the user to the best instructions.",
      "goal": 1,
      "section": "ADMIN",
      "color": "#3B82F6"
    }
  ]
}
```

Notes:

- `title` and `version` are required.
- At least one item is required.
- Empty `emoji` falls back to `✨`.
- Empty `section` falls back to `OTHER`.
- Empty `color` falls back to `#E2E8F0`.
- Item `id` can be omitted on create, but stable ids are better when you plan to update the package later.

For concrete `curl` examples, read `references/package-api.md`.

## Publishing Heuristics

Before publishing, check:

- Is this a coherent life system rather than a bag of unrelated tasks?
- Are the recurrence buckets correct for Cycle's model?
- Are exact legal or operational windows written into the descriptions where needed?
- Are the links primary and current?
- Are videos official and genuinely useful?
- Would an average user understand whether this package fits them?

After publishing, verify:

- The package appears in `GET /packages/mine`
- The package appears in `GET /packages/registry`
- The item count matches expectation
- The descriptions survived formatting cleanly
