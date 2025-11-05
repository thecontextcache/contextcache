# ContextCache Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [System Architecture](#system-architecture)
3. [Deployment Architecture](#deployment-architecture)
4. [Data Flow](#data-flow)
5. [Authentication Flow](#authentication-flow)
6. [Encryption Architecture](#encryption-architecture)
7. [Database Schema](#database-schema)
8. [API Architecture](#api-architecture)
9. [Component Architecture](#component-architecture)

---

## System Overview

ContextCache is a privacy-first, cloud-native knowledge graph system with zero-knowledge encryption. It combines advanced vector search, hybrid ranking algorithms, and cryptographic verification to provide secure, explainable AI memory.

### Key Features
- **Zero-Knowledge Encryption**: End-to-end encryption with XChaCha20-Poly1305
- **Hybrid Ranking**: BM25 + Dense Vectors + PageRank + Time Decay
- **Multi-tenant**: Row-level security with Clerk authentication
- **Semantic Search**: pgvector with sentence-transformers embeddings
- **Background Jobs**: Arq + Redis for async processing
- **Glassmorphism UI**: Premium UI/UX with Framer Motion animations

---

## System Architecture

\`\`\`mermaid
graph TB
    subgraph "Client Layer"
        Browser[Web Browser]
        Mobile[Mobile Browser]
    end

    subgraph "CDN Layer - Cloudflare"
        CF[Cloudflare CDN]
        CFWorkers[Cloudflare Workers<br/>Next.js SSR Runtime]
        CFPages[Cloudflare Pages<br/>Static Assets]
    end

    subgraph "Frontend - Next.js 15 + React 19"
        NextApp[Next.js App Router]
        ClerkUI[Clerk Authentication UI]
        ReactQuery[TanStack React Query]
        ZustandStore[Zustand State Management]
        FramerMotion[Framer Motion Animations]

        subgraph "Pages"
            Landing[Landing Page]
            Dashboard[Dashboard]
            Ask[Ask/Query]
            Inbox[Document Inbox]
            Graph[Knowledge Graph]
            Settings[Settings]
        end

        subgraph "Components"
            ThemeToggle[Enhanced Theme Toggle]
            ModelSelector[AI Model Selector]
            NavBar[Glassmorphic Navigation]
            GlassCards[Glass Effect Cards]
        end
    end

    subgraph "Authentication - Clerk"
        ClerkAuth[Clerk Auth Service]
        ClerkMiddleware[Clerk Middleware]
        ClerkWebhooks[Clerk Webhooks]
    end

    subgraph "Backend - FastAPI + Python 3.13"
        subgraph "API Layer"
            FastAPI[FastAPI Application]
            Middleware[Auth Middleware]
            RateLimiter[Rate Limiter]
            CORS[CORS Handler]
        end

        subgraph "Services"
            EncryptionService[Encryption Service<br/>XChaCha20-Poly1305]
            KeyService[Key Management Service<br/>Argon2id + KEK/DEK]
            EmbeddingService[Embedding Service<br/>sentence-transformers]
            RankingService[Ranking Service<br/>Hybrid Algorithm]
            SearchService[Search Service<br/>Vector + BM25]
        end

        subgraph "Background Workers"
            ArqWorker[Arq Worker]
            DocProcessor[Document Processor]
            RankComputer[PageRank Computer]
            DecayUpdater[Time Decay Updater]
        end
    end

    subgraph "Data Layer - Neon PostgreSQL"
        PostgreSQL[(PostgreSQL 16<br/>+ pgvector)]

        subgraph "Tables"
            Projects[Projects<br/>RLS by user_id]
            Documents[Documents<br/>RLS by project_id]
            Chunks[Document Chunks<br/>encrypted_text + nonce]
            Embeddings[Vector Embeddings<br/>384 dimensions]
            Keys[Encryption Keys<br/>KEK + DEK]
        end
    end

    subgraph "Cache Layer - Upstash Redis"
        Redis[(Redis)]
        JobQueue[Job Queue<br/>Arq Tasks]
        RateLimit[Rate Limit Counters]
        SessionCache[Session Cache]
    end

    subgraph "External Services"
        HuggingFace[HuggingFace<br/>Model Downloads]
        Ollama[Ollama<br/>Local Models]
    end

    Browser -->|HTTPS| CF
    Mobile -->|HTTPS| CF
    CF --> CFWorkers
    CF --> CFPages
    CFWorkers --> NextApp
    NextApp --> ClerkUI
    NextApp --> ReactQuery
    NextApp --> ZustandStore
    NextApp --> FramerMotion
    NextApp --> Pages
    NextApp --> Components
    ClerkUI --> ClerkAuth
    ClerkAuth --> ClerkMiddleware
    ClerkAuth --> ClerkWebhooks
    ClerkMiddleware --> FastAPI
    ReactQuery -->|REST API| FastAPI
    FastAPI --> Middleware
    Middleware --> RateLimiter
    RateLimiter --> CORS
    CORS --> Services
    Services --> EncryptionService
    Services --> KeyService
    Services --> EmbeddingService
    Services --> RankingService
    Services --> SearchService
    EncryptionService --> Chunks
    KeyService --> Keys
    EmbeddingService --> Embeddings
    RankingService --> Documents
    SearchService --> PostgreSQL
    FastAPI --> ArqWorker
    ArqWorker --> DocProcessor
    ArqWorker --> RankComputer
    ArqWorker --> DecayUpdater
    ArqWorker --> Redis
    FastAPI --> Redis
    PostgreSQL --> Projects
    PostgreSQL --> Documents
    PostgreSQL --> Chunks
    PostgreSQL --> Embeddings
    PostgreSQL --> Keys
    Redis --> JobQueue
    Redis --> RateLimit
    Redis --> SessionCache
    EmbeddingService --> HuggingFace
    EmbeddingService --> Ollama

    style Browser fill:#e1f5ff
    style CF fill:#f4b400
    style NextApp fill:#61dafb
    style ClerkAuth fill:#6c47ff
    style FastAPI fill:#009688
    style PostgreSQL fill:#336791
    style Redis fill:#dc382d
    style EncryptionService fill:#ff6b6b
    style KeyService fill:#ff6b6b
\`\`\`

---

## Deployment Architecture

\`\`\`mermaid
graph TB
    subgraph "GitHub"
        Repo[GitHub Repository<br/>main branch]
        Actions[GitHub Actions<br/>CI/CD]
    end

    subgraph "Cloudflare Deployment"
        CFBuild[Cloudflare Pages Build]
        CFDeploy[Cloudflare Workers Deployment]
        CFCDN[Cloudflare CDN<br/>Global Edge Network]

        subgraph "Build Process"
            NextBuild[1. next build]
            AdapterBuild[2. @cloudflare/next-on-pages]
            Output[3. .vercel/output/static]
        end
    end

    subgraph "Google Cloud Platform"
        GCR[Google Container Registry]

        subgraph "Cloud Run Services"
            APIService[API Service<br/>contextcache-api<br/>Min: 1, Max: 10]
            WorkerService[Worker Service<br/>contextcache-worker<br/>Min: 1, Max: 5]
        end

        subgraph "Secret Manager"
            Secrets[Secrets<br/>- DATABASE_URL<br/>- REDIS_URL<br/>- CLERK_SECRET_KEY<br/>- SESSION_ENCRYPTION_KEY]
        end

        VPC[VPC Connector<br/>Private Network]
    end

    subgraph "Neon Database"
        NeonDB[(Neon PostgreSQL<br/>Serverless<br/>Auto-scaling)]
    end

    subgraph "Upstash Redis"
        UpstashRedis[(Upstash Redis<br/>Serverless<br/>REST API)]
    end

    subgraph "Clerk Authentication"
        ClerkService[Clerk Service<br/>Authentication<br/>User Management]
    end

    Repo --> Actions
    Actions -->|Push to main| CFBuild
    Actions -->|Create tag| GCR

    CFBuild --> NextBuild
    NextBuild --> AdapterBuild
    AdapterBuild --> Output
    Output --> CFDeploy
    CFDeploy --> CFCDN

    GCR --> APIService
    GCR --> WorkerService
    APIService --> Secrets
    WorkerService --> Secrets
    APIService --> VPC
    WorkerService --> VPC
    VPC --> NeonDB
    VPC --> UpstashRedis
    APIService --> ClerkService
    CFCDN --> APIService
    CFCDN --> ClerkService

    style Repo fill:#24292e
    style CFBuild fill:#f4b400
    style CFCDN fill:#f4b400
    style GCR fill:#4285f4
    style APIService fill:#34a853
    style WorkerService fill:#34a853
    style NeonDB fill:#336791
    style UpstashRedis fill:#dc382d
    style ClerkService fill:#6c47ff
\`\`\`

---

## Data Flow

\`\`\`mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Cloudflare
    participant NextJS as Next.js SSR
    participant Clerk
    participant API as FastAPI
    participant Encryption as Encryption Service
    participant Keys as Key Service
    participant Embedding as Embedding Service
    participant DB as PostgreSQL
    participant Redis
    participant Worker as Arq Worker

    User->>Browser: Upload Document
    Browser->>Cloudflare: POST /api/documents
    Cloudflare->>NextJS: Route Request
    NextJS->>Clerk: Verify JWT Token
    Clerk-->>NextJS: User Info + Claims
    NextJS->>API: Forward Request + Auth

    API->>Encryption: Encrypt Document
    Encryption->>Keys: Get/Create DEK
    Keys->>DB: Fetch KEK (if exists)
    alt New Project
        Keys->>Keys: Generate KEK from passphrase
        Keys->>DB: Store encrypted KEK
    end
    Keys-->>Encryption: Return DEK
    Encryption->>Encryption: XChaCha20-Poly1305 Encrypt
    Encryption-->>API: Encrypted Data + Nonce

    API->>Embedding: Generate Embeddings
    Embedding->>Embedding: sentence-transformers
    Embedding-->>API: Vector Embeddings (384d)

    API->>DB: Store Document
    DB->>DB: Create document record
    DB->>DB: Create chunks (encrypted_text, nonce)
    DB->>DB: Store embeddings (pgvector)
    DB-->>API: Document ID

    API->>Redis: Enqueue Background Jobs
    Redis->>Redis: Add to job queue
    Redis-->>API: Job ID

    API-->>NextJS: Success Response
    NextJS-->>Browser: Document Uploaded
    Browser-->>User: Show Success

    Redis->>Worker: Dequeue Job
    Worker->>Worker: Compute PageRank
    Worker->>Worker: Update Time Decay
    Worker->>DB: Update Rankings
    DB-->>Worker: Success
    Worker-->>Redis: Mark Job Complete
\`\`\`

---

## Authentication Flow

\`\`\`mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Cloudflare
    participant NextJS as Next.js SSR
    participant Middleware as Clerk Middleware
    participant Clerk as Clerk Auth
    participant API as FastAPI
    participant DB as PostgreSQL

    User->>Browser: Navigate to /dashboard
    Browser->>Cloudflare: GET /dashboard
    Cloudflare->>NextJS: Route Request
    NextJS->>Middleware: Check Auth

    alt Not Authenticated
        Middleware-->>NextJS: Redirect to Sign In
        NextJS-->>Browser: 302 Redirect
        Browser->>Clerk: Show Sign In Modal
        User->>Clerk: Enter Credentials
        Clerk->>Clerk: Verify Credentials
        Clerk-->>Browser: Set Session Cookie + JWT
        Browser->>Cloudflare: GET /dashboard (with JWT)
        Cloudflare->>NextJS: Route Request
        NextJS->>Middleware: Check Auth
    end

    Middleware->>Clerk: Verify JWT Token
    Clerk-->>Middleware: Token Valid + User Claims
    Middleware->>Middleware: Extract user_id, session_id
    Middleware-->>NextJS: Auth Context

    NextJS->>API: GET /api/projects (with JWT)
    API->>API: Validate JWT
    API->>API: Extract user_id
    API->>DB: Query projects WHERE user_id = ?
    DB-->>API: Projects List
    API-->>NextJS: Projects Data

    NextJS->>NextJS: Render Dashboard
    NextJS-->>Browser: HTML + Data
    Browser-->>User: Show Dashboard

    Note over User,DB: User is now authenticated<br/>Session stored in cookie<br/>JWT used for API calls
\`\`\`

---

## Encryption Architecture

\`\`\`mermaid
graph TB
    subgraph "Key Hierarchy"
        Passphrase[Master Passphrase<br/>User-provided<br/>Never stored]
        KEK[KEK - Key Encryption Key<br/>Derived via Argon2id<br/>Encrypted with passphrase]
        DEK[DEK - Data Encryption Key<br/>32 bytes random<br/>Encrypted with KEK]
        ContentKey[Content Encryption<br/>XChaCha20-Poly1305]
    end

    subgraph "Encryption Process"
        PlainDoc[Document Content<br/>Plain Text]
        Chunks[Split into Chunks<br/>Overlap 50 chars]
        EncChunks[Encrypted Chunks<br/>Ciphertext + Nonce]
        Storage[(Encrypted Storage<br/>PostgreSQL)]
    end

    subgraph "Key Derivation - Argon2id"
        Salt[Random Salt<br/>16 bytes]
        Params[Parameters<br/>time=3, memory=64MB<br/>parallelism=4]
        DerivedKey[32-byte Key]
    end

    subgraph "Encryption - XChaCha20-Poly1305"
        Nonce[Nonce<br/>24 bytes random]
        Cipher[XChaCha20 Stream Cipher]
        MAC[Poly1305 MAC<br/>Authentication Tag]
        Ciphertext[Encrypted Data<br/>+ 16-byte tag]
    end

    Passphrase -->|Argon2id| KEK
    KEK -->|Decrypt| DEK
    DEK -->|Encrypt| ContentKey
    ContentKey --> Cipher

    PlainDoc --> Chunks
    Chunks --> EncChunks
    EncChunks --> Storage

    Salt --> Params
    Params --> DerivedKey
    DerivedKey --> KEK

    Nonce --> Cipher
    Cipher --> MAC
    MAC --> Ciphertext
    Ciphertext --> Storage

    style Passphrase fill:#ff6b6b
    style KEK fill:#ffd93d
    style DEK fill:#6bcf7f
    style ContentKey fill:#4d96ff
    style Storage fill:#336791
\`\`\`

### Encryption Flow Sequence

\`\`\`mermaid
sequenceDiagram
    actor User
    participant UI
    participant KeyService
    participant EncService as Encryption Service
    participant DB

    User->>UI: Enter Passphrase
    UI->>KeyService: get_or_create_kek(passphrase, project_id)

    alt KEK Exists
        KeyService->>DB: Fetch KEK record
        DB-->>KeyService: encrypted_kek + salt + nonce
        KeyService->>KeyService: Derive key from passphrase (Argon2id)
        KeyService->>KeyService: Decrypt KEK (XChaCha20)
        KeyService-->>KeyService: KEK (32 bytes)
    else New Project
        KeyService->>KeyService: Generate salt (16 bytes)
        KeyService->>KeyService: Derive key from passphrase (Argon2id)
        KeyService->>KeyService: Generated KEK = derived key
        KeyService->>KeyService: Generate nonce (24 bytes)
        KeyService->>KeyService: Encrypt KEK with passphrase key
        KeyService->>DB: Store encrypted_kek + salt + nonce
        DB-->>KeyService: Success
    end

    KeyService->>KeyService: Get/Create DEK
    alt DEK Exists
        KeyService->>DB: Fetch DEK record
        DB-->>KeyService: encrypted_dek + nonce
        KeyService->>KeyService: Decrypt DEK with KEK
    else New DEK
        KeyService->>KeyService: Generate DEK (32 random bytes)
        KeyService->>KeyService: Generate nonce (24 bytes)
        KeyService->>KeyService: Encrypt DEK with KEK
        KeyService->>DB: Store encrypted_dek + nonce
    end

    KeyService-->>UI: DEK (32 bytes)

    User->>UI: Upload Document
    UI->>EncService: encrypt_content(plaintext, DEK)
    EncService->>EncService: Generate nonce (24 bytes)
    EncService->>EncService: XChaCha20-Poly1305 encrypt
    EncService-->>UI: ciphertext (base64) + nonce (hex)
    UI->>DB: Store encrypted_text + nonce
    DB-->>UI: Success
\`\`\`

---

## Database Schema

\`\`\`mermaid
erDiagram
    USERS ||--o{ PROJECTS : creates
    PROJECTS ||--o{ DOCUMENTS : contains
    PROJECTS ||--o{ ENCRYPTION_KEYS : has
    DOCUMENTS ||--o{ DOCUMENT_CHUNKS : split_into
    DOCUMENT_CHUNKS ||--|| EMBEDDINGS : has
    DOCUMENTS ||--o{ CITATIONS : references

    USERS {
        uuid id PK
        string clerk_user_id UK "Clerk ID"
        string email
        timestamp created_at
        timestamp last_active
    }

    PROJECTS {
        uuid id PK
        uuid user_id FK "RLS"
        string name
        text description
        timestamp created_at
        timestamp updated_at
        jsonb metadata
    }

    DOCUMENTS {
        uuid id PK
        uuid project_id FK "RLS"
        string title
        text content_hash "SHA-256"
        float rank "PageRank score"
        timestamp created_at
        timestamp last_accessed
        float decay_factor "Time decay"
        jsonb metadata
    }

    DOCUMENT_CHUNKS {
        uuid id PK
        uuid document_id FK
        int chunk_index
        text text "Plaintext (deprecated)"
        text encrypted_text "Base64 ciphertext"
        string nonce "24-byte hex"
        int start_offset
        int end_offset
        timestamp created_at
    }

    EMBEDDINGS {
        uuid chunk_id PK_FK
        vector_384 embedding "pgvector"
        string model_name "sentence-transformers"
        timestamp created_at
    }

    ENCRYPTION_KEYS {
        uuid id PK
        uuid project_id FK
        string key_type "KEK or DEK"
        text encrypted_key "Base64"
        string nonce "24-byte hex"
        string salt "16-byte hex (KEK only)"
        timestamp created_at
        timestamp expires_at
    }

    CITATIONS {
        uuid id PK
        uuid source_doc_id FK
        uuid target_doc_id FK
        string citation_type
        text context
        timestamp created_at
    }
\`\`\`

### Row-Level Security (RLS) Policies

\`\`\`sql
-- Projects: Users can only access their own projects
CREATE POLICY projects_isolation ON projects
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- Documents: Users can only access documents in their projects
CREATE POLICY documents_isolation ON documents
  FOR ALL
  USING (project_id IN (
    SELECT id FROM projects
    WHERE user_id = current_setting('app.current_user_id')::uuid
  ));

-- Document Chunks: Inherit access from documents
CREATE POLICY chunks_isolation ON document_chunks
  FOR ALL
  USING (document_id IN (
    SELECT d.id FROM documents d
    JOIN projects p ON d.project_id = p.id
    WHERE p.user_id = current_setting('app.current_user_id')::uuid
  ));
\`\`\`

---

## API Architecture

\`\`\`mermaid
graph LR
    subgraph "API Endpoints"
        Health[GET /health]
        Projects[GET/POST /projects]
        Documents[GET/POST/DELETE /documents]
        Query[POST /query]
        Upload[POST /upload]
        Ranking[POST /compute-ranking]
    end

    subgraph "Middleware Stack"
        RateLimitMW[Rate Limit Middleware]
        AuthMW[Authentication Middleware]
        CORSMW[CORS Middleware]
        ErrorMW[Error Handler Middleware]
    end

    subgraph "Dependencies"
        DBSession[Database Session]
        RedisClient[Redis Client]
        KeySvc[Key Service]
        EncSvc[Encryption Service]
        EmbedSvc[Embedding Service]
    end

    Health --> RateLimitMW
    Projects --> RateLimitMW
    Documents --> RateLimitMW
    Query --> RateLimitMW
    Upload --> RateLimitMW
    Ranking --> RateLimitMW

    RateLimitMW --> AuthMW
    AuthMW --> CORSMW
    CORSMW --> ErrorMW

    ErrorMW --> DBSession
    ErrorMW --> RedisClient
    ErrorMW --> KeySvc
    ErrorMW --> EncSvc
    ErrorMW --> EmbedSvc

    style Health fill:#4caf50
    style Projects fill:#2196f3
    style Documents fill:#ff9800
    style Query fill:#9c27b0
    style Upload fill:#f44336
    style Ranking fill:#00bcd4
\`\`\`

### API Request Flow

\`\`\`mermaid
sequenceDiagram
    participant Client
    participant RateLimit as Rate Limiter
    participant Auth as Auth Middleware
    participant CORS
    participant Endpoint
    participant Service
    participant DB
    participant Redis

    Client->>RateLimit: HTTP Request
    RateLimit->>Redis: Check rate limit
    Redis-->>RateLimit: Allow/Deny

    alt Rate Limit Exceeded
        RateLimit-->>Client: 429 Too Many Requests
    else Within Limit
        RateLimit->>Auth: Forward Request
        Auth->>Auth: Verify JWT Token
        alt Invalid Token
            Auth-->>Client: 401 Unauthorized
        else Valid Token
            Auth->>CORS: Forward Request
            CORS->>CORS: Check Origin
            alt Invalid Origin
                CORS-->>Client: 403 Forbidden
            else Valid Origin
                CORS->>Endpoint: Forward Request
                Endpoint->>Service: Process Request
                Service->>DB: Query/Update
                DB-->>Service: Result
                Service->>Redis: Cache Result (if applicable)
                Service-->>Endpoint: Response Data
                Endpoint-->>Client: 200 OK + Data
            end
        end
    end
\`\`\`

---

## Component Architecture (Frontend)

\`\`\`mermaid
graph TB
    subgraph "App Router Structure"
        Root[app/layout.tsx<br/>Root Layout]
        Page[app/page.tsx<br/>Landing Page]
        Dashboard[app/dashboard/page.tsx]
        Ask[app/ask/page.tsx]
        Inbox[app/inbox/page.tsx]
        Graph[app/graph/page.tsx]
    end

    subgraph "Shared Components"
        NavBar[components/nav-bar.tsx<br/>Glassmorphic Navigation]
        ThemeToggle[components/enhanced-theme-toggle.tsx<br/>Animated Toggle]
        ModelSelector[components/model-selector.tsx<br/>AI Model Picker]
        ThemeProvider[components/theme-provider.tsx<br/>Theme Context]
    end

    subgraph "State Management"
        ProjectStore[lib/store/project.ts<br/>Zustand Store]
        ModelStore[lib/store/model.ts<br/>Zustand Store]
        QueryClient[lib/query-client.ts<br/>React Query]
    end

    subgraph "API Layer"
        APIClient[lib/api/client.ts<br/>Axios Instance]
        ProjectAPI[lib/api/projects.ts]
        DocumentAPI[lib/api/documents.ts]
        QueryAPI[lib/api/query.ts]
    end

    subgraph "Styling"
        GlobalCSS[app/globals.css<br/>Tailwind + Custom]
        GlassMorphism[Glassmorphism Utilities<br/>.glass, .glass-card]
        Animations[Animations<br/>float, pulse-glow]
    end

    Root --> Page
    Root --> Dashboard
    Root --> Ask
    Root --> Inbox
    Root --> Graph
    Root --> NavBar
    Root --> ThemeToggle
    Root --> ThemeProvider

    Dashboard --> ModelSelector
    Ask --> ModelSelector

    Page --> ProjectStore
    Dashboard --> ProjectStore
    Dashboard --> ModelStore
    Ask --> QueryClient

    APIClient --> ProjectAPI
    APIClient --> DocumentAPI
    APIClient --> QueryAPI

    ProjectAPI --> ProjectStore
    DocumentAPI --> ProjectStore
    QueryAPI --> QueryClient

    GlobalCSS --> GlassMorphism
    GlobalCSS --> Animations

    style Root fill:#61dafb
    style NavBar fill:#6bcf7f
    style ThemeToggle fill:#ffd93d
    style ModelSelector fill:#ff6b6b
    style ProjectStore fill:#9c27b0
    style APIClient fill:#ff9800
\`\`\`

---

## Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Runtime**: React 19
- **Language**: TypeScript 5.7
- **Styling**: Tailwind CSS 3.4 + Custom Glassmorphism
- **State**: Zustand 5.0 + TanStack React Query 5.90
- **Animation**: Framer Motion 12.23
- **Icons**: Lucide React 0.468
- **Auth**: Clerk Next.js 6.33
- **Forms**: React Hook Form 7.64 + Zod 3.25
- **HTTP**: Axios 1.12
- **Notifications**: Sonner 1.7

### Backend
- **Framework**: FastAPI 0.115
- **Language**: Python 3.13
- **ORM**: SQLAlchemy 2.0 (async)
- **Database**: PostgreSQL 16 + pgvector
- **Cache**: Redis (Upstash)
- **Jobs**: Arq 0.26
- **Auth**: Clerk (JWT verification)
- **Crypto**: PyNaCl 1.5 (XChaCha20-Poly1305)
- **Embeddings**: sentence-transformers 3.3
- **Testing**: Pytest 8.3 + Hypothesis 6.122

### Infrastructure
- **CDN**: Cloudflare Pages + Workers
- **API**: Google Cloud Run
- **Database**: Neon PostgreSQL (Serverless)
- **Cache**: Upstash Redis (Serverless)
- **Auth**: Clerk
- **CI/CD**: GitHub Actions
- **Containers**: Docker + GCR

### Development
- **Package Manager**: pnpm 10.17
- **Linting**: ESLint 9 + Prettier 3
- **Testing**: Vitest 2.1 + Playwright 1.56
- **Type Safety**: TypeScript + Python Type Hints

---

## Performance Characteristics

### Frontend
- **First Contentful Paint**: <1.2s
- **Time to Interactive**: <2.5s
- **Lighthouse Score**: 95+
- **Bundle Size**: ~200KB (gzipped)

### Backend
- **API Response**: <100ms (p95)
- **Query Latency**: <500ms (vector search)
- **Throughput**: 1000+ req/s (per instance)
- **Embedding Generation**: ~50ms per chunk

### Database
- **Query Latency**: <10ms (indexed queries)
- **Vector Search**: <100ms (384d, cosine)
- **Concurrent Connections**: 20 per worker
- **Auto-scaling**: 0.5-4 CU (Neon)

---

## Security Features

### Authentication
- **Method**: OAuth 2.0 + OIDC (Clerk)
- **Tokens**: JWT with RS256 signing
- **Session**: Secure HTTP-only cookies
- **MFA**: Optional TOTP/SMS

### Encryption
- **Algorithm**: XChaCha20-Poly1305 (AEAD)
- **Key Derivation**: Argon2id (time=3, mem=64MB)
- **Key Size**: 256-bit keys
- **Nonce**: 192-bit random (XChaCha20)

### Network
- **Transport**: TLS 1.3 only
- **CORS**: Strict origin validation
- **CSP**: Content Security Policy headers
- **Rate Limiting**: Per-IP and per-user limits

### Database
- **RLS**: Row-level security policies
- **Encryption**: AES-256 at rest (Neon)
- **Backups**: Automated daily backups
- **Auditing**: Comprehensive audit logs

---

## Scalability

### Horizontal Scaling
- **Frontend**: Cloudflare global edge network
- **API**: Cloud Run auto-scaling (1-10 instances)
- **Workers**: Cloud Run auto-scaling (1-5 instances)
- **Database**: Neon autoscaling (0.5-4 CU)

### Caching Strategy
- **CDN**: Cloudflare edge caching (static assets)
- **Redis**: Query results cache (TTL 5m)
- **Browser**: Service worker cache (offline support)

### Performance Optimization
- **Compression**: Brotli + Gzip
- **Code Splitting**: Dynamic imports
- **Image Optimization**: WebP + AVIF
- **Lazy Loading**: React Suspense + Intersection Observer

---

**Last Updated**: 2025-11-05
**Version**: 0.2.0
**Architecture Review**: Quarterly
