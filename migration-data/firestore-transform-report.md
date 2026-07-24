# Firestore Groups Transform Report

This report was generated from the local Firestore export only. No external service was contacted, and no data was imported.

## Summary

- Source path: `migration-data/firestore-groups-export.json`
- Output path: `migration-data/firestore-groups-transformed.json`
- Source collection: groups
- Source project ID: socialgroupsapp-a8fed
- Source metadata count: 22
- Source parsed count: 22
- Transformed count: 22
- Blocking errors: 0
- Warnings: 24
- Informational items: 26
- Final result: READY FOR IMPORT

## Status Totals

| Status | Count |
| --- | --- |
| approved | 17 |
| pending | 5 |
| rejected | 0 |
| archived | 0 |

## Publication Status Policy

Approved policy: preserve exact current publication behavior. Legacy source `status` and `hidden` values are compared case-sensitively, without trimming, lowercasing, or capitalization normalization. The mapping is: `status === "approved"` -> `approved`; otherwise `hidden === "no"` -> `approved`; otherwise `status === "rejected"` -> `rejected`; otherwise `status === "archived"` -> `archived`; otherwise `pending`.

The source record `wXjZduvItba0CfncL8TH` (`Missions Collective`) has `hidden: "No"` and missing `status`, so it transforms to `pending` under this policy.

## Expected Status Totals Check

| Status | Expected | Actual | Matches |
| --- | --- | --- | --- |
| approved | 17 | 17 | yes |
| pending | 5 | 5 | yes |
| rejected | 0 | 0 | yes |
| archived | 0 | 0 | yes |

## Normalizations Performed

| Normalization | Count |
| --- | --- |
| additionalInfo empty string -> NULL | 6 |
| additionalInfo missing/null -> NULL | 16 |
| day placeholder/blank -> NULL | 2 |
| hidden/status -> canonical status using case-sensitive legacy mapping | 22 |
| hour/minute/ampm -> meeting_time | 20 |
| invalid/incomplete meeting time -> NULL | 1 |
| meeting time absent/blank -> NULL | 1 |
| missing coordinates -> NULL latitude/longitude | 22 |
| submittedAt ISO string preserved | 6 |
| submittedAt missing/blank -> NULL | 16 |
| trimmed city | 1 |
| trimmed description | 3 |

## Discarded Source-Only Fields

| Field | Frequency |
| --- | --- |
| ampm | 22 |
| g-recaptcha-response | 1 |
| hidden | 22 |
| hour | 22 |
| minute | 22 |

## Record-Level Warnings And Errors

| Document ID | Group title | Severity | Issue | Recommended action |
| --- | --- | --- | --- | --- |
| A0aD7IvBPNENd7UVxDC0 | Thursday Bible Study Group | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| A0aD7IvBPNENd7UVxDC0 | Thursday Bible Study Group | warning | Conflicting hidden/status combination: status=pending, hidden=no | Canonical status follows the approved case-sensitive precedence rules. |
| C8n9EU5i2YwLkXdtoh1X | Heaven Bound Balloon Team | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| C8n9EU5i2YwLkXdtoh1X | Heaven Bound Balloon Team | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| C8n9EU5i2YwLkXdtoh1X | Heaven Bound Balloon Team | informational | Trimmed whitespace in description | No manual action needed if trimmed value is correct. |
| DpLKywvIeHlQM15Fp3zR | MomCo Lifegate Denver | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| DpLKywvIeHlQM15Fp3zR | MomCo Lifegate Denver | warning | Conflicting hidden/status combination: status=pending, hidden=no | Canonical status follows the approved case-sensitive precedence rules. |
| dR5jeOduJWQt2y84nAfA | Touched by Adoption | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| dR5jeOduJWQt2y84nAfA | Touched by Adoption | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| EAz541Amiv4dho87o8U9 | Creatives & Entreprenuers | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| EAz541Amiv4dho87o8U9 | Creatives & Entreprenuers | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| EAz541Amiv4dho87o8U9 | Creatives & Entreprenuers | informational | Trimmed whitespace in description | No manual action needed if trimmed value is correct. |
| f9XQ35zFoqW1in7BjmRc | Young Dad's Group | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| f9XQ35zFoqW1in7BjmRc | Young Dad's Group | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| f9XQ35zFoqW1in7BjmRc | Young Dad's Group | informational | Trimmed whitespace in description | No manual action needed if trimmed value is correct. |
| fBKKZYJl8MJQv5pSSMGL | 3 Is 1 "The Check In" | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| fBKKZYJl8MJQv5pSSMGL | 3 Is 1 "The Check In" | warning | Conflicting hidden/status combination: status=pending, hidden=no | Canonical status follows the approved case-sensitive precedence rules. |
| GilRsIlxqQM4uL2YQjGT | Lazy Saturday morning Men's Group | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| GilRsIlxqQM4uL2YQjGT | Lazy Saturday morning Men's Group | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| Heppp6topjLKtBp0SAcc | Women's Bible Study | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| Heppp6topjLKtBp0SAcc | Women's Bible Study | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| jaSZsNWMFgZFZN7FxWeG | Good Beginnings | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| jaSZsNWMFgZFZN7FxWeG | Good Beginnings | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | informational | Trimmed whitespace in city | No manual action needed if trimmed value is correct. |
| mnLsLDfzEBaKgcdaCqdb | Bible Study for 20/30 Somethings | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| mnLsLDfzEBaKgcdaCqdb | Bible Study for 20/30 Somethings | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| Mr6axp8Fprtws27RU4h6 | Freedom fight \| men breaking free from sexual sin | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| Mr6axp8Fprtws27RU4h6 | Freedom fight \| men breaking free from sexual sin | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| o5vz1Xq7pfHMvOemd3Bz | Shine Cheer and Dance Cheer Class | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| o5vz1Xq7pfHMvOemd3Bz | Shine Cheer and Dance Cheer Class | warning | Conflicting hidden/status combination: status=pending, hidden=no | Canonical status follows the approved case-sensitive precedence rules. |
| oG7199pPB6fE5DdTw9hy | Perspectives Class | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| oG7199pPB6fE5DdTw9hy | Perspectives Class | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | warning | Normalized day "TBD" to NULL | Confirm NULL day is acceptable for this group. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | warning | Invalid or incomplete meeting time normalized to NULL | Review source hour/minute/ampm; do not guess missing time. |
| PUDF2a0hb9oyVDFFWHOS | Monthly Cycling Group | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| PUDF2a0hb9oyVDFFWHOS | Monthly Cycling Group | warning | Conflicting hidden/status combination: status=pending, hidden=no | Canonical status follows the approved case-sensitive precedence rules. |
| QzJf3pukjB4jDc8JYkgV | Men Alive | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| QzJf3pukjB4jDc8JYkgV | Men Alive | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| R0UUk5YPbAEbtRlTP8z4 | 2nd Sunday Lunch and Chat | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| R0UUk5YPbAEbtRlTP8z4 | 2nd Sunday Lunch and Chat | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| SrAJY0Lx90ghAwMlYm9s | Moms Meet-up | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| SrAJY0Lx90ghAwMlYm9s | Moms Meet-up | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |
| tl1xNwHZnAQ4BuZ5Tz5T | Practicing the Way | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| tl1xNwHZnAQ4BuZ5Tz5T | Practicing the Way | warning | Conflicting hidden/status combination: status=pending, hidden=no | Canonical status follows the approved case-sensitive precedence rules. |
| wXjZduvItba0CfncL8TH | Missions Collective | informational | Missing coordinates normalized to NULL latitude/longitude | Import NULL coordinates or geocode later. |
| wXjZduvItba0CfncL8TH | Missions Collective | warning | Missing submittedAt normalized to NULL | Import as NULL only if this is acceptable. |

## ID Preservation

All output IDs were preserved from the source export, and no duplicate output IDs were found.

## Safety Confirmation

- The source export JSON was not modified.
- The script does not import data.
- The script does not connect to Firebase.
- The script does not connect to Supabase.

Final result: **READY FOR IMPORT**.
