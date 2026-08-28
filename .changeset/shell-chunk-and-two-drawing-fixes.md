---
'@hmzisb/notion-docs-react': patch
---

The floating toolbar no longer draws over the page title. A selection in the first block put it
above the editor, where the page header was, because `flip` measured against the scrolling
ancestor rather than the editor's own box.

A picture is now centred in its column, so the centred caption below it lines up with the
picture. Left-aligned, a picture narrower than the column sat against the edge while its caption
floated mid-page.

The breadcrumb overflow menu is a chunk of its own. A trail deeper than three ancestors fetches
it on the press; everything shallower never loads it, and the `./shell` entry drops from 96.9 kB
to 88.3 kB gzipped.
