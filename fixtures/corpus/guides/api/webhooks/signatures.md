---
title: Signatures
---

# Signatures

Every delivery carries an HMAC over the raw body.

```bash
printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"
```

Compare in constant time. A string equality check leaks the signature one byte
at a time.
