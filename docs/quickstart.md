---
title: Quick Start
description: "Get thecontextcache running locally in 5 minutes"
---

# Quick Start Guide

Get thecontextcache running on your machine in under 5 minutes.

## Prerequisites

<AccordionGroup>
  <Accordion title="Required Software">
    - **Docker Desktop**: Latest version (supports Apple Silicon)
    - **Git**: 2.40+
    - **4GB RAM**: Minimum for local development
    - **5GB Disk Space**: For Docker images and data
  </Accordion>
  <Accordion title="Optional (for development)">
    - **Python**: 3.13+ (if running API outside Docker)
    - **Node.js**: 20 LTS (if running frontend outside Docker)
    - **pnpm**: 10+ (package manager)
  </Accordion>
</AccordionGroup>

## Installation

<Steps>
  <Step title="Clone the Repository">
```bash
    git clone https://github.com/thecontextcache/contextcache.git
    cd contextcache
  </Step>
  <Step title="Configure Environment">
```bash
    # Copy environment template
    cp .env.example .env.local
# Edit .env.local with your preferences (optional for local dev)
# Default values work out of the box

    <Tip>
      The default configuration uses local Postgres and Redis. No external services required!
    </Tip>
  </Step>

  <Step title="Start Services">
```bash
    # Start all services (Postgres, Redis, API, Worker, Frontend)
    docker-compose -f infra/docker-compose.dev.yml up -d

    # Check logs
    docker-compose -f infra/docker-compose.dev.yml logs -f
<Info>
  First run will take 2-3 minutes to build images and initialize the database.
</Info>
  </Step>
  <Step title="Verify Installation">
    Open your browser and navigate to:
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)
  </Step>
</Steps>
First Steps
1. Create Your First Project
<Steps>
  <Step title="Open the Dashboard">
    Navigate to [http://localhost:3000](http://localhost:3000)
  </Step>
  <Step title="Create Project">
    Click **"New Project"** and enter:
    - **Name**: My Research Project
    - **Passphrase**: A strong passphrase (20+ characters)
<Warning>
  Your passphrase cannot be recovered if lost. Store it securely!
</Warning>
  </Step>
  <Step title="Optional: Export Recovery Kit">
    Download your recovery kit (mnemonic + QR code) for backup.
  </Step>
</Steps>
2. Import Your First Document
<Steps>
  <Step title="Navigate to Inbox">
    Click **Inbox** in the sidebar
  </Step>
  <Step title="Add a Document">
    Try one of these options:
<Tabs>
  <Tab title="URL">
        https://en.wikipedia.org/wiki/Artificial_intelligence
  </Tab>
  <Tab title="PDF">
    Drag and drop a research paper (max 50MB)
  </Tab>
  <Tab title="Text">
    Paste any text content directly
  </Tab>
</Tabs>
  </Step>
  <Step title="Review Chunks">
    Preview extracted chunks and click **"Ingest"**
  </Step>
</Steps>
3. Ask a Question
<Steps>
  <Step title="Navigate to Ask">
    Click **Ask** in the sidebar
  </Step>
  <Step title="Enter Your Query">
```
    What are the main approaches to artificial intelligence?
```
  </Step>
  <Step title="Explore the Answer">
    The **Explain Panel** shows:
    - **Facts**: Supporting evidence with confidence scores
    - **Citations**: Links to original sources
    - **Reasoning**: How facts were ranked and combined
  </Step>
</Steps>
4. Visualize the Knowledge Graph
<Steps>
  <Step title="Navigate to Graph">
    Click **Graph** in the sidebar
  </Step>
  <Step title="Explore Visually">
    - Pan and zoom with mouse/trackpad
    - Click nodes to see details
    - Toggle overlays (rank heatmap, recency, communities)
  </Step>
</Steps>
Common Commands
Managing Services
bash# Start all services
docker-compose -f infra/docker-compose.dev.yml up -d

# Stop all services
docker-compose -f infra/docker-compose.dev.yml down

# View logs
docker-compose -f infra/docker-compose.dev.yml logs -f api

# Restart a service
docker-compose -f infra/docker-compose.dev.yml restart api

# Rebuild after code changes
docker-compose -f infra/docker-compose.dev.yml up -d --build
Database Operations
bash# Access Postgres shell
docker-compose -f infra/docker-compose.dev.yml exec postgres psql -U contextcache -d contextcache_dev

# Run migrations
docker-compose -f infra/docker-compose.dev.yml exec api alembic upgrade head

# Reset database (WARNING: deletes all data)
docker-compose -f infra/docker-compose.dev.yml down -v
docker-compose -f infra/docker-compose.dev.yml up -d
Development Workflow
bash# Backend development (with hot reload)
cd api
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e ".[dev]"
uvicorn main:app --reload

# Frontend development (with hot reload)
cd frontend
pnpm install
pnpm dev

# Run tests
cd api && pytest
cd frontend && pnpm test
Troubleshooting
<AccordionGroup>
  <Accordion title="Port Already in Use">
    If ports 3000, 5432, 6379, or 8000 are in use:
```bash
    # Find and kill the process (macOS/Linux)
    lsof -ti:3000 | xargs kill -9
# Or change ports in docker-compose.dev.yml
  </Accordion>

  <Accordion title="Docker Build Fails">
```bash
    # Clear Docker cache
    docker system prune -a
    
    # Rebuild from scratch
    docker-compose -f infra/docker-compose.dev.yml build --no-cache
  </Accordion>
  <Accordion title="Database Connection Error">
```bash
    # Check if Postgres is healthy
    docker-compose -f infra/docker-compose.dev.yml ps
# View Postgres logs
docker-compose -f infra/docker-compose.dev.yml logs postgres

# Restart Postgres
docker-compose -f infra/docker-compose.dev.yml restart postgres
  </Accordion>

  <Accordion title="Frontend Won't Load">
```bash
    # Clear Next.js cache
    cd frontend
    rm -rf .next node_modules
    pnpm install
    
    # Or rebuild container
    docker-compose -f infra/docker-compose.dev.yml up -d --build frontend
  </Accordion>
  <Accordion title="Apple Silicon Issues">
    If you encounter platform compatibility warnings:
```bash
    # Add platform flag to docker-compose.dev.yml services
    platform: linux/arm64
# Or use Rosetta 2
export DOCKER_DEFAULT_PLATFORM=linux/amd64
  </Accordion>
</AccordionGroup>

## Next Steps

<CardGroup cols={2}>
  <Card title="Explore the Data Model" icon="diagram-project" href="/data-model">
    Learn about quads, provenance, and audit chains
  </Card>
  <Card title="Understand Security" icon="shield-halved" href="/security">
    Deep dive into encryption and key management
  </Card>
  <Card title="Try the Cookbook" icon="book" href="/cookbook">
    Follow step-by-step guides for common tasks
  </Card>
  <Card title="API Reference" icon="code" href="/api-reference">
    Explore REST and MCP server endpoints
  </Card>
</CardGroup>

## Getting Help

<CardGroup cols={3}>
  <Card title="GitHub Discussions" icon="comments" href="https://github.com/thecontextcache/contextcache/discussions">
    Ask questions and share ideas
  </Card>
  <Card title="Report Issues" icon="bug" href="https://github.com/thecontextcache/contextcache/issues">
    Found a bug? Let us know
  </Card>
  <Card title="Email Support" icon="envelope" href="mailto:thecontextcache@gmail.com">
    Direct support for urgent issues
  </Card>
</CardGroup>

---

**Congratulations!** You now have thecontextcache running locally. Start building your knowledge graph! 🚀
