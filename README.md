# Real-Time Private Chat & Video App

> A secure, private messaging app built with React, Node.js, Socket.IO, and PostgreSQL.
> Messages are encrypted end-to-end in storage. No one can read your chats — not even by inspecting the browser.

**🌐 Live App:** [https://real-time-chat-video-app.vercel.app/](https://real-time-chat-video-app.vercel.app/) 

---

## Screenshots

| Sign In / Sign Up | Chat Dashboard | Private Messaging |
|:-:|:-:|:-:|
| ![login](./screenshots/login.png) | ![dashboard](./screenshots/dashboard.png) | ![chat](./screenshots/chat.png) |

---

## What is This?

It is a full-stack real-time chat application I built to learn how production-grade messaging apps actually work under the hood. It's not just a "hello world" WebSocket demo — it has proper authentication, private conversations, encrypted message storage, offline support, and a clean deployment setup across multiple cloud services.

The idea started simple: I wanted to build something where me and my friends could privately message each other. But as I dug deeper, I realized there's a LOT that goes into making chat feel seamless and secure. Things like: what happens when you go offline mid-conversation? How do you make sure nobody can snoop on your messages through browser DevTools? How does the server know who to deliver a message to without broadcasting it to everyone?

Building this taught me more than any tutorial ever could.

---

## Features

### Authentication
- Sign up and sign in with a unique username and password
- Passwords are hashed with **bcrypt** before saving — never stored in plain text
- Session handled with **JWT** (JSON Web Tokens), valid for 7 days
- Password visibility toggle (that little 👁 icon) on both forms
- On page refresh, your session is automatically restored — no re-login needed

### Private User Search (Privacy-First)
- Search for friends using the search bar in the dashboard
- Here's the thing: **you have to type the exact full username** to find someone
- No partial matches, no suggestions, no user browsing — this is intentional
- If you don't know someone's username, you can't find them. Period.

### Private 1-on-1 Messaging
- Every conversation is strictly between two users
- Messages are delivered **only** to the intended recipient via Socket.IO user rooms
- Nobody else can see your conversation — not even other logged-in users
- When you add someone, a private chat room is created that only you two can access

### Encrypted Message Storage
This was the most interesting part to build. Messages are encrypted in **two places**:

1. **In the browser (IndexedDB):** When your chat history is saved locally for offline access, it's encrypted with AES-256 using CryptoJS. If someone opens DevTools and looks at the IndexedDB, they'll see gibberish ciphertext — not your actual messages.

2. **In the database (PostgreSQL):** Before any message is written to the database on the server, it's encrypted with AES-256-GCM using Node.js's built-in `crypto` module. So even if someone got access to the database, they can't read the messages without the encryption key.

### Offline-First Architecture
- Messages you send appear in your UI **instantly**, even before the server confirms receipt
- They're saved locally first (IndexedDB via Dexie.js), then synced to the server when connected
- If you're offline, messages are queued and sent automatically when you reconnect
- This makes the app feel fast — no waiting on network round trips

### Full Chat Restoration on Login
- When you log out, all local data (IndexedDB) is completely wiped clean
- When you log back in, all your past conversations are fetched securely from the server
- Everything is re-encrypted and stored locally again for your session
- Your data never lingers in the browser after logout

### Online Status Indicator
- A small badge in the dashboard shows whether you're connected to the server in real-time

---

## Architecture & Why I Made These Choices

This is the section where things get interesting. A lot of architectural decisions here were deliberate — I want to explain the "why" behind each one.

### Why JWT instead of traditional sessions?

JWT (JSON Web Tokens) are stateless — the server doesn't need to store session data anywhere. The token itself contains the user info and is verified cryptographically. This works perfectly with Socket.IO because the token is sent during the WebSocket handshake, so the server always knows who's connecting. With traditional sessions, I'd need a Redis session store just to verify Socket connections, which adds complexity.

### Why Socket.IO user rooms instead of broadcasting?

Early on, the simplest approach would've been to broadcast every message to everyone and let the client filter. But that's terrible for privacy — every user's browser would receive every message. Instead, when a user connects, they join a personal room (`user:<username>`). Messages are emitted only to that specific room. This means the network traffic is private and the server never broadcasts messages to unintended recipients.

### Why Offline-First with Dexie/IndexedDB?

Chat apps should feel instant. If every message had to wait for a server round-trip before appearing, the app would feel sluggish — especially on slower connections. By saving to IndexedDB first and syncing in the background, the user experience is snappy. The sync manager handles retrying failed sends automatically.

### Why two layers of encryption?

- **IndexedDB encryption (browser side):** Protects against someone physically accessing your computer and opening DevTools or extracting browser storage.
- **Database encryption (server side):** Protects against database leaks. Even if someone dumps the Postgres database, message content is unreadable without the server's encryption key.

### Why Render for backend and Vercel for frontend?

**Vercel is serverless.** When you deploy a Node.js app on Vercel, it runs as Lambda functions that spin up on request and die after the response. Socket.IO requires a **persistent connection** — the server and client need to stay connected in real-time. Serverless functions can't do that. So Vercel was out for the backend.

**Render** gives you always-on servers with persistent connections, which is exactly what Socket.IO needs. The free tier spins down after inactivity but works well for a portfolio project.

For the frontend (React + Vite), Vercel is honestly perfect — global CDN, automatic HTTPS, instant deploys on every `git push`, and zero config for SPAs.

### Why Neon.tech for PostgreSQL?

Neon offers a generous free tier of managed PostgreSQL with SSL built-in and connection pooling. It's also "serverless Postgres" which means it scales down to zero when idle (great for a free-tier project that isn't getting millions of requests). Most importantly — it just works with a standard `DATABASE_URL` connection string, no special drivers needed.

### Why exact username match in search?

This is a privacy-first design decision. If I allowed partial matches or fuzzy search, users could potentially discover other people's accounts just by typing common words. With exact-match-only, you can only find someone if you already know their full username. You'd share your username with friends directly — not discover strangers through the app.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 19 + Vite | Fast dev experience, modern React features |
| Styling | Tailwind CSS v4 | Utility-first, no CSS file mess |
| Icons | Lucide React | Clean, consistent icon set |
| Real-time | Socket.IO (client) | Reliable WebSocket with fallback |
| Local DB | Dexie.js (IndexedDB) | Clean API over browser's IndexedDB |
| Local Encryption | CryptoJS (AES-256) | Encrypt local storage so DevTools shows ciphertext |
| Backend | Node.js + Express 5 | ESM modules, async-first |
| Real-time (server) | Socket.IO 4 | Rooms, namespaces, auth middleware |
| Auth | JWT + bcryptjs | Stateless auth, secure password hashing |
| Database | PostgreSQL | Reliable relational DB, perfect for messages |
| DB Encryption | Node.js `crypto` (AES-256-GCM) | Authenticated encryption, tamper-proof |
| Cloud DB | Neon.tech | Free managed Postgres with SSL |
| Backend Deploy | Render | Persistent server (required for Socket.IO) |
| Frontend Deploy | Vercel | Global CDN, instant deploys |
| Local Dev | Docker Compose | Spin up Postgres + Redis locally, no installs |

---

## Project Structure

```
chat-video-app/
├── backend/
│   ├── server.js           # Main server: Express routes + Socket.IO + auth + encryption
│   ├── package.json        # type: module (ESM), all backend deps
│   └── .env                # Secret keys (never committed)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Root component, session init, auth state
│   │   ├── components/
│   │   │   ├── Authenticate.jsx        # Login/Signup form with password toggle
│   │   │   └── ChatDashboard.jsx       # Main UI: sidebar, chat window, search
│   │   ├── services/
│   │   │   ├── authentication.js       # Auth API calls, localStorage, IndexedDB wipe
│   │   │   ├── chatService.js          # User search, conversation & message API calls
│   │   │   └── syncManager.js          # Pending message sync, incoming message handler
│   │   ├── db/
│   │   │   └── db.js                   # Dexie schema (messages + conversations tables)
│   │   └── utils/
│   │       └── crypto.js               # CryptoJS AES encrypt/decrypt helpers
│   ├── public/                         # Favicon, static assets
│   ├── vercel.json                     # SPA rewrite rules (all routes → index.html)
│   └── .env                            # VITE_BACKEND_URL
│
└── compose.yaml                        # Docker: PostgreSQL + Redis for local dev
```

---

## 🚀 Running Locally

### Prerequisites
- Node.js 18+
- Docker Desktop (for local Postgres)

### 1. Clone the repo

```bash
git clone https://github.com/Aryan-Kumar7369/real-time-chat-video-app.git
cd real-time-chat-video-app
```

### 2. Start the database

```bash
docker compose up -d
```

This starts a PostgreSQL instance on port `5432`.

### 3. Set up the backend

```bash
cd backend
cp .env.example .env   # then fill in your values
npm install
npm run dev
```

**Backend `.env` variables:**

```env
PORT=3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/chatdb
JWT_SECRET=your_super_secret_jwt_key
CLIENT_URL=http://localhost:5173
```

### 4. Set up the frontend

```bash
cd frontend
cp .env.example .env   # then fill in your values
npm install
npm run dev
```

**Frontend `.env` variables:**

```env
VITE_BACKEND_URL=http://localhost:3001
```

### 5. Open the app

Visit [http://localhost:5173](http://localhost:5173) — create two accounts in different tabs and start chatting!

---

## ☁️ Deployment

The app is deployed across three services (all free tiers):

| Service | What's deployed | URL |
|---------|----------------|-----|
| **Render** | Node.js backend + Socket.IO | `https://your-backend.onrender.com` |
| **Vercel** | React frontend | `https://your-app.vercel.app` |
| **Neon.tech** | PostgreSQL database | Connection via `DATABASE_URL` |

### Environment variables you need to set:

**On Render (backend):**
```
DATABASE_URL         → from Neon.tech dashboard
JWT_SECRET           → any long random string
CLIENT_URL           → your Vercel frontend URL
```

**On Vercel (frontend):**
```
VITE_BACKEND_URL     → your Render backend URL
```

---

## What's Coming Next — Video Calls

The chat header already has a video call button in the UI. It doesn't do anything yet, but here's the plan:

I'm going to implement **WebRTC-based peer-to-peer video calling**. When two users are in a private conversation, they'll be able to start a video call with each other directly — the media (audio/video) streams peer-to-peer, so it doesn't even pass through the server. The only thing the server handles is the **signaling** (exchanging connection info between peers), which I'll build on top of the existing Socket.IO backend.

This is the most technically complex feature I'll add, and honestly the one I'm most excited about.

---

## REST API Reference

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `POST` | `/api/auth/signup` | Register new user |
| `POST` | `/api/auth/login` | Login and get JWT |
| `GET` | `/api/auth/me` | Verify token, get user info |
| `GET` | `/api/users/search?q=username` | Exact username lookup |
| `GET` | `/api/conversations` | All conversations for current user |
| `GET` | `/api/messages/:conversationId` | Message history for one chat |
| `GET` | `/api/messages/sync-all` | All messages across all chats (for restoration on login) |

---

## 👨‍💻 About

Built by **Aryan Kumar** as a full-stack portfolio project.

Thanks for making it this far! I built this entirely from scratch, made real architectural decisions, and learned a ton along the way. Happy to talk through any of it.

- GitHub: [https://github.com/Aryan-Kumar7369]
- LinkedIn: [https://www.linkedin.com/in/aryan-kumar-ak/]

---

