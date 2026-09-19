# Reviewed bulk catalogue imports

Selected under delegated implementation, 2026-09-19. Import a bounded canonical JSON manifest containing season, club and footballer commands, with bilingual names, stable identifiers, expected document fingerprints and a source-evidence reference. Unknown fields and duplicate entity or command identifiers are rejected. This is a reviewed import format; API-Football identity mapping and statistical normalization are separate adapters.

The preview shows creates/updates and relevant before/after records. Commands apply in dependency order: season, clubs, footballers. The apply step binds the exact reviewed manifest and current documents. A conflicting update or invalid reference rejects the whole batch; partial catalogue changes are never silently accepted. Existing single-record validation, valuation provenance, immutable season/synthetic identity and audit rules remain the source of behavior.

Single-record writes share a catalogue coordination lock; bulk writes hold it exclusively while applying the manifest. Individual entry editing keeps its existing footballer row locks. Batch size and input bytes are bounded, and imports use scoped data-steward authorization with recent MFA. A shared transaction records each accepted row and one batch receipt, so uncertain retries neither duplicate entities nor consume a different document version.

Exported season manifests preserve identifiers and expected fingerprints, making later updates explicit. A supplied synthetic example demonstrates new data without asserting target-season coverage, licenses or real market valuations. No name-only matching creates or overwrites a footballer automatically.
