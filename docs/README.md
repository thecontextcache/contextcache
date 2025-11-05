# ContextCache Documentation

This documentation is built with [Mintlify](https://mintlify.com/).

## 🚀 Running Locally

### Prerequisites
```bash
npm install -g mintlify
```

### Development Server
```bash
# From the project root
mintlify dev

# Docs will be available at http://localhost:3000
```

### Building for Production
```bash
mintlify build
```

## 📚 Documentation Structure

```
docs/
├── overview.md                 # Project overview
├── quickstart.md              # Getting started guide
├── security.md                # Security model
├── threat-model.md            # Threat modeling
├── data-model.md              # Database schema
├── mcp.md                     # MCP protocol integration
├── api-reference.md           # API documentation
├── cookbook.md                # Code examples
├── runbooks.md                # Operations guide
├── benchmarks.md              # Performance benchmarks
└── internal/                  # Internal design docs
```

## 📝 Adding New Pages

1. Create a new `.md` file in `/docs`
2. Add frontmatter:
   ```yaml
   ---
   title: "Page Title"
   description: "Page description"
   ---
   ```
3. Update `mint.json` navigation
4. Test locally with `mintlify dev`

## 🎨 Customization

Edit `mint.json` to customize:
- Colors and branding
- Navigation structure
- Social links
- Analytics integration

## 🚀 Deployment

### Option 1: Mintlify Hosting (Recommended)
1. Sign up at [mintlify.com](https://mintlify.com/)
2. Connect your GitHub repository
3. Docs auto-deploy on push

### Option 2: Self-Hosted
```bash
mintlify build
# Deploy the /out directory to your hosting provider
```

## 📄 License

Documentation is licensed under CC BY 4.0
Code examples follow the project's dual license (PolyForm NC / Apache 2.0)
