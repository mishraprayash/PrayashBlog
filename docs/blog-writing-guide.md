# Writing guide

This is the standard every post on the site is held to. The starting point for a new post is `docs/post-template.md`. The reasoning behind the voice rules, with examples taken from the existing posts, is in `docs/redesign/02-positioning-identity.md`.

The site's promise is in its tagline: **how backend systems fail where they meet databases, message brokers and the network, shown with the failure reproduced and the fix tested.** Every rule below exists to keep that promise.

---

## What every post needs

These are required. They don't have to be headings, and most of them shouldn't be.

1. **The problem, in the first screen.** Lead with the specific thing that breaks: the code, the error, the query. Not a scene, and not a claim about what "every team" does.
2. **Who it's for.** One sentence near the top that says what the reader is assumed to know and what situation they're in ("This assumes you already run an outbox on Postgres…").
3. **Context and constraints.** What system this came from, at what scale, under what limits, as far as you can say. If it comes from your own work, say so plainly, and keep it true.
4. **The mechanism.** Why it breaks, traced through the layers that matter. Link to the spec, the docs or the source line rather than paraphrasing them from memory.
5. **Evidence.** Reproduce the failure, show the real output, and pin the versions ("Postgres 16.15", "Node 22.22", "lua-resty-http master as of Oct 2026"). If you couldn't reproduce something, say so and say what you relied on instead.
6. **The fix, and its cost.** What you'd do, what it costs (latency, complexity, operational burden), and what you considered and rejected, with the reason.
7. **Edge cases and failure modes.** The 0.1% cases: crashes halfway, retries, timeouts, concurrency, limits. Put them where they belong in the argument, not in a separate "Edge cases" section.
8. **Numbers, with where they came from.** "p99 went from 41 ms to 9 ms on a 4-vCPU box at 200 rps" is useful. "Cuts latency from 25 s to 3 s" without a source is not. If you don't have a number, don't invent one.
9. **A diagram where structure matters.** Architecture, sequences and data flow get a figure: inline SVG, or Mermaid rendered at build time. Avoid ASCII box art, which breaks on mobile and is unreadable to screen readers.
10. **A short summary.** What the reader should do differently, as a few bullets. Not a restatement of the post.
11. **Further reading.** The primary sources you used, and related posts on this site. Posts that build one argument link to each other both ways.

## Voice

Write the way you'd explain it to a colleague you respect, after having actually run it.

| Do | Don't |
|---|---|
| Start with the problem, the code or the error | Start with a scene ("It's 3 AM…") or a claim about the whole industry |
| Say what you were working on, as far as it's true | Imply scale, incidents or a team you can't back up |
| Show what you tried first and why it didn't work | Present the final answer as if it were obvious |
| Give numbers with how they were measured | Give round numbers with no source |
| Link the spec, docs page, source line or bug report | State defaults and behaviour from memory |
| Vary sentence length because the thought varies | Fall into short–short–long rhythms ("It passes review. It runs in staging. Then…") |
| Use bold for at most one or two things per section | Bold key phrases throughout |
| Stop a section when the point is made | End every section with a lesson or an aphorism |
| Say what you haven't tested | Hedge everything, or claim everything |
| Use plain words: use, fix, check, break | Use "leverage", "robust", "seamless", "elegant", "blistering", "bulletproof", "game-changer" |
| Use commas, colons, parentheses or a new sentence | Reach for an em dash by default |
| Put corrections in the dated revision note | Narrate corrections inside the body ("an earlier draft said…") |

Avoid these phrases: "Here is why", "Here's what actually happens", "The lesson is simple", "If you take one thing from this post", "Enter X", "in today's fast-paced world". Avoid emoji in headings, and the fixed "Symptom → cause → fix" formula. Describe the symptom, cause and fix in sentences instead.

## Code and output

- **Run it.** Every code sample has been run, against the version you name. If it's illustrative only, say so in the text.
- **Show real output.** Use a `console` fence for output, so it's labelled as output. Trim it if it's long, and say that you trimmed it.
- **Label files:** add `title="handler.ts"` to the fence for code that lives in a file.
- **Highlight lines:** use `{3-5}` to point at the lines the text is talking about.
- **Show changes as diffs:** use the `diff` language for before/after changes.
- **Callouts:** `> [!NOTE]`, `> [!TIP]`, `> [!CAUTION]`, `> [!WARNING]`. At most one or two per section; a callout isn't a substitute for a paragraph.

## Before publishing

- [ ] The first screen states the problem, and says who the post is for
- [ ] Every code sample has been run, and the versions are named
- [ ] Every number says where it came from
- [ ] Behaviour claims link to the spec, the docs or the source
- [ ] There's at least one failure case the docs don't cover
- [ ] Trade-offs and the alternatives considered are stated
- [ ] Related posts are linked in both directions
- [ ] No phrases from the "avoid" list, no emoji headings, bold used sparingly
- [ ] `npm run todos` shows nothing left in the post
- [ ] Frontmatter matches the schema (see `AGENTS.md`), and `npm run build` passes
