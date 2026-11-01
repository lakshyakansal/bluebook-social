# BlueBook Social

A runnable full-stack social platform starter with a **Google-inspired discovery/search landing page** and a **Facebook-inspired community feed**, in a modern white-and-blue visual style.

## Features

- Responsive landing page and social dashboard
- Account registration, login, logout, password hashing with bcrypt
- Server-side sessions stored in SQLite
- Create text posts, search posts/people, like/unlike posts, comment on posts
- Discover people, connect/disconnect, and edit your short profile bio
- SQLite database created automatically on first launch
- Render deployment blueprint with a persistent disk

> This is an original starter design inspired by broad interaction patterns, not a copy of Google's or Facebook's branding or proprietary interface. It does not include Google/Facebook OAuth, private messaging, photo/video uploads, notifications, or moderation tools.

## Architecture

```text
Browser (HTML + CSS + vanilla JS)
           |
           | same-origin JSON API + session cookie
           v
Node.js + Express server
  ├── Authentication (bcryptjs + express-session)
  ├── REST API (/api/register, /api/posts, /api/people, ...)
  └── SQLite data layer (better-sqlite3)
           |
           ├── users
           ├── posts
           ├── likes
           ├── comments
           └── friendships
```

## Requirements

- Node.js 20 or newer
- npm
- Git (for deployment)

## Run locally

1. Download and extract this ZIP.
2. Open a terminal in the extracted `bluebook-social` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create your environment file:

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

5. Open `.env` and replace `SESSION_SECRET` with a long random value. Keep the local `DB_PATH` as `./data/bluebook.sqlite`.
6. Start the website:

   ```bash
   npm start
   ```

7. Open http://localhost:3000.
8. Select **Join free**, create an account, and try creating a post, liking it, commenting, searching, connecting with another account, and editing your bio.

The database and session database are created automatically. You do not need to create tables manually. To test the people-discovery feature, register a second account in another browser or after signing out.

### Development mode

```bash
npm run dev
```

## Deploy on Render

### Option A: Blueprint deployment

1. Create a GitHub repository and upload the extracted project files to its root.
2. Sign in to Render and choose **New → Blueprint**.
3. Select your GitHub repository. Render reads `render.yaml`.
4. Review the service and persistent disk settings, then deploy.
5. Once deployment completes, open the generated `onrender.com` URL and register an account.

The blueprint configures `DB_PATH=/var/data/bluebook.sqlite` and mounts a persistent disk at `/var/data`, so SQLite data survives ordinary redeploys. A persistent disk generally requires a paid Render service; check Render's current plan and disk pricing before deployment.

### Option B: Create a Web Service manually

- **Runtime:** Node
- **Build command:** `npm install`
- **Start command:** `npm start`
- **Health check path:** `/api/health`
- **Environment variables:**
  - `NODE_ENV` = `production`
  - `SESSION_SECRET` = a long random secret
  - `DB_PATH` = `/var/data/bluebook.sqlite`
- Add a persistent disk mounted at `/var/data`.

Do not deploy with a temporary filesystem if you need to retain user accounts and posts between restarts. Back up the database file regularly.

## API overview

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/me` | Current signed-in user |
| POST | `/api/register` | Create an account |
| POST | `/api/login` | Sign in |
| POST | `/api/logout` | Sign out |
| GET | `/api/posts?q=term` | Read/search posts |
| POST | `/api/posts` | Publish a post |
| POST | `/api/posts/:id/like` | Toggle a like |
| POST | `/api/posts/:id/comments` | Add a comment |
| GET | `/api/people` | Discover people |
| POST | `/api/people/:id/friend` | Toggle a connection |
| PATCH | `/api/me` | Update profile bio |

## Database tables

- `users`: account identity, email, password hash, bio
- `posts`: text posts and authors
- `likes`: unique user/post pairs
- `comments`: comments on posts
- `friendships`: directional connections

SQLite initializes the schema in `server.js` when the server starts.

## Before production use

This is a functional learning/MVP starter, not a fully hardened commercial social network. Before opening it to the public, add rate limiting and login throttling, CSRF protection appropriate to your deployment, email verification and password reset, moderation/report/block tools, upload storage and scanning if adding media, automated tests, backups, logging/monitoring, accessibility testing, and a privacy policy/terms. Consider PostgreSQL if you expect multiple app instances or substantial traffic. Never commit `.env`, database files, or user data to GitHub.

## Troubleshooting

- **Port busy:** set a different `PORT` in `.env`.
- **Native module install issue:** use a current Node.js LTS version (20+), remove `node_modules`, then rerun `npm install`.
- **Data disappeared on Render:** check that the persistent disk is attached and `DB_PATH` points inside its mount directory.
- **Login/session problems after deployment:** confirm `NODE_ENV=production`, use HTTPS (Render provides it), and set a stable `SESSION_SECRET`.

  <div align="center">

Developed by Lakshya Kansal

</div>

