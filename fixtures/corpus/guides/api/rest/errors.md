---
title: Error codes
order: 10
---

# Error codes

Every error body carries a stable `code`. Never match on the message.

| Code           | HTTP | Meaning                  | Retry               |
| -------------- | ---- | ------------------------ | ------------------- |
| `not_found`    | 404  | The id does not exist    | No                  |
| `conflict`     | 409  | The version moved on     | After a reload      |
| `validation`   | 422  | The body failed a schema | No                  |
| `rate_limited` | 429  | Too many requests        | After `Retry-After` |
| `unavailable`  | 503  | The backend is down      | With backoff        |
