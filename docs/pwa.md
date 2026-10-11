# Cycle PWA and offline access

Open https://cycle.alexintosh.com in Safari on iOS, choose Share → Add to Home Screen, then open Cycle from its icon. On supported desktop/Android browsers, use the Install Cycle button or the browser's install action. The manifest launches Cycle in standalone mode and includes a maskable icon and an Apple touch icon.

Sign in online once on each installation and wait for “Rituals saved for offline use”. The app shell is precached by Workbox. The authenticated account's complete ritual/log snapshot is stored separately in IndexedDB, so previously unvisited date ranges can also be viewed offline. First login, passkey management, ritual edits, package changes and imports require a connection. Safari and an installed iOS web app may have separate storage; prepare the installed app while online too.

Check-ins are written to an account-specific IndexedDB queue before transmission. They remain available after reload. Cycle replays them in order when the app is open and connected, on reconnect, on returning to the foreground, or every 30 seconds while visible. iOS does not require Background Sync support. Commands have UUIDs; D1 atomically applies each command and records its request hash in `offline_mutations`. Retrying a lost response does not duplicate logs, and replaying an old toggle cannot undo a newer applied command. Concurrent devices converge in server arrival order.

The sync banner shows pending work and errors. Export pending changes before discarding anything you want to retain. A removed ritual or server rejection leaves its command in the queue for review. Management changes are blocked until pending check-ins sync. Updates wait for pending check-ins to finish. Logout clears cached account reads and stops transmission while retaining unsent commands for the same account after its next login. Another account cannot read or replay them. Clearing browser/app storage removes local copies and unsent work.

Only static application assets go into Service Worker caches. API responses use the account-specific IndexedDB store; explicit HTTP authentication failures never fall back to cached data. Existing session tokens remain in local storage. Offline access is a local copy on an already signed-in device, not a new offline login. Server authentication and ownership checks still apply to every synced command.

## Icon generation

Generated with the built-in image generation tool (`imagegen` skill), without an external API key. The full square source was reduced with `sips` to PNG assets under `apps/frontend/public/icons/`: `cycle-512.png`, `cycle-192.png`, `apple-touch-icon.png` (180 px), and `favicon.png` (64 px). The source is full bleed; iOS applies its own rounded mask.

Final generation prompt:

> Use case: logo-brand. Asset type: a single finished square app icon for Cycle, a calm recurring-life and habit tracker. Primary request: an elegant bold circular cycle symbol, two continuous curved flowing strokes forming an open loop with a subtle check-shaped return, centered and immediately recognizable at tiny iPhone home-screen sizes. Palette drawn from the app's pale sky-blue and mint interface: luminous aqua and soft mint symbol against a deep midnight navy background. Style: polished minimal dimensional icon, smooth rounded forms, restrained soft shading, generous breathing room. Composition: full-bleed square navy background without rounded outer corners; the entire symbol fits in the central 60 percent so it is safe under circular and iOS masks. No lettering, no words, no watermark, no device mockup, no border, no extra objects. Deliver only one square icon, not a contact sheet.

## Validation and deployment

Run `bun run verify:cloudflare`. Tests cover offline reopening, optimistic check-ins, lost responses, account isolation, logout, rejected commands, and the actual Miniflare/D1 endpoint including duplicate deliveries. Migration `0003_offline_sync.sql` adds only the replay ledger and leaves existing user data intact. Before applying it remotely, export D1 to the ignored backup directory. Apply migrations, then deploy the Worker with the built frontend assets. Browser verification must use a production build: the Service Worker is disabled during Vite development. A real iPhone installation still requires a device check.
