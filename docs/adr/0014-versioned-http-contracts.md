---
status: accepted
---

# Preserve a public application boundary for future native clients

Under D04/D09, use runtime-validated versioned HTTP contracts backed by shared use cases, alongside Next.js rendering. Native apps are deferred, but coupling every competitive operation exclusively to framework-private server actions would make that later client depend on a web-specific transport.

Do not create a separate API deployment or duplicate server logic. Extract contracts as real endpoints are built and generate client/OpenAPI types from the same schema.
