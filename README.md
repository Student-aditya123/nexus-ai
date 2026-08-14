# ⚡ Nexus AI — Next-Gen AI Knowledge Assistant

> **Production-grade AI SaaS** built with MERN + Groq LPU Inference Engine  
> Ultra-fast RAG · Autonomous AI Agent · Real-time Streaming · Multi-document Understanding

[![CI/CD](https://github.com/your-org/nexus-ai/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/your-org/nexus-ai/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev)

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           NEXUS AI SYSTEM DESIGN                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐     ┌──────────────────────────────────────────────────┐  │
│   │   Vercel    │     │              AWS / Render Cloud                  │  │
│   │  (Frontend) │     │                                                  │  │
│   │             │     │  ┌─────────┐  ┌─────────┐  ┌──────────────────┐ │  │
│   │ React 18    │────▶│  │  Nginx  │  │ Node.js │  │   AI Service     │ │  │
│   │ Tailwind    │     │  │ Reverse │  │ Express │  │  ┌────────────┐   │ │  │
│   │ Framer      │     │  │  Proxy  │─▶│  API    │─▶│  │ Groq LPU   │   │ │  │
│   │ Zustand     │     │  │ (SSE +  │  │         │  │  │ llama3-70b │   │ │  │
│   │             │     │  │  WS)    │  │ BullMQ  │  │  └────────────┘   │ │  │
│   └─────────────┘     │  └─────────┘  │ Workers │  │  ┌────────────┐   │ │  │
│                        │              └────┬────┘  │  │  Vector DB │   │ │  │
│                        │                   │       │  │  (Pinecone │   │ │  │
│   ┌─────────────┐     │  ┌─────────────┐ │       │  │  /FAISS)   │   │ │  │
│   │  MongoDB    │     │  │   Redis     │ │       │  └────────────────┘ │  │
│   │   Atlas     │◀────│  │   Cache     │◀┘       └──────────────────────┘  │
│   │             │     │  │   + Queue   │                                    │
│   │  Users      │     │  └─────────────┘                                   │
│   │  Chats      │     │                                                     │
│   │  Documents  │     │  ┌─────────────┐                                   │
│   └─────────────┘     │  │   AWS S3    │                                   │
│                        │  │  (Storage)  │                                   │
│                        │  └─────────────┘                                   │
│                        └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 🧠 Data Flow: RAG Pipeline

```
User Query
    │
    ▼
Query Embedding (OpenAI text-embedding-3-small)
    │
    ▼
Vector Similarity Search (Pinecone/FAISS cosine similarity)
    │
    ▼
Top-K Chunk Retrieval (with metadata: filename, page, score)
    │
    ▼
Prompt Construction (System + Context + Conversation History)
    │
    ▼
Groq LPU Inference (llama3-70b-8192, ~300ms)
    │
    ▼
SSE Streaming (token-by-token, like ChatGPT)
    │
    ▼
MongoDB Persistence + Redis Cache + Analytics
```

## 🤖 AI Agent: ReAct Pattern

```
User Task: "Research quantum computing trends and calculate Moore's law projection"
    │
    ▼
LLM Reasoning (THOUGHT)
    │
    ▼
Tool Selection (ACTION): web_search("quantum computing 2024 trends")
    │
    ▼
Tool Execution (OBSERVATION): [search results returned]
    │
    ▼
LLM Reasoning (THOUGHT): "Now I need to calculate..."
    │
    ▼
Tool Selection (ACTION): calculate("2^(2024-1970) * 2300")
    │
    ▼
Tool Execution (OBSERVATION): "Result: 3.2e19"
    │
    ▼
LLM Reasoning → FINISH → Final synthesized answer
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| MongoDB | ≥ 7 |
| Redis | ≥ 7 |
| Docker | ≥ 24 |

### 1. Clone & Install

```bash
git clone https://github.com/your-org/nexus-ai.git
cd nexus-ai

# Backend
cd backend && npm install

# Frontend  
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Fill in required values:
# - GROQ_API_KEY (from console.groq.com - free tier available)
# - MONGODB_URI (MongoDB Atlas free tier)
# - JWT_SECRET, JWT_REFRESH_SECRET (generate with: openssl rand -hex 32)
# - OPENAI_API_KEY (optional - for embeddings, falls back to hash-based)

# Optional for full production:
# - PINECONE_API_KEY (vector DB)
# - AWS_* (S3 file storage)
# - STRIPE_* (billing)
# - GOOGLE_* (OAuth)
```

### 3. Start Development

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# OR: Full stack with Docker
docker-compose up --build
```

Access:
- Frontend: http://localhost:3000
- API: http://localhost:5000/api/v1
- Health: http://localhost:5000/api/v1/health

---

## 📁 Project Structure

```
nexus-ai/
├── backend/
│   ├── src/
│   │   ├── config/           # DB, Redis, Passport, Socket.io
│   │   ├── controllers/      # Route handlers
│   │   │   ├── auth.controller.js
│   │   │   ├── chat.controller.js    # SSE streaming
│   │   │   ├── document.controller.js
│   │   │   └── agent.controller.js   # ReAct agent
│   │   ├── middleware/        # Auth, rate limit, validation
│   │   ├── models/            # MongoDB schemas (User, Chat, Document)
│   │   ├── routes/            # Express routers
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   │   ├── groq.service.js       # Groq LPU integration
│   │   │   │   ├── vectorStore.service.js # Pinecone + fallback
│   │   │   │   └── agent.service.js      # ReAct agent executor
│   │   │   ├── document/
│   │   │   │   └── processor.service.js  # PDF/DOCX/PPT extraction
│   │   │   └── memory/
│   │   │       └── memory.service.js     # Short+long term memory
│   │   ├── utils/             # Logger, errors
│   │   ├── workers/           # BullMQ job queues
│   │   ├── app.js             # Express app
│   │   └── server.js          # HTTP server bootstrap
│   ├── tests/                 # Jest unit tests
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/          # SessionSidebar, ModeSelector, Sources
│   │   │   ├── layout/        # DashboardLayout, UserMenu
│   │   │   └── ui/            # Shared UI components
│   │   ├── pages/
│   │   │   ├── ChatPage.jsx   # Streaming chat with RAG
│   │   │   ├── DocumentsPage.jsx  # Upload + management
│   │   │   ├── AgentPage.jsx  # Step-by-step agent UI
│   │   │   └── AnalyticsPage.jsx  # Recharts dashboard
│   │   ├── services/
│   │   │   └── api.js         # Axios + token refresh
│   │   ├── stores/
│   │   │   └── auth.store.js  # Zustand auth state
│   │   └── main.jsx           # App entry + routing
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── docker/
│   └── nginx.conf
├── docker-compose.yml
├── .github/workflows/ci-cd.yml
└── README.md
```

---

## 🔌 API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register with email/password |
| POST | `/api/v1/auth/login` | Login, returns JWT + refresh cookie |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Invalidate tokens |
| GET | `/api/v1/auth/google` | Google OAuth flow |
| GET | `/api/v1/auth/me` | Get current user |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/chat/sessions` | List all sessions |
| POST | `/api/v1/chat/sessions` | Create session |
| GET | `/api/v1/chat/sessions/:id` | Get session details |
| PATCH | `/api/v1/chat/sessions/:id` | Update (title, pin, archive) |
| DELETE | `/api/v1/chat/sessions/:id` | Delete session |
| POST | `/api/v1/chat/message` | **Send message (SSE stream)** |

**Chat Message Request:**
```json
{
  "sessionId": "64f...",
  "message": "What is quantum entanglement?",
  "stream": true
}
```

**SSE Event Types:**
```
data: {"type": "status", "message": "Searching documents..."}
data: {"type": "sources", "data": [{...}]}
data: {"type": "delta", "content": "Quantum"}
data: {"type": "delta", "content": " entanglement"}
data: {"type": "complete", "messageId": "...", "usage": {...}}
```

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/documents/upload` | Upload file (multipart/form-data) |
| GET | `/api/v1/documents` | List documents (paginated) |
| GET | `/api/v1/documents/:id/status` | Processing status + progress |
| POST | `/api/v1/documents/:id/query` | Direct document Q&A |
| DELETE | `/api/v1/documents/:id` | Delete + remove vectors |

### AI Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agent/execute` | Execute task (SSE stream) |
| GET | `/api/v1/agent/tools` | List available tools |

---

## 🔐 Security Architecture

```
JWT Access Token (15min) ──▶ Protected Routes
JWT Refresh Token (7d)   ──▶ HTTP-only Cookie (httpOnly, Secure, SameSite)
Token Rotation           ──▶ Single-use refresh tokens (stored in MongoDB)
Token Blacklist          ──▶ Redis (15min TTL after logout)
Rate Limiting            ──▶ Per-user (not IP-based for authenticated routes)
Input Validation         ──▶ express-validator on all endpoints
Helmet.js               ──▶ Security headers (CSP, HSTS, etc.)
CORS                     ──▶ Allowlist-based origin validation
```

---

## ⚡ Performance Engineering

### Why Groq LPU?

| Metric | Groq LPU | Traditional GPU |
|--------|----------|-----------------|
| llama3-70b latency | ~300ms | ~3-5 seconds |
| Tokens/second | ~800 | ~30-100 |
| Time-to-first-token | <100ms | 500ms+ |

### Caching Strategy

```
L1: Redis (in-memory)      TTL: 15min - User sessions, embeddings
L2: MongoDB               TTL: Permanent - Chat history, documents
L3: Application cache     TTL: Request - Compiled models, configs
```

### Streaming

SSE (Server-Sent Events) is used instead of WebSockets for AI streaming because:
- One-directional (server → client) is sufficient
- Works through HTTP/2 multiplexing
- No connection upgrade handshake
- Automatic reconnection in browsers
- Works through standard CDN/load balancers

---

## 🧪 Testing

```bash
# Unit tests
cd backend && npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific test file
npm test -- tests/services.test.js
```

**Test Coverage Goals:**
- Services: ≥ 80%
- Controllers: ≥ 70%
- Middleware: ≥ 90%
- Utils: 100%

---

## 🌍 Deployment

### Frontend → Vercel (Zero-config)

```bash
cd frontend
npx vercel --prod
```

**Environment Variables in Vercel:**
```
VITE_API_URL=https://api.your-domain.com/api/v1
```

### Backend → Render / AWS

**Render:**
1. Connect GitHub repo
2. Set environment variables
3. Build command: `cd backend && npm ci`
4. Start command: `node src/server.js`

**AWS ECS (Production):**
```bash
# Build and push Docker image
docker build -t nexus-ai-backend ./backend
docker tag nexus-ai-backend:latest $ECR_URI/nexus-ai-backend:latest
docker push $ECR_URI/nexus-ai-backend:latest
```

### Database → MongoDB Atlas

1. Create M10+ cluster (for production)
2. Enable Atlas Search
3. Create indexes:
```javascript
// Run in Atlas
db.chatsessions.createIndex({ userId: 1, updatedAt: -1 })
db.documents.createIndex({ userId: 1, "processing.status": 1 })
db.users.createIndex({ email: 1 }, { unique: true })
```

### Vector DB → Pinecone

```bash
# Create index (1536 dims for OpenAI, 384 for fallback)
curl -X POST https://api.pinecone.io/indexes \
  -H "Api-Key: $PINECONE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"nexus-ai-embeddings","dimension":1536,"metric":"cosine","spec":{"serverless":{"cloud":"aws","region":"us-east-1"}}}'
```

---

## 🔧 Configuration Guide

### Groq API (Required for AI)

1. Visit [console.groq.com](https://console.groq.com)
2. Create API key (free tier: 100K tokens/day)
3. Add to `.env`: `GROQ_API_KEY=gsk_...`
4. Default model: `llama3-70b-8192` (70B params, ultra-fast)

### OpenAI (Optional - for better embeddings)

1. Without OpenAI: Uses hash-based fallback embeddings (works for demos, not production RAG)
2. With OpenAI: Uses `text-embedding-3-small` (1536 dims, production-quality RAG)

### AWS S3 (Optional - for file storage)

Without S3: Files stored in memory (lost on restart)
With S3: Files persist, multi-instance compatible

---

## 🎯 Feature Roadmap

- [x] Multi-document RAG with citations
- [x] Streaming responses (SSE)
- [x] AI Agent with tool use (ReAct)
- [x] JWT + Google OAuth
- [x] BullMQ async processing
- [x] Redis caching
- [x] Analytics dashboard
- [x] Usage billing (Stripe)
- [ ] Voice input (Web Speech API)
- [ ] Multi-user collaboration (shared sessions)
- [ ] Browser extension
- [ ] Custom fine-tuned models
- [ ] Multi-language support

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feat/your-feature`
3. Commit: `git commit -m 'feat: add voice input'`
4. Push: `git push origin feat/your-feature`
5. Open Pull Request

**Code Standards:**
- ESLint + Prettier
- Conventional commits
- Test coverage for new features
- JSDoc for service methods

---

## 📄 License

MIT © 2024 Nexus AI

---

<p align="center">
  Built with ❤️ using <strong>Groq LPU</strong> · <strong>MERN Stack</strong> · <strong>Production-grade engineering</strong>
</p>
