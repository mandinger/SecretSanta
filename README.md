# Secret Santa Web App

A secure Secret Santa room organizer with end-to-end encryption, user authentication, and festive Christmas theme.

## Features

- **Room-Based System:** Host creates a room with username/password authentication
- **Participant Registration:** Users register with their own username/password
- **Host Management:** View and manage participants before starting the room
- **E2E Encryption:** Assignments are encrypted client-side using CryptoJS AES
- **Auto-Login:** Host credentials saved in sessionStorage for seamless experience
- **Secure Authentication:** Passwords hashed with SHA-256, assignments encrypted per-user
- **Beautiful UI:** Christmas theme with snow animations and responsive design
- **Data Persistence:** Room data persists in Docker volumes across container rebuilds

## How It Works

1. **Host Creates Room:**
   - Visit the main page
   - Enter room name, your username, and password
   - Optionally auto-join to skip re-entering credentials

2. **Participants Register:**
   - Share the room URL with participants
   - Each participant creates their own username/password
   - Host can view and manage registered participants

3. **Host Starts Room:**
   - Once everyone is registered (minimum 2 participants)
   - Host clicks "Start Secret Santa Room"
   - Assignments are generated and encrypted client-side

4. **View Assignments:**
   - Participants sign in with their credentials
   - Their assignment is decrypted using their username+roomId as key
   - Completely secure - only the user can decrypt their own assignment

## Quick Start with Dev Container

1. **Open in VS Code:**
   - Install the "Dev Containers" extension
   - Open the folder and click "Reopen in Container"
   - All dependencies install automatically

2. **Run the server:**
   - Press F5 to start debugging, or
   - Run `npm start` in the terminal

3. **Access the app:**
   - Local URL: `http://localhost:8003`

## Quick Start with Docker

1. **Build and run with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

2. **Access the app:**
   - Local URL: `http://localhost:8003`

## Manual Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **For development:**
   ```bash
   npm run dev
   ```

## API Endpoints

- `POST /api/rooms` - Create a new room
- `GET /api/rooms/:id` - Get room details (public info)
- `POST /api/rooms/:id/register` - Register as a participant
- `POST /api/rooms/:id/host-auth` - Authenticate as host
- `POST /api/rooms/:id/remove-participant` - Remove a participant (host only)
- `POST /api/rooms/:id/start` - Start the room and lock assignments (host only)
- `POST /api/rooms/:id/login` - Login as participant to view assignment
- `GET /room/:id` - Room page (serves room.html)

## Technology Stack

- **Backend:** Node.js 18 with Express
- **Security:** 
  - SHA-256 password hashing (Node.js crypto module)
  - AES encryption (CryptoJS 4.1.1 client-side)
- **Frontend:** HTML5, CSS3, JavaScript, Tailwind CSS
- **Styling:** Christmas theme with custom animations and snowflakes
- **Development:** VS Code Dev Containers with Git support
- **Deployment:** Docker & Docker Compose
- **Data Storage:** JSON file persistence with volume mounts

## Security Features

- **Password Hashing:** All passwords hashed with SHA-256 before storage
- **Host Verification:** Host password combined with username for authentication
- **E2E Encryption:** Assignments encrypted client-side, server never sees plaintext
- **Unique Keys:** Each user's assignment encrypted with `username + roomId`
- **No URL Parameters:** Authentication state stored client-side (sessionStorage)
- **Rate Limiting:** Built-in rate limiting to prevent brute force attacks

## Development

**VS Code Debugging:**
- Press F5 to launch the debugger
- Two configurations available:
  - "Launch Server" - Start server.js directly
  - "Attach to Process" - Attach to running Node process

**Dev Container Setup:**
- Workspace folder mounted as bind volume (changes persist)
- Data folder uses named volume (survives rebuilds)
- Git and SSH keys automatically mounted
- All dependencies installed via `postCreateCommand`

## Notes

- Room data stored in `/app/data/rooms.json`
- Fisher-Yates shuffle ensures random, fair assignments
- Assignment algorithm guarantees no one gets themselves
- Participants can view participant list before room starts (auto-refresh every 5s)
- Host can remove participants until room is started

## Merry Christmas! 🎅🎄❄️
