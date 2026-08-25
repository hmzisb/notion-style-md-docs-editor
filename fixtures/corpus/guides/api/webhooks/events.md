---
title: Events
---

# Events

The event envelope is stable; the `data` payload is versioned per type.

#### Envelope

Four fields, always present: `id`, `type`, `createdAt`, `data`.

#### Delivery

Retries use exponential backoff for 24 hours, then the endpoint is disabled.
