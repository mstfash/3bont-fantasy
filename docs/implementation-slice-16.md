# Slice 16 — Reviewed catalogue imports

Implemented and verified 2026-09-19. No new database migration is required.

The bilingual catalogue import page accepts a canonical JSON manifest up to 2 MB and 1,000 records, including seasons, clubs and footballers. It validates the file, shows record counts and expandable before/after field changes, and requires review confirmation before applying. The season directory offers a consistent snapshot export with stable IDs and expected fingerprints; a fictional three-record example is downloadable from the import page.

Both preview and apply execute the existing single-record catalogue commands in dependency order inside one transaction. Preview deliberately rolls that transaction back, including row receipts and audit events. Apply binds the reviewed manifest and current documents, records one batch receipt plus individual row receipts, and rolls back completely on an invalid row or changed review. Invalid-row feedback retains its original file position. Retries of a committed batch return the same result without duplicating evidence. No provider names are automatically matched to existing identities.

Single-record writes share a catalogue coordination lock, while bulk operations hold the exclusive lock. Export uses a repeatable-read snapshot; imports require global football-data capability and recent staff verification. Existing synthetic identity, season membership, valuation provenance and revision checks remain authoritative. Catalogue import does not publish fantasy prices or create fixtures, competitions or provider identity mappings.

Disposable PostgreSQL proofs cover dependency ordering, preview rollback, whole-batch rejection, concurrent retries, semantic export fingerprints, stale reviews, duplicate identifiers and denied authorization. Full formatting/lint/type/build/unit checks, disposable database integration and browser proofs pass, including file review, apply, export, invalid-row feedback and Arabic mobile layout. See [import design](catalogue-import-design.md) for the canonical boundary.
