---
status: accepted
---

# Share football seasons across independent fantasy competitions

The user selected exactly one real football season per fantasy competition, with multiple fantasy competitions allowed to share it (Q04, 2026-09-18). Keep football facts separate from each fantasy competition's rules, squads and standings instead of duplicating the real season or combining several real leagues into one game.

Shared match evidence can support multiple scoring interpretations without duplicating provider ingestion. ADR-0012 now fixes factual override scope globally while preserving each game's finality. Prices, participation and permissions follow the canonical pricing, gameplay and module specifications; one game's configuration does not change another game.

Q05 clarification (accepted 2026-09-18): public/private League Groups within a Fantasy Competition reuse its squads and player-scoring rules; H2H groups compare those points through matchups. A group does not own a separate squad or scoring configuration. Different squad or player-scoring rules require a separate Fantasy Competition.
