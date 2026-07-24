# Firestore Groups Migration Audit

Generated from `migration-data/firestore-groups-export.json`. This report analyzes the local export only; it does not import data or contact Firebase or Supabase.

## Summary

- Firebase project ID: socialgroupsapp-a8fed
- Collection: groups
- Export metadata document count: 22
- Parsed document count: 22
- Duplicate IDs: 0
- Blocking issues: 1
- Warnings: 24
- Informational issues: 34
- Recommendation: Manual corrections required before import

# Field Inventory
| Field | Frequency | Observed data types | Required vs optional |
| --- | --- | --- | --- |
| additionalInfo | 6/22 | string (6) | optional/missing in 16 |
| ageGroup | 22/22 | string (22) | present in all records |
| ampm | 22/22 | string (22) | present in all records |
| audience | 22/22 | string (22) | present in all records |
| city | 22/22 | string (22) | present in all records |
| contactEmail | 22/22 | string (22) | present in all records |
| contactName | 22/22 | string (22) | present in all records |
| contactPhone | 22/22 | string (22) | present in all records |
| crossStreets | 22/22 | string (22) | present in all records |
| day | 22/22 | string (22) | present in all records |
| description | 22/22 | string (22) | present in all records |
| g-recaptcha-response | 1/22 | string (1) | optional/missing in 21 |
| hidden | 22/22 | string (22) | present in all records |
| hour | 22/22 | string (22) | present in all records |
| id | 22/22 | string (22) | present in all records |
| minute | 22/22 | string (22) | present in all records |
| status | 6/22 | string (6) | optional/missing in 16 |
| submittedAt | 6/22 | string (6) | optional/missing in 16 |
| title | 22/22 | string (22) | present in all records |
| zipCode | 22/22 | string (22) | present in all records |

# Distinct Enum-Like Values
## status

| Value | Count |
| --- | --- |
| pending | 6 |

## hidden

| Value | Count |
| --- | --- |
| no | 17 |
| No | 1 |
| yes | 4 |

## audience

| Value | Count |
| --- | --- |
| All | 13 |
| Men | 5 |
| Women | 4 |

## ageGroup

| Value | Count |
| --- | --- |
| Adult | 14 |
| All-ages | 7 |
| Kids | 1 |

## day

| Value | Count |
| --- | --- |
| (blank) | 1 |
| Friday | 1 |
| Monday | 2 |
| Saturday | 5 |
| Sunday | 6 |
| TBD | 1 |
| Thursday | 4 |
| Tuesday | 1 |
| Wednesday | 1 |

## ampm

| Value | Count |
| --- | --- |
| (blank) | 2 |
| AM | 8 |
| PM | 12 |

## hour

| Value | Count |
| --- | --- |
| (blank) | 1 |
| 1 | 2 |
| 10 | 1 |
| 2 | 1 |
| 3 | 1 |
| 4 | 1 |
| 5 | 1 |
| 6 | 6 |
| 7 | 4 |
| 8 | 1 |
| 9 | 2 |
| TBD | 1 |

## minute

| Value | Count |
| --- | --- |
| (blank) | 2 |
| 00 | 12 |
| 30 | 7 |
| 45 | 1 |


# Issue Counts
| Category | Count |
| --- | --- |
| Blank strings | 13 |
| Null values | 0 |
| Missing fields | 70 |
| Missing required fields | 0 |
| Duplicate IDs | 0 |
| Invalid email formats | 0 |
| Unusual phone formats | 0 |
| Invalid days | 1 |
| Invalid audience values | 0 |
| Invalid ageGroup values | 0 |
| Invalid or incomplete meeting times | 1 |
| Conflicting hidden/status combinations | 6 |
| Missing submittedAt values | 16 |
| Missing coordinates | 22 |
| Unexpected fields | 1 |

# Missing Field Frequencies
| Field | Missing count |
| --- | --- |
| additionalInfo | 16 |
| coords | 22 |
| status | 16 |
| submittedAt | 16 |

# Blank Strings
| Document ID | Field |
| --- | --- |
| A0aD7IvBPNENd7UVxDC0 | additionalInfo |
| DpLKywvIeHlQM15Fp3zR | additionalInfo |
| fBKKZYJl8MJQv5pSSMGL | additionalInfo |
| jMc6KbRUqK4ZXBrtQthl | day |
| jMc6KbRUqK4ZXBrtQthl | hour |
| jMc6KbRUqK4ZXBrtQthl | minute |
| jMc6KbRUqK4ZXBrtQthl | ampm |
| jMc6KbRUqK4ZXBrtQthl | g-recaptcha-response |
| o5vz1Xq7pfHMvOemd3Bz | additionalInfo |
| OSrpNHdXdIJRVUtnkksp | minute |
| OSrpNHdXdIJRVUtnkksp | ampm |
| PUDF2a0hb9oyVDFFWHOS | additionalInfo |
| tl1xNwHZnAQ4BuZ5Tz5T | additionalInfo |

# Null Values
None found.

# Publication Mapping
Rules applied in order: `status == "approved"`, otherwise `hidden == "no"`, otherwise `status == "rejected"`, otherwise `status == "archived"`, otherwise `pending`.

| Canonical status | Record count |
| --- | --- |
| approved | 17 |
| pending | 5 |
| rejected | 0 |
| archived | 0 |

# Normalizations Required
| Normalization | Affected records/fields |
| --- | --- |
| blank day -> NULL | 1 |
| hour/minute/ampm -> meeting_time | 21 |
| hidden/status -> canonical status | 22 |
| empty additionalInfo -> NULL | 6 |
| Firestore timestamp -> ISO timestamp/PostgreSQL timestamptz | 6 |
| whitespace trimming | 4 |
| capitalization normalization | 1 |

# Record-Level Exceptions
| Document ID | Group title | Issue | Severity | Recommended action |
| --- | --- | --- | --- | --- |
| A0aD7IvBPNENd7UVxDC0 | Thursday Bible Study Group | Conflicting status/hidden: status=pending, hidden=no | warning | Mapping imports as approved; review whether status should be canonicalized first. |
| A0aD7IvBPNENd7UVxDC0 | Thursday Bible Study Group | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| A0aD7IvBPNENd7UVxDC0 | Thursday Bible Study Group | Empty additionalInfo | informational | Normalize empty additionalInfo to NULL where appropriate. |
| C8n9EU5i2YwLkXdtoh1X | Heaven Bound Balloon Team | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| C8n9EU5i2YwLkXdtoh1X | Heaven Bound Balloon Team | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| C8n9EU5i2YwLkXdtoh1X | Heaven Bound Balloon Team | Whitespace trimming needed: description | informational | Trim description during transformation. |
| DpLKywvIeHlQM15Fp3zR | MomCo Lifegate Denver | Conflicting status/hidden: status=pending, hidden=no | warning | Mapping imports as approved; review whether status should be canonicalized first. |
| DpLKywvIeHlQM15Fp3zR | MomCo Lifegate Denver | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| DpLKywvIeHlQM15Fp3zR | MomCo Lifegate Denver | Empty additionalInfo | informational | Normalize empty additionalInfo to NULL where appropriate. |
| dR5jeOduJWQt2y84nAfA | Touched by Adoption | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| dR5jeOduJWQt2y84nAfA | Touched by Adoption | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| EAz541Amiv4dho87o8U9 | Creatives & Entreprenuers | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| EAz541Amiv4dho87o8U9 | Creatives & Entreprenuers | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| EAz541Amiv4dho87o8U9 | Creatives & Entreprenuers | Whitespace trimming needed: description | informational | Trim description during transformation. |
| f9XQ35zFoqW1in7BjmRc | Young Dad's Group | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| f9XQ35zFoqW1in7BjmRc | Young Dad's Group | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| f9XQ35zFoqW1in7BjmRc | Young Dad's Group | Whitespace trimming needed: description | informational | Trim description during transformation. |
| fBKKZYJl8MJQv5pSSMGL | 3 Is 1 "The Check In" | Conflicting status/hidden: status=pending, hidden=no | warning | Mapping imports as approved; review whether status should be canonicalized first. |
| fBKKZYJl8MJQv5pSSMGL | 3 Is 1 "The Check In" | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| fBKKZYJl8MJQv5pSSMGL | 3 Is 1 "The Check In" | Empty additionalInfo | informational | Normalize empty additionalInfo to NULL where appropriate. |
| GilRsIlxqQM4uL2YQjGT | Lazy Saturday morning Men's Group | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| GilRsIlxqQM4uL2YQjGT | Lazy Saturday morning Men's Group | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| Heppp6topjLKtBp0SAcc | Women's Bible Study | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| Heppp6topjLKtBp0SAcc | Women's Bible Study | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| jaSZsNWMFgZFZN7FxWeG | Good Beginnings | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| jaSZsNWMFgZFZN7FxWeG | Good Beginnings | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | Blank day | informational | Normalize blank day to NULL. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | Whitespace trimming needed: city | informational | Trim city during transformation. |
| jMc6KbRUqK4ZXBrtQthl | Sacred Circles — Women walking together in sisterhood in Christ | Unexpected field: g-recaptcha-response | informational | Preserve in audit/export; decide whether to map or ignore during import. |
| mnLsLDfzEBaKgcdaCqdb | Bible Study for 20/30 Somethings | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| mnLsLDfzEBaKgcdaCqdb | Bible Study for 20/30 Somethings | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| Mr6axp8Fprtws27RU4h6 | Freedom fight \| men breaking free from sexual sin | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| Mr6axp8Fprtws27RU4h6 | Freedom fight \| men breaking free from sexual sin | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| o5vz1Xq7pfHMvOemd3Bz | Shine Cheer and Dance Cheer Class | Conflicting status/hidden: status=pending, hidden=no | warning | Mapping imports as approved; review whether status should be canonicalized first. |
| o5vz1Xq7pfHMvOemd3Bz | Shine Cheer and Dance Cheer Class | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| o5vz1Xq7pfHMvOemd3Bz | Shine Cheer and Dance Cheer Class | Empty additionalInfo | informational | Normalize empty additionalInfo to NULL where appropriate. |
| oG7199pPB6fE5DdTw9hy | Perspectives Class | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| oG7199pPB6fE5DdTw9hy | Perspectives Class | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | Invalid day: TBD | blocking | Set day to a valid weekday or NULL. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | Incomplete meeting time | warning | Review hour/minute/ampm before converting to meeting_time. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| OSrpNHdXdIJRVUtnkksp | Home School Hangouts | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| PUDF2a0hb9oyVDFFWHOS | Monthly Cycling Group | Conflicting status/hidden: status=pending, hidden=no | warning | Mapping imports as approved; review whether status should be canonicalized first. |
| PUDF2a0hb9oyVDFFWHOS | Monthly Cycling Group | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| PUDF2a0hb9oyVDFFWHOS | Monthly Cycling Group | Empty additionalInfo | informational | Normalize empty additionalInfo to NULL where appropriate. |
| QzJf3pukjB4jDc8JYkgV | Men Alive | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| QzJf3pukjB4jDc8JYkgV | Men Alive | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| R0UUk5YPbAEbtRlTP8z4 | 2nd Sunday Lunch and Chat | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| R0UUk5YPbAEbtRlTP8z4 | 2nd Sunday Lunch and Chat | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| SrAJY0Lx90ghAwMlYm9s | Moms Meet-up | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| SrAJY0Lx90ghAwMlYm9s | Moms Meet-up | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| tl1xNwHZnAQ4BuZ5Tz5T | Practicing the Way | Conflicting status/hidden: status=pending, hidden=no | warning | Mapping imports as approved; review whether status should be canonicalized first. |
| tl1xNwHZnAQ4BuZ5Tz5T | Practicing the Way | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| tl1xNwHZnAQ4BuZ5Tz5T | Practicing the Way | Empty additionalInfo | informational | Normalize empty additionalInfo to NULL where appropriate. |
| wXjZduvItba0CfncL8TH | Missions Collective | Missing submittedAt | warning | Import as NULL only if acceptable; otherwise backfill timestamp. |
| wXjZduvItba0CfncL8TH | Missions Collective | Missing coordinates | informational | Import latitude/longitude as NULL or geocode later. |
| wXjZduvItba0CfncL8TH | Missions Collective | Capitalization normalization needed: hidden | warning | Normalize hidden capitalization. |

# Migration Readiness Assessment
Manual corrections are required before import because at least one blocking issue was found. Resolve blocking issues, then rerun this audit before building or running the importer.

Final recommendation: **Manual corrections required before import**.
