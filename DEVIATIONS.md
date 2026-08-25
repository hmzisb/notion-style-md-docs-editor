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

## DEV-001 · P0-T09 · 2026-08-25
Spec said: docs/03 section 4.1 - "A directory without `index.md` is a `folder` node: expandable, not openable, convertible to a page."
Reality: read literally that makes every asset directory a node. The corpus has `assets/` and `guides/auth/assets/`, which hold only images; they would appear in the sidebar as empty, unopenable folders that cannot be converted to a page without first inventing content.
Decision: a directory becomes a node only when it, or something beneath it, holds at least one `*.md` file. Directories that hold only assets are skipped, exactly as the same section already skips the asset files themselves.
Impact: `fs/walk.ts` (`hasPages`); the corpus manifest declares one folder node (`archive`), not three; no public API change.
Reverse when: a UI arrives that wants to browse asset-only directories - then this becomes a walk option rather than a rule.
