# Secret Santa — AI Agent Guide

Purpose: make changes quickly and safely by following the project’s established patterns. Read this first.

## Big Picture
- Backend: Node.js + Express in `server.js`; persists rooms in JSON at `data/rooms.json` (auto-created) with timestamped backups in `data/backups/`.
- Frontend: static files in `public/` (`index.html`, `room.html`) using Tailwind (CDN) and shared utilities in `public/shared-utils.js` and `public/shared-styles.css`.
- E2E encryption model: clients derive an RSA-2048 keypair per user+room (PBKDF2 100k iterations) and send only the public key. Server generates plaintext assignments in memory once, encrypts per-recipient with RSA-OAEP (SHA-256), and stores only ciphertext.
- Source of truth for the flows and security rationale is `master-architecture.md`.

## Run & Dev
- Local: `npm install`, then `npm start` (serves on `http://localhost:8003`). Dev mode: `npm run dev` (nodemon).
- Docker: `docker-compose up --build`. Uses volume `secret-santa-data` for `data/` persistence. Env: `BASE_URL` influences response links.
- Data reset: stop the app, delete `data/rooms.json` (and `data/backups/`) or prune the Docker volume.

## API Surface (server.js)
- `POST /api/rooms` → create room. Body: `{ name, hostUsername, hostPassword }`. Returns `{ roomId, roomUrl, room }`.
- `GET /api/rooms/:id` → public room info.
- `POST /api/rooms/:id/init-register` → returns `{ keySalt, alreadyExists }` for `{ username, password }`.
- `POST /api/rooms/:id/register` → register or sign back in. Body: `{ username, password, publicKey, keySalt }`. Returns `roomDetails` and flags (`isHost`, `alreadyRegistered`).
- `POST /api/rooms/:id/host-auth` → host dashboard: `{ username, password }` → room with participant list.
- `POST /api/rooms/:id/remove-participant` → host-only removal while room is `open`.
- `POST /api/rooms/:id/start` → host-only: generates assignments, encrypts with RSA-OAEP, flips `status` to `started`.
- `POST /api/rooms/:id/login` → participant login when started. Returns `{ keySalt, encryptedAssignment }`.

## Client-Side Patterns (public/)
- Use `registerUser(roomId, username, password, button)` and `loginAndDecrypt(...)` from `shared-utils.js` instead of duplicating fetch/crypto logic.
- Key derivation: `deriveKeyPairFromPassword(username, password, roomId, keySalt)` with PBKDF2 (100k) → deterministic RSA-2048.
- Decryption: `decryptWithPrivateKey(encryptedBase64, privateKey)` with OAEP SHA-256.
- UI helpers: `setButtonState(button, text, disabled)` and `delay(ms)` manage user feedback; avoid alerts—errors render into view containers (see `room.html`).

## Security Constraints
- Passwords hashed with bcrypt (12 rounds). Server never stores private keys or plaintext assignments.
- Each participant record: `{ username, passwordHash, publicKey, keySalt, encryptedAssignment }`.
- Rate limit: simple in-memory, 10 requests/min per IP; return shape for failures is `{ error: string }`.

## Conventions & Gotchas
- Keep host authentication consistent: server verifies `username+password` against `room.hostLoginHash` (bcrypt). See `/api/rooms/:id/host-auth` and `/api/rooms/:id/start`.
- Use `BASE_URL` when constructing links server-side; client navigations use relative paths.
- Styling: prefer `shared-styles.css` classes (`christmas-card`, `btn-christmas`, etc.) and Tailwind utility classes.
- Static assets are served from `public/`; routes `/` → `index.html`, `/room/:id` → `room.html`.

## Quick Examples
- Create room (pwsh): `Invoke-RestMethod -Method Post -Uri http://localhost:8003/api/rooms -ContentType 'application/json' -Body (@{name='Party';hostUsername='Alice';hostPassword='pass'} | ConvertTo-Json)`
- Start dev: `npm run dev` then open `http://localhost:8003`.

When extending functionality, mirror the existing patterns (API shapes, error payloads, crypto flow) and update `master-architecture.md` only after code changes are finalized.
