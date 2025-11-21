# 🚀 DEPLOYMENT CHECKLIST

## ✅ COMPLETED IN THIS SESSION:

### 1. **Branding** ✅
- Changed "ContextCache" → "thecontextcache™"
- Added TM disclaimer (not registered, no LLC)
- Logo clickable → home

### 2. **AI Model Simplification** ✅
- Removed complex dropdowns
- Simple choice: Smart (free) vs Custom

### 3. **Multi-Document Upload** ✅
- Can upload up to 3 docs at once
- Sequential processing with toasts

### 4. **Delete Project UI** ✅
- 3-dot menu on dashboard
- Confirmation dialog
- Cascading delete

### 5. **Pricing Page** ✅
- `/pricing` route created
- Free, Pro ($29/mo), Enterprise plans
- Stripe integration placeholders

### 6. **LLM Integration (Backend)** ✅
- New `/query/answer` endpoint
- Supports: Smart, OpenAI, Claude, Databricks, Ollama
- Smart mode = free extractive answers

---

## 🚧 REMAINING TASKS:

### **TASK 1: Update Ask Page (Frontend)**
**File**: `frontend/app/ask/page.tsx`
**Change**: Line 78, replace `api.query()` with `api.queryWithAnswer()`

```typescript
// OLD (line 78):
const response = await api.query(currentProject.id, userMessage.content, 5);

// NEW:
const response = await api.queryWithAnswer(currentProject.id, userMessage.content, {
  limit: 5,
  llmProvider: 'smart',
});

// Then use response.answer directly:
const assistantMessage: Message = {
  id: (Date.now() + 1).toString(),
  role: 'assistant',
  content: response.answer,
  sources: response.sources || [],
  timestamp: new Date(),
};
```

---

### **TASK 2: Fix Quads (Add Provenance)**
**Files**:
- `api/cc_core/models/fact.py` (add provenance_id)
- `api/cc_core/services/rag_cag_service.py` (link facts to provenance)

**Neon SQL Migration**:
```sql
-- Add provenance_id to facts table (4th element of quad)
ALTER TABLE facts 
ADD COLUMN IF NOT EXISTS provenance_id UUID REFERENCES provenance(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_facts_provenance ON facts(provenance_id);

-- Update existing facts to link to provenance (if needed)
-- This will be NULL for existing facts, which is fine
```

---

### **TASK 3: Improve Graph (3D Neural Net Animation)**
**File**: `frontend/app/graph/page.tsx`
**Current**: Uses Cytoscape (2D, single line)
**Needed**: 3D force-directed graph with animated connections

**Options**:
1. **Force-Graph (3D)**: https://github.com/vasturiano/3d-force-graph
   - React wrapper: `react-force-graph`
   - True 3D with WebGL
   
2. **React-Three-Fiber** (THREE.js wrapper)
   - Full control over 3D rendering
   - More complex but flexible

**Recommendation**: Use `react-force-graph-3d`

```bash
cd frontend
pnpm add react-force-graph-3d three
pnpm add -D @types/three
```

Then redesign `/graph` page to use 3D visualization.

---

### **TASK 4: Add Databricks Integration**
**Files**:
- `frontend/components/simple-model-selector.tsx` (add Databricks option)
- Backend already supports it via LLMService

**Frontend Change**:
```typescript
// In simple-model-selector.tsx, add:
const providers = [
  { value: 'smart', label: 'thecontextcache Smart (Free)' },
  { value: 'databricks', label: 'Databricks' },
  { value: 'custom', label: 'Custom Model' },
];
```

**User Settings**: Add fields for:
- Databricks API Key
- Databricks Base URL (workspace URL)
- Model endpoint name

---

## 📋 NEON DATABASE MIGRATIONS:

Run this SQL in your Neon console:

```sql
-- 1. Add provenance_id to facts (for quads)
ALTER TABLE facts 
ADD COLUMN IF NOT EXISTS provenance_id UUID REFERENCES provenance(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_facts_provenance ON facts(provenance_id);

-- 2. Verify all required tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'projects', 'documents', 'document_chunks', 'facts', 'entities', 'relations', 'provenance', 'audit_events', 'fact_scores');

-- 3. Check for any missing indexes
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_id);
CREATE INDEX IF NOT EXISTS idx_facts_object ON facts(object_id);
CREATE INDEX IF NOT EXISTS idx_entities_label ON entities(label);
CREATE INDEX IF NOT EXISTS idx_relations_predicate ON relations(predicate);

-- 4. Add any missing columns from previous migrations
-- (These should already exist from NEON_COMPLETE_SETUP.sql)
```

---

## 🎯 DEPLOYMENT STEPS:

### 1. **Deploy Backend to Cloud Run**
```bash
cd /Users/nd/Documents/contextcache
./deploy-backend-now.sh
```

**Wait**: ~5-10 minutes for build

### 2. **Push to GitHub**
```bash
git add -A
git commit -m "feat: complete LLM integration and UI improvements"
git push origin dev
git checkout main
git merge dev
git push origin main
git checkout dev
```

**Triggers**: GitHub Actions → Cloudflare Pages deployment

### 3. **Test on Production**
- Visit: https://thecontextcache.com
- Unlock session with master key
- Upload 1-2 documents
- Test Ask page (should show answers now)
- Test delete project
- Test pricing page

---

## 🐛 KNOWN ISSUES TO FIX:

### 1. **Document Upload 500 Errors**
**Cause**: Backend encoding issues or missing dependencies
**Solution**: Check Cloud Run logs after deployment

### 2. **Ask Page Still Shows "Sorry"**
**Cause**: Frontend still using old `api.query()` instead of `api.queryWithAnswer()`
**Solution**: Update line 78 in `frontend/app/ask/page.tsx` (see TASK 1 above)

### 3. **Graph Shows Single Line**
**Cause**: Cytoscape layout not configured for neural net visualization
**Solution**: Replace with 3D force-graph library (see TASK 3 above)

---

## 💰 PAYMENT GATEWAY INTEGRATION (FUTURE):

When ready to enable paid plans:

### Stripe Setup:
1. Create Stripe account
2. Get API keys (publishable + secret)
3. Add webhook endpoint: `https://contextcache-api-[...].run.app/webhooks/stripe`

### Backend Changes:
```python
# New endpoint in api/main.py
@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # Handle subscription.created, subscription.updated, subscription.deleted
    # Update user tier in database
    pass

@app.post("/create-checkout-session")
async def create_checkout_session(
    price_id: str,  # Stripe price ID for Pro plan
    current_user: dict = Depends(get_current_user)
):
    # Create Stripe checkout session
    # Redirect user to Stripe hosted page
    pass
```

### Frontend Changes:
```typescript
// In pricing/page.tsx, replace alert() with:
const response = await api.createCheckoutSession('price_xxx');
window.location.href = response.checkout_url;
```

---

## 📊 PRICING PLANS (FINALIZED):

| Plan | Price | Projects | Documents | Facts | AI Models | Databricks | API |
|------|-------|----------|-----------|-------|-----------|------------|-----|
| **Free** | $0 | 1 | 100 | 10,000 | Smart only | ❌ | ❌ |
| **Pro** | $29/mo | Unlimited | Unlimited | Unlimited | All | ✅ | ✅ |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | All + Custom training | ✅ Dedicated | ✅ |

---

## 🧠 YOUR ARCHITECTURE (CLARIFIED):

### **Current Flow**:
1. **Document Upload** → Extract text → Chunk → Embed (HuggingFace) → Store
2. **Fact Extraction** → NER (spaCy) → Extract triples → Store in facts/entities/relations
3. **Query** → Embed query → Semantic search → Retrieve top chunks
4. **Answer (NEW)** → LLM reads chunks → Generate human answer

### **What's AI vs Not AI**:
- **AI (Neural Networks)**:
  - Embeddings (HuggingFace Sentence Transformers)
  - LLM answer generation (GPT-4, Claude, Databricks)
  - NER for fact extraction (spaCy)

- **NOT AI (Algorithms)**:
  - BM25 keyword matching
  - PageRank graph scoring
  - Time decay calculations
  - Hybrid ranking combination

### **Quads (RDF Standard)**:
- **Before**: (subject, predicate, object) = **Triple**
- **After**: (subject, predicate, object, **provenance**) = **Quad**
- **Provenance** = which document/chunk the fact came from

---

## ✅ CHECKLIST BEFORE GOING LIVE:

- [ ] Run Neon SQL migrations (provenance_id)
- [ ] Update Ask page to use `queryWithAnswer()`
- [ ] Deploy backend to Cloud Run
- [ ] Test document upload (should work now)
- [ ] Test Ask page (should show real answers)
- [ ] Test delete project
- [ ] Test pricing page
- [ ] Merge dev → main
- [ ] Monitor Cloud Run logs for errors
- [ ] Test on mobile (responsive design)
- [ ] Add Databricks provider option (optional)
- [ ] Improve graph to 3D (optional, can be later)

---

**READY TO DEPLOY!** 🚀

Run: `./deploy-backend-now.sh` then push to GitHub.

