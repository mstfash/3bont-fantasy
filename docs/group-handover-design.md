# Group ownership handover

Selected under delegated recommendations, 2026-09-19. A league needs a consenting organizer when its founder leaves; organizer ownership is separate from squad ownership, prize approval and platform staff roles.

The current organizer offers ownership to an existing active member, identified by one of that member's active squads. Only one offer is current per group. It expires after seven days and can be cancelled by the organizer or declined by its recipient. The recipient must explicitly accept while still verified, unsuspended, an active member with an active squad, and below the 20-group organizer limit. No email or external notification is sent; the recipient sees the offer on the group page.

Acceptance binds the reviewed offer ID, group revision and current organizer. It changes only the organizer, increments the group revision, invalidates outstanding invitation codes and removes the current offer in one transaction. Existing memberships, points, H2H schedules, moderation history and published prize promises remain. The former organizer stays a member and can leave through the ordinary membership action. A newly accepted organizer gets the existing group management capabilities, not staff scoring/prize permissions.

The same competition/account/group lock order used by group writes serializes ownership acceptance with membership removal, invitation changes and recipient group creation. Recheck the database clock after locks. Command receipts make uncertain retries safe; audit records retain offer/acceptance references. Replacement, expiry, changed revisions, removed or retired recipients and concurrent acceptance fail without partial ownership changes.

Account closure will require handover of owned groups and removal of staff grants before confirmation. The account closure/erasure workflow remains separate and is not yet implemented by this feature.
