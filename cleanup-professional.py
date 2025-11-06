#!/usr/bin/env python3
"""
Professional Codebase Cleanup Script
Removes emojis, fixes authorship, removes debug code
UTF-8 safe implementation
"""

import os
import re
import glob
from pathlib import Path

# Emoji pattern
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F700-\U0001F77F"  # alchemical symbols
    "\U0001F780-\U0001F7FF"  # Geometric Shapes Extended
    "\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
    "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
    "\U0001FA00-\U0001FA6F"  # Chess Symbols
    "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
    "\U00002702-\U000027B0"  # Dingbats
    "\U000024C2-\U0001F251"
    "]+",
    flags=re.UNICODE
)

def remove_emojis(text):
    """Remove all emojis from text"""
    return EMOJI_PATTERN.sub('', text)

def process_file(filepath):
    """Process a single file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        original = content

        # Remove emojis
        content = remove_emojis(content)

        # Remove console.log statements (TypeScript/JavaScript files)
        if filepath.endswith(('.ts', '.tsx', '.js', '.jsx')):
            content = re.sub(r'^\s*console\.log\(.*?\);?\s*$', '', content, flags=re.MULTILINE)

        # Remove Claude/Anthropic attributions
        content = content.replace('Co-authored-by: Claude <noreply@anthropic.com>', '')
        content = content.replace('Author: Claude', '')
        content = re.sub(r'@anthropic\.com', '', content)

        # Remove commented debug lines (Python)
        if filepath.endswith('.py'):
            content = re.sub(r'^\s*# print\(.*?\)\s*$', '', content, flags=re.MULTILINE)
            content = re.sub(r'^\s*# console\.log\(.*?\)\s*$', '', content, flags=re.MULTILINE)
            content = re.sub(r'^\s*# TODO:.*$', '', content, flags=re.MULTILINE)

        # Only write if changed
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False

def main():
    print("Starting professional cleanup...")

    # 1. Remove unnecessary documentation files
    print("Removing redundant documentation...")
    docs_to_remove = [
        'CLOUDFLARE_BUILD_FIX.md',
        'CLOUDFLARE_ISSUE.md',
        'CLOUDFLARE_NOT_FOUND_ISSUE.md',
        'DEPLOYMENT_BLOCKER.md',
        'DEPLOYMENT_CHECKLIST.md',
        'OPENNEXT_MIGRATION_COMPLETE.md',
        'URGENT-DOMAIN-FIX.md',
        'DEPLOYMENT-STATUS.md',
        'DIRECT-DEPLOYMENT.md',
        'frontend/CLOUDFLARE-PAGES-SETUP.md',
        'frontend/URGENT-ENV-VARS.md',
    ]

    for doc in docs_to_remove:
        try:
            if os.path.exists(doc):
                os.remove(doc)
                print(f"  Removed: {doc}")
        except Exception as e:
            print(f"  Error removing {doc}: {e}")

    # Remove docs/internal directory
    try:
        import shutil
        if os.path.exists('docs/internal'):
            shutil.rmtree('docs/internal')
            print("  Removed: docs/internal/")
    except Exception as e:
        print(f"  Error removing docs/internal: {e}")

    # 2. Process Python files
    print("Processing Python files...")
    py_files = glob.glob('api/**/*.py', recursive=True)
    py_count = 0
    for f in py_files:
        if process_file(f):
            py_count += 1
    print(f"  Processed {py_count} Python files")

    # 3. Process TypeScript/React files
    print("Processing TypeScript/React files...")
    ts_files = []
    for ext in ['ts', 'tsx', 'js', 'jsx']:
        ts_files.extend(glob.glob(f'frontend/**/*.{ext}', recursive=True))

    # Filter out node_modules and .next
    ts_files = [f for f in ts_files if 'node_modules' not in f and '.next' not in f and '.open-next' not in f]

    ts_count = 0
    for f in ts_files:
        if process_file(f):
            ts_count += 1
    print(f"  Processed {ts_count} TypeScript/React files")

    print("\nCleanup complete!")
    print("\nNext steps:")
    print("1. Review changes: git diff")
    print("2. Test the application")
    print("3. Commit: git add -A && git commit -m 'chore: Professional codebase cleanup'")

if __name__ == '__main__':
    main()
