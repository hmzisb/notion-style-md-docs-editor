---
title: Sessions
order: 20
---

# Sessions

A session is a server-side record. The cookie only carries its id.

### Storage

Sessions live in the primary database, not in the cache. A cache miss must never
sign a user out.

```sql
select id, user_id, expires_at
from sessions
where expires_at > now();
```
