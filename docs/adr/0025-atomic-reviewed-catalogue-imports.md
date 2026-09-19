# Apply catalogue imports as reviewed atomic batches

Season, club and footballer imports reuse the existing catalogue commands in a single transaction, with previews rolling back the same validation and writes that application will execute. A revision-bound manifest and durable batch receipt prevent partial imports and ambiguous retries while preserving stable identities, source evidence and the separation between real valuations and fantasy prices.
