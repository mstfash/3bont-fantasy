# Preserve fixture eligibility instead of inferring non-appearance

Scoring uses a versioned complete eligibility roster for each fixture and explicit participation facts; absence from an incomplete feed never means zero minutes. Looking up a footballer’s current club is simpler, but would mis-score historical fixtures after real transfers and can trigger incorrect substitutions or vice-captain points. Imports and future provider adapters must therefore supply historical eligibility evidence; incomplete coverage keeps results provisional and blocks finalization.
