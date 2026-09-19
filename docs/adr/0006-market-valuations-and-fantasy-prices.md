---
status: accepted
---

# Separate market valuations from published fantasy prices

The user requires both fantasy prices and real-world market valuations at launch (Q02), and selected valuations as an input to suggested starting fantasy prices with admin review before publication (Q02a, 2026-09-18). Later market-valuation updates change the valuation information without automatically repricing the game, avoiding external valuation changes silently altering competitive economics.

Compared with continuously coupling the two values, this requires distinct histories and an explicit initial-price publication step. [Pricing policy](../pricing-policy.md) records missing-data handling, initial suggestions, selling rules and performance-update timing. A real valuation source and empirical calibration remain evidence gates; this decision does not freeze fantasy prices for an entire season.

Q11a/Q11b refinements (accepted 2026-09-18): the default selling-price policy returns half positive gains rounded down to 0.1 units and takes full losses. Ongoing Fantasy Price updates are bounded and based on the competition's fantasy-performance results after completed gameweeks, with configurable thresholds, min/max prices and manual overrides. D14 selects a trial formula for simulation; production calibration is not claimed complete.
