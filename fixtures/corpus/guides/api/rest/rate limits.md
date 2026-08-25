---
title: Rate limits
---

# Rate limits

A space in the filename, on purpose: links to this page have to be
percent-encoded and the walker has to keep the raw name.

- 600 requests per minute per token
- 50 concurrent requests per account
- `Retry-After` is always present on a 429

See [error codes](errors.md) for the response body.
