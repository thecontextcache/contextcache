# ContextCache

**Privacy-First AI Knowledge Management**

ContextCache is a proprietary knowledge management system that combines end-to-end encryption with advanced AI retrieval capabilities.

## Features

- 🔐 **End-to-End Encryption**: Your data is encrypted with your master key
- 🤖 **RAG + CAG**: Retrieval-Augmented Generation + Context-Augmented Generation
- 🔍 **Hybrid Search**: Combines BM25 keyword matching with semantic embeddings
- 📊 **Knowledge Graphs**: Automatic fact extraction and relationship mapping
- 🎯 **Personalization**: Context-aware results based on user tier and region

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, Cloudflare Pages
- **Backend**: FastAPI (Python), Google Cloud Run
- **Database**: PostgreSQL with pgvector (Neon)
- **Cache**: Redis (Upstash)
- **Auth**: Clerk
- **AI**: HuggingFace Sentence Transformers, Ollama, OpenAI (configurable)

## Security

- XChaCha20-Poly1305 encryption
- Argon2id key derivation
- Zero-knowledge architecture
- Master key never leaves your device

## License

This software is proprietary. See [LICENSE](LICENSE) for details.

## Support

- **Developer**: dn@thecontextcache.com
- **Support**: support@thecontextcache.com

## Website

https://thecontextcache.com

---

© 2025 ContextCache. All rights reserved.
