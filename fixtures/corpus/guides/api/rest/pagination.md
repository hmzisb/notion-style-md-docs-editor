---
title: Pagination
---

# Pagination

Cursors, never offsets.

```ts
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
```

```js
const first = await client.list({ limit: 50 });
const next = await client.list({ limit: 50, cursor: first.nextCursor });
```

Back up to [REST](./index.md), or across to [rate limits](rate%20limits.md).
