---
title: Tokens
order: 10
---

# Tokens

Access tokens are short lived. Refresh tokens are not.

## Rotation

Rotate a refresh token on every use and revoke the previous one.

```python
def rotate(session, refresh_token):
    session.revoke(refresh_token)
    return session.issue()
```

See [sessions](sessions.md) for the storage rules.
