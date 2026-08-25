# ADR 0002: One provider seam

**Status:** accepted

Every backend arrives through `DocumentProvider`. Nothing above it knows whether
the bytes came from memory, a directory handle or HTTP.

> The seam is the product. Everything else is an implementation of it.

No frontmatter on this page: the title comes from the H1, colon and all.
