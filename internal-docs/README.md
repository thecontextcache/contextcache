# Internal Docs

These notes are for operators and maintainers. They are intentionally **not**
published in the MkDocs site.

## Scope note

`/Users/nd/Documents/contextcache/docs/01-mvp-scope.md` is still useful as the
original boundary document, but it is no longer a complete description of the
current production system. Use the files in this folder when you want the
current operator/maintainer view instead of the historical MVP framing.

## What lives here

- `/Users/nd/Documents/contextcache/internal-docs/system-map.md`
  - service map, request flows, ownership boundaries, and private-engine touchpoints
- `/Users/nd/Documents/contextcache/internal-docs/deploy-and-debug.md`
  - local/test/prod command matrix, build paths, and failure recovery patterns
- `/Users/nd/Documents/contextcache/internal-docs/local/README.md`
  - guidance for machine-local notes that should stay out of git

## Important boundary

Keeping these files out of MkDocs prevents them from being published at
`docs.thecontextcache.com`, but it does **not** make them secret if the git
repository itself is public.

For truly private notes, put them under:

- `/Users/nd/Documents/contextcache/internal-docs/local/`

That directory is gitignored except for its tracked `README.md`.
