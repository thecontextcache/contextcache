#!/usr/bin/env node
/**
 * Generate _routes.json for Cloudflare Pages
 * This tells Cloudflare Pages which routes should go to the Worker vs served as static assets
 */

const fs = require('fs');
const path = require('path');

const routesConfig = {
  version: 1,
  include: ['/*'],
  exclude: [
    // Next.js static assets
    '/_next/static/*',
    '/_next/data/*',
    
    // Public assets
    '/favicon.ico',
    '/logo.png',
    
    // Static file extensions
    '/*.css',
    '/*.js',
    '/*.json',
    '/*.xml',
    '/*.txt',
    '/*.png',
    '/*.jpg',
    '/*.jpeg',
    '/*.gif',
    '/*.svg',
    '/*.webp',
    '/*.ico',
    '/*.woff',
    '/*.woff2',
    '/*.ttf',
    '/*.eot'
  ]
};

const outputPath = path.join(__dirname, '../.open-next/_routes.json');

// Ensure directory exists
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Write routes config
fs.writeFileSync(outputPath, JSON.stringify(routesConfig, null, 2));

console.log('✅ Generated _routes.json for Cloudflare Pages');
console.log(`📁 Location: ${outputPath}`);
console.log(`📊 Excluded ${routesConfig.exclude.length} static asset patterns`);

