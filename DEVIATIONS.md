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
