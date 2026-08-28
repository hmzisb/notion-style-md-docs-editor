---
'@hmzisb/notion-docs-react': patch
---

`getOpfsRoot` answers `unsupported` on every browser that has no origin private file system.
It checked that `navigator.storage` existed and then called `getDirectory` on it regardless,
so a `StorageManager` older than OPFS threw a `TypeError` where the API promises a
`ProviderError`.
