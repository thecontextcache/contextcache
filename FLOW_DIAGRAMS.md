# ContextCache Flow Diagrams

This document contains detailed flow diagrams for all major user flows and system processes in ContextCache.

## Table of Contents
1. [User Registration & Project Creation](#user-registration--project-creation)
2. [Document Upload Flow](#document-upload-flow)
3. [Query/Search Flow](#querysearch-flow)
4. [Encryption/Decryption Flow](#encryptiondecryption-flow)
5. [Background Job Processing](#background-job-processing)
6. [Authentication Flow (Detailed)](#authentication-flow-detailed)
7. [Deployment Flow](#deployment-flow)
8. [Error Handling Flow](#error-handling-flow)

---

## User Registration & Project Creation

\`\`\`mermaid
flowchart TD
    Start([User visits ContextCache]) --> CheckAuth{Authenticated?}
    CheckAuth -->|No| ShowLanding[Show Landing Page]
    ShowLanding --> ClickSignUp[Click 'Sign Up']
    ClickSignUp --> ClerkModal[Clerk Sign Up Modal]
    ClerkModal --> EnterDetails[Enter Email + Password]
    EnterDetails --> ClerkVerify{Clerk Verifies}

    ClerkVerify -->|Invalid| ShowError[Show Error Message]
    ShowError --> EnterDetails

    ClerkVerify -->|Valid| CreateClerkUser[Clerk Creates User]
    CreateClerkUser --> SendWebhook[Clerk Webhook to Backend]
    SendWebhook --> CreateDBUser[Create User in PostgreSQL]
    CreateDBUser --> SetCookie[Set Session Cookie]
    SetCookie --> RedirectDashboard[Redirect to /dashboard]

    CheckAuth -->|Yes| RedirectDashboard
    RedirectDashboard --> LoadProjects{Has Projects?}

    LoadProjects -->|No| ShowCreateProject[Show 'Create Project' UI]
    ShowCreateProject --> EnterProjectName[Enter Project Name]
    EnterProjectName --> EnterPassphrase[Enter Master Passphrase]
    EnterPassphrase --> ValidatePassphrase{Valid Passphrase?}

    ValidatePassphrase -->|Too Short| ShowPassphraseError[Show Error: Min 20 chars]
    ShowPassphraseError --> EnterPassphrase

    ValidatePassphrase -->|Valid| SubmitProject[Submit Create Project]
    SubmitProject --> GenerateKEK[Generate KEK via Argon2id]
    GenerateKEK --> EncryptKEK[Encrypt KEK with Passphrase]
    EncryptKEK --> StoreKEK[Store Encrypted KEK in DB]
    StoreKEK --> CreateProject[Create Project Record]
    CreateProject --> SetCurrentProject[Set Current Project]
    SetCurrentProject --> ShowDashboard[Show Dashboard]

    LoadProjects -->|Yes| ShowProjects[Show Project List]
    ShowProjects --> SelectProject[User Selects Project]
    SelectProject --> RequestPassphrase[Request Passphrase]
    RequestPassphrase --> EnterUnlockPass[Enter Passphrase]
    EnterUnlockPass --> VerifyPassphrase{Verify Passphrase}

    VerifyPassphrase -->|Incorrect| ShowWrongPass[Show Error: Wrong Passphrase]
    ShowWrongPass --> EnterUnlockPass

    VerifyPassphrase -->|Correct| DecryptKEK[Decrypt KEK]
    DecryptKEK --> LoadDEK[Load/Generate DEK]
    LoadDEK --> SetCurrentProject
\`\`\`

---

## Document Upload Flow

\`\`\`mermaid
flowchart TD
    Start([User in Inbox]) --> ClickUpload[Click 'Upload Document']
    ClickUpload --> SelectFile[Select File from Device]
    SelectFile --> ValidateFile{Valid File?}

    ValidateFile -->|No| ShowFileError[Show Error: Unsupported Type]
    ShowFileError --> SelectFile

    ValidateFile -->|Yes| ShowProgress[Show Upload Progress]
    ShowProgress --> ReadFile[Read File Content]
    ReadFile --> ExtractMetadata[Extract Metadata<br/>Title, Created Date, etc.]
    ExtractMetadata --> ComputeHash[Compute SHA-256 Hash]
    ComputeHash --> CheckDuplicate{Duplicate?}

    CheckDuplicate -->|Yes| ShowDupWarning[Show Warning: File Exists]
    ShowDupWarning --> ChooseAction{User Action}
    ChooseAction -->|Cancel| End([Upload Cancelled])
    ChooseAction -->|Replace| DeleteOld[Delete Old Version]
    DeleteOld --> ProcessDoc

    CheckDuplicate -->|No| ProcessDoc[Process Document]

    ProcessDoc --> ChunkDoc[Split into Chunks<br/>Max 512 tokens<br/>Overlap 50 chars]
    ChunkDoc --> EncryptChunks[Encrypt Each Chunk]

    EncryptChunks --> GetDEK[Get DEK from Session]
    GetDEK --> ForEachChunk{For Each Chunk}

    ForEachChunk --> GenNonce[Generate Random Nonce<br/>24 bytes]
    GenNonce --> XChaChaEncrypt[XChaCha20-Poly1305 Encrypt]
    XChaChaEncrypt --> EncodeBase64[Encode to Base64]
    EncodeBase64 --> StoreEncChunk[Store encrypted_text + nonce]

    StoreEncChunk --> GenEmbedding[Generate Embedding<br/>sentence-transformers]
    GenEmbedding --> StoreEmbedding[Store Vector<br/>384 dimensions]

    StoreEmbedding --> NextChunk{More Chunks?}
    NextChunk -->|Yes| ForEachChunk
    NextChunk -->|No| CreateDocRecord[Create Document Record]

    CreateDocRecord --> EnqueueJobs[Enqueue Background Jobs]
    EnqueueJobs --> RankJob[Job: Compute PageRank]
    EnqueueJobs --> IndexJob[Job: Update Search Index]

    RankJob --> RedisQueue1[Add to Redis Queue]
    IndexJob --> RedisQueue2[Add to Redis Queue]

    RedisQueue1 --> ShowSuccess[Show Success Message]
    RedisQueue2 --> ShowSuccess
    ShowSuccess --> RefreshInbox[Refresh Document List]
    RefreshInbox --> End2([Upload Complete])

    style Start fill:#4caf50
    style End fill:#f44336
    style End2 fill:#4caf50
    style EncryptChunks fill:#ff6b6b
    style GenEmbedding fill:#2196f3
\`\`\`

---

## Query/Search Flow

\`\`\`mermaid
flowchart TD
    Start([User in Ask Page]) --> EnterQuery[Enter Query Text]
    EnterQuery --> SelectModel{Select AI Model}

    SelectModel -->|Vector Similarity| UseVector[Use Vector Search Only]
    SelectModel -->|Hybrid Ranking| UseHybrid[Use BM25 + Vector + PageRank]
    SelectModel -->|Neural Reranker| UseNeural[Use Cross-Encoder Rerank]

    UseVector --> GenQueryEmbed[Generate Query Embedding]
    UseHybrid --> GenQueryEmbed
    UseNeural --> GenQueryEmbed

    GenQueryEmbed --> SentenceTransform[sentence-transformers<br/>all-MiniLM-L6-v2]
    SentenceTransform --> QueryVector[Query Vector<br/>384 dimensions]

    QueryVector --> SearchDB{Search Strategy}

    SearchDB -->|Vector Only| VectorSearch[pgvector Cosine Search<br/>SELECT * FROM chunks<br/>ORDER BY embedding <=> query<br/>LIMIT 20]
    SearchDB -->|Hybrid| HybridSearch[Combined Search<br/>BM25 + Vector + PageRank]
    SearchDB -->|Neural| VectorSearch

    VectorSearch --> GetResults[Get Top K Results]

    HybridSearch --> BM25Score[Compute BM25 Scores<br/>Term Frequency + IDF]
    BM25Score --> VectorScore[Compute Vector Scores<br/>Cosine Similarity]
    VectorScore --> PageRankScore[Get PageRank Scores<br/>From Document Table]
    PageRankScore --> TimeDecay[Apply Time Decay<br/>exp(-λ * days_old)]
    TimeDecay --> CombineScores[Combine Scores<br/>α*BM25 + β*Vector + γ*PageRank + δ*Decay]
    CombineScores --> SortResults[Sort by Final Score]
    SortResults --> GetResults

    GetResults --> CheckNeural{Neural Rerank?}

    CheckNeural -->|Yes| LoadReranker[Load Cross-Encoder Model<br/>ms-marco-MiniLM-L-6-v2]
    LoadReranker --> RerankLoop{For Each Result}
    RerankLoop --> ComputeRerank[Compute Relevance Score<br/>query + passage]
    ComputeRerank --> NextResult{More Results?}
    NextResult -->|Yes| RerankLoop
    NextResult -->|No| ResortReranked[Resort by Rerank Score]
    ResortReranked --> TopN

    CheckNeural -->|No| TopN[Take Top N Results<br/>Default: 5]

    TopN --> FetchChunks[Fetch Full Chunks from DB]
    FetchChunks --> DecryptLoop{For Each Chunk}

    DecryptLoop --> GetDEK[Get DEK from Session]
    GetDEK --> DecryptChunk[Decrypt Chunk<br/>XChaCha20-Poly1305]
    DecryptChunk --> DecodePlaintext[Decode Plaintext]
    DecodePlaintext --> NextChunk{More Chunks?}
    NextChunk -->|Yes| DecryptLoop
    NextChunk -->|No| FormatResponse[Format Response]

    FormatResponse --> AddMetadata[Add Metadata<br/>Source Document<br/>Relevance Score<br/>Timestamp]
    AddMetadata --> GenerateCitations[Generate Citations<br/>Extract Context]
    GenerateCitations --> ReturnResults[Return Results to User]

    ReturnResults --> DisplayResults[Display in UI<br/>Source Attribution<br/>Relevance Scores]
    DisplayResults --> UpdateUsage[Update Usage Stats<br/>Last Accessed Time]
    UpdateUsage --> End([Query Complete])

    style Start fill:#9c27b0
    style End fill:#4caf50
    style DecryptChunk fill:#ff6b6b
    style GenQueryEmbed fill:#2196f3
    style HybridSearch fill:#ffd93d
\`\`\`

---

## Encryption/Decryption Flow

\`\`\`mermaid
flowchart TD
    subgraph "Encryption Flow"
        E1([Start: Encrypt Document]) --> E2[Get/Create DEK]
        E2 --> E3{DEK Exists?}

        E3 -->|No| E4[Generate Random 32 bytes]
        E4 --> E5[Generate KEK if Needed]
        E5 --> E6[Encrypt DEK with KEK]
        E6 --> E7[Store Encrypted DEK]
        E7 --> E8[Use DEK]

        E3 -->|Yes| E9[Fetch Encrypted DEK]
        E9 --> E10[Decrypt DEK with KEK]
        E10 --> E8

        E8 --> E11[Generate Random Nonce<br/>24 bytes for XChaCha20]
        E11 --> E12[Initialize XChaCha20-Poly1305]
        E12 --> E13[Encrypt Plaintext]
        E13 --> E14[Get Ciphertext + MAC Tag]
        E14 --> E15[Encode Ciphertext to Base64]
        E15 --> E16[Encode Nonce to Hex]
        E16 --> E17([Return: encrypted_text, nonce])
    end

    subgraph "Decryption Flow"
        D1([Start: Decrypt Chunk]) --> D2[Get encrypted_text + nonce]
        D2 --> D3[Decode Base64 to Bytes]
        D3 --> D4[Decode Hex Nonce to Bytes]
        D4 --> D5[Get DEK from Session]
        D5 --> D6{DEK in Memory?}

        D6 -->|No| D7[Fetch Encrypted DEK]
        D7 --> D8[Get KEK from Passphrase]
        D8 --> D9[Decrypt DEK with KEK]
        D9 --> D10[Cache DEK in Memory]
        D10 --> D11[Use DEK]

        D6 -->|Yes| D11

        D11 --> D12[Initialize XChaCha20-Poly1305]
        D12 --> D13[Decrypt Ciphertext]
        D13 --> D14{MAC Valid?}

        D14 -->|No| D15[Throw: Authentication Failed]
        D15 --> D16([Error: Tampering Detected])

        D14 -->|Yes| D17[Get Plaintext]
        D17 --> D18[Decode UTF-8]
        D18 --> D19([Return: Plaintext])
    end

    subgraph "KEK Derivation (Argon2id)"
        K1([Start: Create KEK]) --> K2[User Enters Passphrase]
        K2 --> K3[Generate Random Salt<br/>16 bytes]
        K3 --> K4[Set Argon2id Parameters<br/>time=3<br/>memory=65536 KB<br/>parallelism=4]
        K4 --> K5[Derive 32-byte Key]
        K5 --> K6[KEK = Derived Key]
        K6 --> K7[Encrypt KEK with Passphrase]
        K7 --> K8[Store: encrypted_kek, salt, nonce]
        K8 --> K9([KEK Created])
    end

    style E1 fill:#4caf50
    style E17 fill:#4caf50
    style D1 fill:#2196f3
    style D19 fill:#4caf50
    style D16 fill:#f44336
    style K1 fill:#ffd93d
    style K9 fill:#ffd93d
\`\`\`

---

## Background Job Processing

\`\`\`mermaid
flowchart TD
    Start([Job Enqueued to Redis]) --> WorkerPoll[Arq Worker Polls Queue]
    WorkerPoll --> DequeueJob[Dequeue Job]
    DequeueJob --> JobType{Job Type?}

    JobType -->|PageRank| PR1[PageRank Job]
    JobType -->|Time Decay| TD1[Time Decay Job]
    JobType -->|Document Process| DP1[Document Processing]

    subgraph "PageRank Computation"
        PR1 --> PR2[Fetch All Documents in Project]
        PR2 --> PR3[Build Citation Graph<br/>Source → Target Links]
        PR3 --> PR4[Initialize Ranks<br/>rank = 1/N for all docs]
        PR4 --> PR5[Iterate: max 100 iterations]

        PR5 --> PR6{For Each Document}
        PR6 --> PR7[Sum Incoming Link Ranks<br/>rank_sum = Σ(rank_j / out_degree_j)]
        PR7 --> PR8[Apply Damping Factor<br/>new_rank = (1-d)/N + d*rank_sum<br/>d = 0.85]
        PR8 --> PR9[Update Document Rank]
        PR9 --> PR10{More Docs?}
        PR10 -->|Yes| PR6
        PR10 -->|No| PR11[Check Convergence<br/>|new - old| < tolerance]

        PR11 --> PR12{Converged?}
        PR12 -->|No| PR13{Max Iterations?}
        PR13 -->|No| PR5
        PR13 -->|Yes| PR14[Save Final Ranks to DB]

        PR12 -->|Yes| PR14
        PR14 --> JobComplete
    end

    subgraph "Time Decay Update"
        TD1 --> TD2[Fetch All Documents]
        TD2 --> TD3{For Each Document}
        TD3 --> TD4[Get created_at Timestamp]
        TD4 --> TD5[Calculate Days Old<br/>days = now - created_at]
        TD5 --> TD6[Compute Decay Factor<br/>decay = exp(-λ * days)<br/>λ = ln(2)/90 for 90-day half-life]
        TD6 --> TD7[Update decay_factor Column]
        TD7 --> TD8{More Docs?}
        TD8 -->|Yes| TD3
        TD8 -->|No| TD9[Commit Transaction]
        TD9 --> JobComplete
    end

    subgraph "Document Processing"
        DP1 --> DP2[Fetch Document ID from Job]
        DP2 --> DP3[Load Document Content]
        DP3 --> DP4[Chunk Document<br/>If Not Already Chunked]
        DP4 --> DP5[Generate Embeddings<br/>For New Chunks]
        DP5 --> DP6[Update Search Index]
        DP6 --> DP7[Extract Citations<br/>Parse Markdown Links]
        DP7 --> DP8[Create Citation Records]
        DP8 --> DP9[Update Graph Structure]
        DP9 --> JobComplete
    end

    JobComplete[Mark Job Complete] --> UpdateRedis[Update Redis Job Status]
    UpdateRedis --> LogMetrics[Log Job Metrics<br/>Duration, Success/Fail]
    LogMetrics --> CheckRetry{Job Failed?}

    CheckRetry -->|Yes| RetryCount{Retry Count < Max?}
    RetryCount -->|Yes| Requeue[Requeue Job<br/>Exponential Backoff]
    RetryCount -->|No| SendAlert[Send Failure Alert]
    SendAlert --> End([Job Failed])

    CheckRetry -->|No| End2([Job Complete])

    Requeue --> End3([Job Requeued])

    style Start fill:#ff9800
    style End2 fill:#4caf50
    style End fill:#f44336
    style End3 fill:#ffd93d
\`\`\`

---

## Authentication Flow (Detailed)

\`\`\`mermaid
sequenceDiagram
    actor User
    participant Browser
    participant CF as Cloudflare Workers
    participant Next as Next.js SSR
    participant Middleware as Clerk Middleware
    participant Clerk as Clerk API
    participant API as FastAPI Backend
    participant DB as PostgreSQL

    User->>Browser: Click "Sign In"
    Browser->>CF: GET /sign-in
    CF->>Next: Route Request
    Next->>Next: Check Session Cookie
    Next-->>Browser: Render Sign In Page

    User->>Browser: Enter Email + Password
    Browser->>Clerk: POST /v1/client/sign_ins
    Clerk->>Clerk: Verify Credentials
    alt Invalid Credentials
        Clerk-->>Browser: 401 Unauthorized
        Browser-->>User: Show Error
    else Valid Credentials
        Clerk->>Clerk: Create Session
        Clerk->>Clerk: Generate JWT Token
        Clerk-->>Browser: Set Cookie: __session={jwt}
        Browser->>CF: GET /dashboard
        CF->>Next: Route Request
        Next->>Middleware: Check Auth
        Middleware->>Middleware: Parse __session Cookie
        Middleware->>Clerk: GET /v1/jwks (verify signature)
        Clerk-->>Middleware: Public Key
        Middleware->>Middleware: Verify JWT Signature
        Middleware->>Middleware: Check Expiration
        Middleware->>Middleware: Extract Claims (user_id, email, etc.)
        Middleware-->>Next: Auth Context
        Next->>Next: Render Dashboard
        Next-->>Browser: HTML + Protected Content

        User->>Browser: Click "Upload Document"
        Browser->>CF: POST /api/documents
        CF->>Next: Route API Request
        Next->>Middleware: Check Auth
        Middleware->>Middleware: Extract JWT from Cookie
        Middleware->>Clerk: Verify JWT
        Clerk-->>Middleware: Token Valid
        Middleware->>API: Forward Request + JWT
        API->>API: Verify JWT Signature
        API->>API: Extract user_id
        API->>DB: SET app.current_user_id = user_id
        DB-->>API: OK
        API->>DB: INSERT Document (RLS enforced)
        DB-->>API: Document Created
        API-->>Next: 201 Created
        Next-->>Browser: Success
        Browser-->>User: "Document Uploaded"
    end

    Note over User,DB: Session expires after 7 days<br/>JWT refresh happens automatically<br/>Clerk handles session rotation
\`\`\`

---

## Deployment Flow

\`\`\`mermaid
flowchart TD
    Start([Developer Commits Code]) --> Push[git push origin main]
    Push --> GitHubActions[GitHub Actions Triggered]

    GitHubActions --> FrontendJob{Frontend Changes?}
    GitHubActions --> BackendJob{Backend Changes?}

    subgraph "Frontend Deployment"
        FrontendJob -->|Yes| FE1[Checkout Code]
        FE1 --> FE2[Setup Node.js 20]
        FE2 --> FE3[Install pnpm]
        FE3 --> FE4[pnpm install]
        FE4 --> FE5[Run Tests<br/>pnpm test]
        FE5 --> FE6{Tests Pass?}

        FE6 -->|No| FE7[Fail Build]
        FE7 --> NotifyFailFE[Create GitHub Issue]
        NotifyFailFE --> EndFE1([Deploy Failed])

        FE6 -->|Yes| FE8[next build]
        FE8 --> FE9[@cloudflare/next-on-pages]
        FE9 --> FE10[Generate .vercel/output/static]
        FE10 --> FE11[Deploy to Cloudflare Pages]
        FE11 --> FE12[Deploy to Cloudflare Workers]
        FE12 --> FE13[Verify Deployment]
        FE13 --> FE14{Verification Pass?}

        FE14 -->|No| FE15[Rollback Deployment]
        FE15 --> NotifyFailFE

        FE14 -->|Yes| FE16[Run Smoke Tests<br/>Playwright]
        FE16 --> FE17{Smoke Tests Pass?}

        FE17 -->|No| FE15
        FE17 -->|Yes| FE18[Update Deployment Status]
        FE18 --> EndFE2([Frontend Deployed ✓])
    end

    subgraph "Backend Deployment"
        BackendJob -->|Yes| BE1[Detect Tag v*.*.*]
        BE1 --> BE2{Valid Tag?}

        BE2 -->|No| EndBE1([Skip Backend Deploy])

        BE2 -->|Yes| BE3[Checkout Code]
        BE3 --> BE4[Setup Python 3.13]
        BE4 --> BE5[Install Dependencies]
        BE5 --> BE6[Run Tests<br/>pytest]
        BE6 --> BE7{Tests Pass?}

        BE7 -->|No| BE8[Fail Build]
        BE8 --> NotifyFailBE[Create GitHub Issue]
        NotifyFailBE --> EndBE2([Deploy Failed])

        BE7 -->|Yes| BE9[Authenticate to GCP]
        BE9 --> BE10[Build Docker Images]
        BE10 --> BE11[Tag: API Image]
        BE10 --> BE12[Tag: Worker Image]
        BE11 --> BE13[Push to GCR]
        BE12 --> BE13
        BE13 --> BE14[Deploy API to Cloud Run]
        BE13 --> BE15[Deploy Worker to Cloud Run]

        BE14 --> BE16[Update Traffic 100% to New]
        BE15 --> BE16

        BE16 --> BE17[Run Database Migration]
        BE17 --> BE18[Execute: alembic upgrade head]
        BE18 --> BE19{Migration Success?}

        BE19 -->|No| BE20[Rollback Cloud Run]
        BE20 --> NotifyFailBE

        BE19 -->|Yes| BE21[Health Check API]
        BE21 --> BE22{Health OK?}

        BE22 -->|No| BE20

        BE22 -->|Yes| BE23[Run Smoke Tests]
        BE23 --> BE24{Smoke Tests Pass?}

        BE24 -->|No| BE20

        BE24 -->|Yes| BE25[Update Deployment Status]
        BE25 --> EndBE3([Backend Deployed ✓])
    end

    EndFE2 --> Final{Both Deployed?}
    EndBE3 --> Final
    Final -->|Yes| Success([Deployment Complete 🎉])
    Final -->|No| Partial([Partial Deployment])

    EndFE1 --> FailureFinal([Deployment Failed])
    EndBE2 --> FailureFinal

    style Start fill:#4caf50
    style Success fill:#4caf50
    style FailureFinal fill:#f44336
    style FE11 fill:#f4b400
    style BE14 fill:#34a853
\`\`\`

---

## Error Handling Flow

\`\`\`mermaid
flowchart TD
    Start([Error Occurs]) --> ErrorType{Error Type?}

    ErrorType -->|Network Error| NE1[Network Error Handler]
    ErrorType -->|Authentication Error| AE1[Auth Error Handler]
    ErrorType -->|Validation Error| VE1[Validation Error Handler]
    ErrorType -->|Database Error| DE1[Database Error Handler]
    ErrorType -->|Encryption Error| EE1[Encryption Error Handler]
    ErrorType -->|Unknown Error| UE1[Unknown Error Handler]

    subgraph "Network Error Handling"
        NE1 --> NE2{Retry Eligible?}
        NE2 -->|Yes| NE3[Exponential Backoff]
        NE3 --> NE4[Retry Count < 3?]
        NE4 -->|Yes| NE5[Wait: 2^retry * 1000ms]
        NE5 --> NE6[Retry Request]
        NE6 --> NE7{Success?}
        NE7 -->|Yes| Success1([Request Successful])
        NE7 -->|No| NE4

        NE4 -->|No| NE8[Log Error]
        NE8 --> NE9[Show User Error:<br/>'Network connection failed']
        NE9 --> NE10[Offer Retry Button]
        NE10 --> End1([Error Handled])

        NE2 -->|No| NE8
    end

    subgraph "Authentication Error Handling"
        AE1 --> AE2{Error Code?}
        AE2 -->|401 Unauthorized| AE3[Clear Session]
        AE3 --> AE4[Redirect to Sign In]
        AE4 --> AE5[Show: 'Session expired']
        AE5 --> End2([User Redirected])

        AE2 -->|403 Forbidden| AE6[Log Forbidden Access]
        AE6 --> AE7[Show: 'Access denied']
        AE7 --> AE8[Redirect to Dashboard]
        AE8 --> End2

        AE2 -->|Other| AE9[Log Error]
        AE9 --> AE10[Show Generic Auth Error]
        AE10 --> End2
    end

    subgraph "Validation Error Handling"
        VE1 --> VE2[Parse Validation Errors]
        VE2 --> VE3{Multiple Errors?}
        VE3 -->|Yes| VE4[Show All Field Errors]
        VE3 -->|No| VE5[Show Single Error]

        VE4 --> VE6[Highlight Invalid Fields]
        VE5 --> VE6
        VE6 --> VE7[Focus First Invalid Field]
        VE7 --> VE8[Log Validation Error]
        VE8 --> End3([User Corrects Input])
    end

    subgraph "Database Error Handling"
        DE1 --> DE2{Error Type?}
        DE2 -->|Connection Lost| DE3[Retry Connection]
        DE3 --> DE4{Reconnect Success?}
        DE4 -->|Yes| DE5[Retry Query]
        DE5 --> Success2([Query Successful])

        DE4 -->|No| DE6[Log Critical Error]
        DE6 --> DE7[Alert DevOps Team]
        DE7 --> DE8[Show: 'Database unavailable']
        DE8 --> End4([Escalate to Ops])

        DE2 -->|Unique Constraint| DE9[Log Constraint Violation]
        DE9 --> DE10[Show: 'Duplicate entry']
        DE10 --> End5([User Notified])

        DE2 -->|Query Timeout| DE11[Log Slow Query]
        DE11 --> DE12[Optimize Query<br/>(for next deployment)]
        DE12 --> DE13[Show: 'Request taking longer<br/>than expected']
        DE13 --> DE14[Offer Cancel Button]
        DE14 --> End6([User Waits/Cancels])

        DE2 -->|Other| DE15[Log Error]
        DE15 --> DE16[Show Generic DB Error]
        DE16 --> End7([Error Logged])
    end

    subgraph "Encryption Error Handling"
        EE1 --> EE2{Error Type?}
        EE2 -->|Wrong Passphrase| EE3[Increment Attempt Counter]
        EE3 --> EE4{Attempts > 3?}
        EE4 -->|Yes| EE5[Lock Project for 15min]
        EE5 --> EE6[Show: 'Too many attempts']
        EE6 --> End8([Project Locked])

        EE4 -->|No| EE7[Show: 'Incorrect passphrase']
        EE7 --> EE8[Clear Passphrase Field]
        EE8 --> EE9[Remain Attempts: X]
        EE9 --> End9([User Retries])

        EE2 -->|MAC Verification Failed| EE10[Log Security Event]
        EE10 --> EE11[Data Tampered!]
        EE11 --> EE12[Alert Security Team]
        EE12 --> EE13[Show: 'Data integrity check failed']
        EE13 --> EE14[Prevent Decryption]
        EE14 --> End10([Security Incident])

        EE2 -->|Other| EE15[Log Crypto Error]
        EE15 --> EE16[Show: 'Encryption error']
        EE16 --> End11([Error Logged])
    end

    subgraph "Unknown Error Handling"
        UE1 --> UE2[Capture Error Stack]
        UE2 --> UE3[Log to Monitoring<br/>(Sentry/CloudWatch)]
        UE3 --> UE4[Generate Error ID]
        UE4 --> UE5[Show: 'Unexpected error<br/>Error ID: {id}']
        UE5 --> UE6[Offer 'Report Bug' Button]
        UE6 --> UE7{User Reports?}
        UE7 -->|Yes| UE8[Send Error Report]
        UE8 --> UE9[Create GitHub Issue]
        UE9 --> End12([Issue Created])
        UE7 -->|No| End13([Error Logged])
    end

    style Start fill:#f44336
    style Success1 fill:#4caf50
    style Success2 fill:#4caf50
    style End10 fill:#ff6b6b
    style EE11 fill:#ff6b6b
\`\`\`

---

**Last Updated**: 2025-11-05
**Version**: 0.2.0
