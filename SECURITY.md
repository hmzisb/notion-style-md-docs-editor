# Security

## Reporting a vulnerability

Please **do not** open a public issue.

Use GitHub's private reporting:
[Report a vulnerability](https://github.com/hmzisb/notion-style-md-docs-editor/security/advisories/new).

You should get a first reply within a week. If a fix is needed, it ships as a patch release and
the advisory is published with credit unless you would rather stay anonymous.

## What is in scope

This is a frontend module. It renders Markdown a host gives it and writes Markdown back through
a `DocumentProvider` the host supplies. Things worth reporting:

- Markdown or frontmatter that escapes the renderer — script execution, or HTML reaching the page
  in a way the read view is meant to prevent.
- A page path from the provider that escapes the workspace root when written back (`..`,
  absolute paths, symlink tricks).
- Cached content leaking between workspaces — a page from one provider readable under another.
- Anything in an adapter that sends page content somewhere the host did not configure.

## What is not in scope

- **The host's own backend.** This module has none. Authentication, authorisation and rate
  limiting live behind whatever `DocumentProvider` you wrote.
- **Raw HTML in Markdown.** It is preserved on purpose (see `docs/00-DECISIONS.md`). The read view
  renders it, so a host that accepts Markdown from untrusted authors must sanitise before storing.
- Vulnerabilities in dependencies without a path through this module — report those upstream.

## Supported versions

The latest minor release. This project is pre-1.0, so patches land on the newest version only.
