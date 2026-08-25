# Search

Client-side title search first, full-text later[^scope].

Ranking is prefix match, then substring, then fuzzy. Ties break on recency.

[^scope]: Full text needs an index the browser cannot hold for a large corpus,
    so it belongs behind the provider.
