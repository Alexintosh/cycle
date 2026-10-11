# Package API

Use this reference when you need the exact route shape or a ready-to-run publish command.

## Base URL

Use the reverse-proxied API base for the target deployment.

Examples:

- local backend: `http://localhost:3101`
- subpath deployment: `https://example.internal/cycle/api`

## Authentication

### Bypass mode

If auth bypass is enabled, omit the `Authorization` header.

Check:

```bash
curl -sS "$BASE_URL/auth/mode" | jq
```

### Standard mode

If auth bypass is disabled, send:

```bash
-H "Authorization: Bearer $TOKEN"
```

## Useful reads

List owned packages:

```bash
curl -sS "$BASE_URL/packages/mine" | jq
```

List public registry:

```bash
curl -sS "$BASE_URL/packages/registry" | jq
```

## Create a package

```bash
curl -sS "$BASE_URL/packages" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER:+-H "$AUTH_HEADER"} \
  -d '{
    "title": "Example Package",
    "description": "A focused recurring life system.",
    "version": "1.0.0",
    "tags": ["example", "admin"],
    "items": [
      {
        "id": "monthly-review",
        "timeframe": "monthly",
        "emoji": "🗂️",
        "title": "Run the monthly review",
        "description": "Check the current state, resolve drift, and follow the official guide: https://example.com/guide",
        "goal": 1,
        "section": "ADMIN",
        "color": "#3B82F6"
      }
    ]
  }' | jq
```

If you want `AUTH_HEADER` expansion to work cleanly in shell, set:

```bash
export AUTH_HEADER="Authorization: Bearer $TOKEN"
```

Or omit that line entirely in bypass mode.

## Update a package

Use the same payload shape with `PATCH`:

```bash
curl -sS -X PATCH "$BASE_URL/packages/$PACKAGE_ID" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER:+-H "$AUTH_HEADER"} \
  -d '{
    "title": "Example Package",
    "description": "Updated package description.",
    "version": "1.1.0",
    "tags": ["example", "admin"],
    "items": [
      {
        "id": "monthly-review",
        "timeframe": "monthly",
        "emoji": "🗂️",
        "title": "Run the monthly review",
        "description": "Updated instructions and links.",
        "goal": 1,
        "section": "ADMIN",
        "color": "#3B82F6"
      },
      {
        "id": "quarterly-audit",
        "timeframe": "quarterly",
        "emoji": "🔍",
        "title": "Do the quarterly audit",
        "description": "Review the deeper system every quarter.",
        "goal": 1,
        "section": "ADMIN",
        "color": "#1D4ED8"
      }
    ]
  }' | jq
```

## Supported item values

`timeframe` must be one of:

- `daily`
- `weekly`
- `monthly`
- `quarterly`
- `semiannual`
- `yearly`

`goal` may be:

- a number such as `1`, `2`, or `7`
- `null`

`section` is free-form, but it becomes the installed habit category. Keep it stable and intentional.

## Versioning guidance

Use semantic versioning in a practical way:

- `1.0.0` for first publish
- bump patch for wording fixes or tiny clarifications
- bump minor for added items or meaningful improvements
- bump major only when the package meaning changes substantially

## Quality checklist

Before publishing:

- The package audience is clear.
- The package is not overloaded.
- Every item has a concrete action.
- Time-sensitive descriptions include exact windows.
- Official links are present where available.
- Optional videos are official and useful.
