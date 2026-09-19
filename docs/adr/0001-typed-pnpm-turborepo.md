---
status: accepted
---

# Use one strict TypeScript pnpm/Turborepo workspace

The current user explicitly requests a fully typed Turborepo with pnpm, so application and shared package work will live in one repository with pinned tooling and a shared strict compiler policy. This favors coordinated changes and consistent contracts over independent repositories, at the cost of a shared toolchain and the need to enforce package boundaries.

Runtime validation at external boundaries remains necessary; static types do not establish input correctness. The initial repository creates only the package foundation, leaving application and provider choices to discovery.
