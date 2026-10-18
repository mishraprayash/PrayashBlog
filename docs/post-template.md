---
# Copy to src/content/blog/<slug>.md. Remove these comment lines.
title: "Say what breaks and where, in plain words"
slug: "lowercase-words-with-hyphens"      # becomes the URL; never change it once published
description: "One or two sentences: the problem, and what the reader gets. Used for search results and link previews."
publishDate: "2026-11-01T09:00:00Z"
author: "Prayash Mishra"
pillar: "messaging"                        # messaging | postgresql | running-services | network-edge
tags: ["postgresql"]                       # up to 4, from src/data/taxonomy.ts
# series: "reliable-messaging"             # optional, with seriesPart
# seriesPart: 4
# related: ["some-other-post-slug"]        # optional, shown first under Related
draft: true
---

<!-- The problem, first. The code, error or query that breaks, in a code block. -->

```console
the error, exactly as you saw it
```

<!-- One or two paragraphs: what's going wrong, and why it matters to someone running this. -->

<!-- Who it's for, in one sentence. -->
This assumes you [what the reader already knows or runs].

<!-- Context: where this came from, as far as you can say. Keep it true. -->

## Why it happens

<!-- The mechanism, traced through the layers that matter. Link the spec, docs or source. -->

<!-- Reproduce it. Name the versions. -->

```console title="Postgres 16.15"
real output
```

## The fix

<!-- What you'd do, with code that has been run. -->

```ts title="file.ts" {3-5}
// code you ran
```

<!-- What it costs, and what you considered instead: a sentence each, or a short table. -->

| Option | Costs | Breaks when |
| :--- | :--- | :--- |
| … | … | … |

## Where it still goes wrong

<!-- The edge cases and failure modes the fix doesn't cover: crashes halfway, retries, timeouts, limits. -->

## Summary

- What to do differently, as 3–5 bullets.

## Further reading

- Primary sources you used (specs, docs, source, bug reports)
- Related posts on this site
