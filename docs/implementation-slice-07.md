# Slice 07 — Prize operations

Implemented and initially verified 2026-09-19. Migration 0008 is applied locally and immutable.

Competition/group pools have bilingual immutable published terms, fixed scoring gameweeks, an eligibility cutoff, ISO currency, cash or goods per rank, published goods equivalents and an optional one-award-per-account limit. Publication must precede the cutoff and opening round, with a recorded terms/eligibility evidence reference. Synthetic pools explicitly promise no real award.

Membership transitions preserve group eligibility at the cutoff after departures or rejoining. Eligibility checks use the same connection schema as authentication rather than assuming the public schema. Reviewed account exclusions retain evidence; changing them invalidates prior proposals. Pool results use projected aggregate totals, not every footballer breakdown for every squad.

Proposals bind finalized result revisions and eligibility. A check against current match facts catches corrections even before the scoring worker opens a review. Ties pool occupied rank amounts, preserve residue and deduplicate accounts before ranking. Goods ties use published cash equivalents or remain blocked. Preparation/review/approval/fulfillment reject self-awards; approval requires an account other than the preparer. Fulfillment records delivery evidence only and cannot transfer money. Fulfilled history cannot be voided; later discrepancies show a hold while retaining that history.

Staff screens support drafting, publication, reviewed calculation, eligibility decisions, independent approval, fulfillment and voiding an unfulfilled proposal. Participants see scoped terms and approved awards with review notices. Private group terms require current group access. Staff decision references and account IDs are excluded from public award results.

Verification: strict types/build/unit checks pass; 9 persistence and 25 application database cases/subcases pass, including schema-sensitive identity, membership history, ties, distinct approval, retry and late-fact checks. Chrome passes publication, bilingual terms/mobile rendering, verified eligibility and self-award rejection. The independent multi-account approval/fulfillment sequence is verified at the application/database boundary. Final evidence-table and aggregation refinements also passed the subsequent full build and browser run.

Remaining prize work: durable post-fulfillment correction-case remediation and expanded result previews showing award/rank impacts. A goods tie without a published cash equivalent stays blocked; there is no arbitrary winner override. Real cash terms, eligibility and legal/provider evidence remain release gates. Continue chat/moderation, sponsors, scoped support, privacy, provider/calibration and operating evidence.
