#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "app", "global-error.js");
const source = fs.readFileSync(target, "utf8");
// Strip comments to avoid false positives in explanatory text.
const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
const codeOnly = withoutBlockComments.replace(/\/\/.*$/gm, "");

const hasHtml = /<\s*html\b/i.test(codeOnly);
const hasBody = /<\s*body\b/i.test(codeOnly);

if (hasHtml || hasBody) {
  console.error(
    "[guard] web/app/global-error.js must not render <html> or <body>."
  );
  console.error(
    "[guard] This causes production white-screen crashes (HierarchyRequestError)."
  );
  process.exit(1);
}

console.log("[guard] global-error.js structure check passed.");
