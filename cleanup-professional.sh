#!/bin/bash

# Professional Codebase Cleanup Script
# Removes emojis, fixes authorship, consolidates documentation

echo "Starting professional cleanup..."

# 1. Remove unnecessary documentation files
echo "Removing redundant documentation..."
rm -f CLOUDFLARE_BUILD_FIX.md
rm -f CLOUDFLARE_ISSUE.md
rm -f CLOUDFLARE_NOT_FOUND_ISSUE.md
rm -f DEPLOYMENT_BLOCKER.md
rm -f DEPLOYMENT_CHECKLIST.md
rm -f OPENNEXT_MIGRATION_COMPLETE.md
rm -f URGENT-DOMAIN-FIX.md
rm -f DEPLOYMENT-STATUS.md
rm -f DIRECT-DEPLOYMENT.md
rm -f frontend/CLOUDFLARE-PAGES-SETUP.md
rm -f frontend/URGENT-ENV-VARS.md
rm -rf docs/internal/

# 2. Remove emojis from Python files
echo "Removing emojis from Python code..."
find api -name "*.py" -type f -exec sed -i 's/[🎉🚀✨📦🔒📊🔍✅🌐⚡🎯💡🔧🆘❌⚠️🔥🧹📋📤📄🎓📚]//g' {} \;

# 3. Remove emojis from TypeScript/React files
echo "Removing emojis from TypeScript/React code..."
find frontend -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | \
  grep -v node_modules | grep -v ".next" | \
  xargs sed -i 's/[🎉🚀✨📦🔒📊🔍✅🌐⚡🎯💡🔧🆘❌⚠️🔥🧹📋📤📄🎓📚]//g'

# 4. Fix authorship - Remove Claude/Anthropic attributions
echo "Fixing authorship..."
find . -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | \
  grep -v node_modules | grep -v ".next" | \
  xargs sed -i 's/Co-authored-by: Claude <noreply@anthropic.com>//g'

find . -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | \
  grep -v node_modules | grep -v ".next" | \
  xargs sed -i 's/Author: Claude//g'

find . -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | \
  grep -v node_modules | grep -v ".next" | \
  xargs sed -i 's/@anthropic.com//g'

# 5. Remove commented debug lines
echo "Removing unnecessary comments..."
find api -name "*.py" -type f -exec sed -i '/^[[:space:]]*# print(/d' {} \;
find api -name "*.py" -type f -exec sed -i '/^[[:space:]]*# console.log(/d' {} \;
find api -name "*.py" -type f -exec sed -i '/^[[:space:]]*# TODO:/d' {} \;

# 6. Remove console.log statements from frontend
echo "Removing console.log from frontend..."
find frontend -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | \
  grep -v node_modules | grep -v ".next" | \
  xargs sed -i '/console\.log(/d'

echo "✓ Cleanup complete!"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff"
echo "2. Test the application"
echo "3. Commit: git add -A && git commit -m 'chore: Professional codebase cleanup'"
