# DEVIATIONS

Every departure from `docs/` gets an entry before the code lands. Newest first. Keep entries factual and short.

Format:

```
## DEV-001 · <TASK-ID> · <date>
Spec said: <doc and section, one line>
Reality: <what the installed library / platform / measurement actually offers>
Decision: <what was built instead; behavior preserved or not>
Impact: <public API, bundle size, tests, docs touched>
Reverse when: <condition under which the spec's version becomes possible>
```

Categories that always require an entry: new runtime dependency (with gz size and license), a dropped stretch block (D-17), a budget exceeded (with the breakdown), a locked decision that could not be implemented as written, a golden file change.

---

## DEV-005 · P0-T14 · 2026-08-25
Spec said: docs/09 P0-T14 verifies with `pnpm doctor fixtures/corpus --allow-lossy`.
Reality: pnpm 10 parses unknown `--flags` itself in the `pnpm <script>` shorthand, so that exact line fails with `ERROR  Unknown option: 'allow-lossy'` before the script runs; `pnpm doctor fixtures/corpus -- --allow-lossy` runs nothing at all.
Decision: the script and its flag are exactly as specified; the verify command is `pnpm run doctor fixtures/corpus --allow-lossy`, which pnpm forwards verbatim. Exit code is 1 with a lossy page and no flag, 0 with the flag.
Impact: `scripts/doctor.ts`, root `doctor` script (now `tsx --tsconfig tsconfig.tools.json scripts/doctor.ts`, so the script resolves `@docs/core` to source without a build); `docs/execution/PHASE-0-REPORT.md` records the working command.
Reverse when: pnpm forwards unknown options to scripts in the shorthand form.

## DEV-004 · P0-T13 · 2026-08-25
Spec said: docs/05 section 2 - "Keep underline only if the installed plugin round-trips `<u>` in non-MDX mode; otherwise remove the button and the `Cmd+U` shortcut and log the deviation."
Reality: it does not. `<u>text</u>` parses to inline HTML, never to the mark, and the mark's stock rule serializes to `mdxJsxTextElement`, which non-MDX stringify rejects outright: `Cannot handle unknown node 'mdxJsxTextElement'`. The same is true of `highlight`, `kbd`, `subscript`, `superscript`, `comment` and `suggestion`.
Decision: `BaseUnderlinePlugin` is out of `BaseKit`, and all seven marks are listed as `plainMarks`, so a value that arrives carrying one from anywhere else saves as plain words instead of throwing. P2's editor kit ships no underline button and no `Cmd+U`. `<u>` in a file survives byte for byte as raw HTML (DEV-003).
Impact: `codec/base-kit.ts`; two tests in `codec.test.ts`; docs/05's block table row for Underline is not implemented; no public API change.
Reverse when: Plate's Markdown plugin gains a non-MDX `<u>` rule pair, or the module turns MDX on.

## DEV-003 · P0-T13 · 2026-08-25
Spec said: docs/09 P0-T09 lists the corpus HTML comment as "(lossy)", and reference/architecture-v2.md line 414 reads "Plate drops raw HTML by default ... Lossy for `<details>`, `<img width>`, HTML comments".
Reality: that is a statement about Plate's stock rules, and the stock behavior is worse than lossy - raw HTML deserializes to plain text and comes back escaped (`\<details>`, `\<!-- ... -->`), which silently breaks the block in the file. docs/05 section 4 defines a lossy reason as an "html node **not handled by a custom rule**", and D-16 defines lossy as information dropped.
Decision: the codec registers a verbatim `html` rule pair, so raw HTML survives byte for byte in both directions. Nothing is dropped, so raw HTML alone no longer makes a page lossy: `specs/import-export.md` is declared `exact` in the corpus manifest, and `specs/index.md` (`<details>`) stays `exact` instead of waiting for the P2 toggle rule.
Impact: `codec/base-kit.ts` (`FIDELITY_RULES.html`); `fixtures/corpus/manifest.json` (one page's fidelity level); `testing/corpus.test.ts` no longer requires an `html` reason in the corpus - P0-T14 unit tests that reason directly instead. `<details>` still has no editor block until P2-T11; it renders as its own text.
Reverse when: a host needs raw HTML stripped rather than preserved - then this becomes a codec option, not a default.

## DEV-002 · P0-T11 · 2026-08-25
Spec said: docs/03 section 4.2 - a page with a path-hash id gets "a fresh `generateId()` written into frontmatter" on its first write.
Reality: docs/03 section 10 pins the opposite outcome three times in the conformance cases it requires - "save with null base on folder -> ... id preserved", "child of leaf page (conversion, id preserved)", "move between parents updates paths and keeps ids". Minting a new id on first write breaks every one of them, and it invalidates the id the UI is holding at the exact moment the user saves.
Decision: the first write persists the id the node already has (`h_<hash>` for a page, `f_<hash>` for a converted folder) into frontmatter, which is what freezes it against later path changes. Brand-new pages from `createPage` still get a fresh `generateId()`, which is where section 4.2's ULID rule applies unambiguously.
Impact: `fs/semantics.ts` (`persistId`, `savePage`); `provider-write.test.ts` asserts the id is unchanged after the first save, after a folder conversion and after a move; no public API change.
Reverse when: docs/03 section 10 drops the id-preservation cases, or the React layer gains a rebind step that can follow an id change across a save.

## DEV-001 · P0-T09 · 2026-08-25
Spec said: docs/03 section 4.1 - "A directory without `index.md` is a `folder` node: expandable, not openable, convertible to a page."
Reality: read literally that makes every asset directory a node. The corpus has `assets/` and `guides/auth/assets/`, which hold only images; they would appear in the sidebar as empty, unopenable folders that cannot be converted to a page without first inventing content.
Decision: a directory becomes a node only when it, or something beneath it, holds at least one `*.md` file. Directories that hold only assets are skipped, exactly as the same section already skips the asset files themselves.
Impact: `fs/walk.ts` (`hasPages`); the corpus manifest declares one folder node (`archive`), not three; no public API change.
Reverse when: a UI arrives that wants to browse asset-only directories - then this becomes a walk option rather than a rule.
