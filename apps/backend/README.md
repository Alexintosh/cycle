# Cycle backend

Elysia with Drizzle, using SQLite for Bun/Docker and D1 for Cloudflare Workers.

```bash
bun install
bun run dev
```

The local API uses `data/habit-tracker.db` and exposes Swagger at `/swagger`. The default auth uses an email identifier, passkey signup/login and one-use recovery codes. It needs no email provider. Legacy OTP is disabled unless EMAIL_AUTH_ENABLED=true and an email sender is configured. Codes are never logged by the application. Trusted private deployments can explicitly enable the legacy bypass mode. Cloudflare always requires individual user authentication.

For Workers/D1 setup, backup, migration, verification and deployment, follow [the Cloudflare guide](../../docs/cloudflare.md).
