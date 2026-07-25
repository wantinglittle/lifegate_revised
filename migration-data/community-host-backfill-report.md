# Community Host Backfill Report

- Execution mode: apply
- Execution timestamp: 2026-07-24T20:45:48.890Z
- Supabase host: dsrilmjpgpgdxzvzwyqw.supabase.co
- Groups inspected: 20
- Auth users inspected: 3
- Portal users inspected: 3
- Final status: completed
- Failing group: not applicable
- Error message: not applicable
- Contact emails are not included in this report.
- Firebase was not modified.

## Summary

| Metric | Count |
| --- | --- |
| communityHostsCreated | 19 |
| communityHostsReused | 0 |
| portalUsersCreated | 19 |
| portalUsersReused | 0 |
| portalUsersUpdated | 0 |
| groupsAssigned | 20 |
| groupsAlreadyAssigned | 0 |
| adminsPreserved | 0 |
| skippedBlankEmails | 0 |
| skippedInvalidEmails | 0 |
| ownershipConflicts | 0 |
| invitationsSent | 19 |

## Rollback Inputs

Groups assigned in this run can be reverted by clearing `groups.owner_user_id` for these IDs after review:

| Group | Assigned owner_user_id |
| --- | --- |
| A0aD7IvBPNENd7UVxDC0 / Thursday Bible Study Group | 57f2d1e5-55b9-4265-804b-6d159dfd4c31 |
| DpLKywvIeHlQM15Fp3zR / MomCo Lifegate Denver | d51f6af8-f37f-4240-92d3-3306acb368f0 |
| dR5jeOduJWQt2y84nAfA / Touched by Adoption | 499f88ee-491a-49ba-ab87-a5f97937158e |
| EAz541Amiv4dho87o8U9 / Creatives & Entreprenuers | 441a355a-8f94-4353-a720-c992ec3f8d45 |
| f9XQ35zFoqW1in7BjmRc / Young Dad's Group | 73e2af27-df86-4eae-8d1e-143fad288b38 |
| fBKKZYJl8MJQv5pSSMGL / 3 Is 1 "The Check In" | 9bad6b23-40c6-45ba-b31a-83bc5a4d896b |
| GilRsIlxqQM4uL2YQjGT / Lazy Saturday morning Men's Group | c7eeb087-8e72-4fe9-95b6-32a54fc454b2 |
| Heppp6topjLKtBp0SAcc / Women's Bible Study | 4de8ab6b-5cea-4c12-b169-2eec6d4e4af5 |
| jaSZsNWMFgZFZN7FxWeG / Good Beginnings | 9a8c6e32-5dea-4d37-b2d0-187f05d2cecc |
| mnLsLDfzEBaKgcdaCqdb / Bible Study for 20/30 Somethings | d60727ac-534e-42f5-85c3-ffbb4915d3bb |
| Mr6axp8Fprtws27RU4h6 / Freedom fight \| men breaking free from sexual sin | 3f23f577-400d-4793-84c1-6215b8218db7 |
| o5vz1Xq7pfHMvOemd3Bz / Shine Cheer and Dance Cheer Class | 67844f81-6483-42c7-832a-9977bc30b1ee |
| oG7199pPB6fE5DdTw9hy / Perspectives Class | 22a567e3-4167-47c6-8a6e-9d90217f6b1d |
| OSrpNHdXdIJRVUtnkksp / Home School Hangouts | 499f88ee-491a-49ba-ab87-a5f97937158e |
| PUDF2a0hb9oyVDFFWHOS / Monthly Cycling Group | e27a2a42-c5d8-4ff4-9835-d141b0418bf1 |
| QzJf3pukjB4jDc8JYkgV / Men Alive | a872d3d8-7c62-465c-940a-d7325fb3467a |
| R0UUk5YPbAEbtRlTP8z4 / 2nd Sunday Lunch and Chat | 4929bd50-35ff-4aa2-9929-789eaac2ad3f |
| SrAJY0Lx90ghAwMlYm9s / Moms Meet-up | 6bcf7e0c-00ab-4ea0-bc02-cb346fcea1bf |
| tl1xNwHZnAQ4BuZ5Tz5T / Practicing the Way | fb7ff25e-6b46-4b90-9ff5-a38b92015be4 |
| wXjZduvItba0CfncL8TH / Missions Collective | 7afc7725-d3d2-4c3f-a017-97383884e5b1 |

Portal users created in this run can be removed after their assigned groups are reverted:

| Created portal user_id |
| --- |
| 57f2d1e5-55b9-4265-804b-6d159dfd4c31 |
| d51f6af8-f37f-4240-92d3-3306acb368f0 |
| 499f88ee-491a-49ba-ab87-a5f97937158e |
| 441a355a-8f94-4353-a720-c992ec3f8d45 |
| 73e2af27-df86-4eae-8d1e-143fad288b38 |
| 9bad6b23-40c6-45ba-b31a-83bc5a4d896b |
| c7eeb087-8e72-4fe9-95b6-32a54fc454b2 |
| 4de8ab6b-5cea-4c12-b169-2eec6d4e4af5 |
| 9a8c6e32-5dea-4d37-b2d0-187f05d2cecc |
| d60727ac-534e-42f5-85c3-ffbb4915d3bb |
| 3f23f577-400d-4793-84c1-6215b8218db7 |
| 67844f81-6483-42c7-832a-9977bc30b1ee |
| 22a567e3-4167-47c6-8a6e-9d90217f6b1d |
| e27a2a42-c5d8-4ff4-9835-d141b0418bf1 |
| a872d3d8-7c62-465c-940a-d7325fb3467a |
| 4929bd50-35ff-4aa2-9929-789eaac2ad3f |
| 6bcf7e0c-00ab-4ea0-bc02-cb346fcea1bf |
| fb7ff25e-6b46-4b90-9ff5-a38b92015be4 |
| 7afc7725-d3d2-4c3f-a017-97383884e5b1 |

Auth users created/invited in this run can be disabled or deleted through Supabase Auth Admin tooling after portal rows and ownership assignments are reverted:

| Created Auth user_id | First source group |
| --- | --- |
| 57f2d1e5-55b9-4265-804b-6d159dfd4c31 | A0aD7IvBPNENd7UVxDC0 / Thursday Bible Study Group |
| d51f6af8-f37f-4240-92d3-3306acb368f0 | DpLKywvIeHlQM15Fp3zR / MomCo Lifegate Denver |
| 499f88ee-491a-49ba-ab87-a5f97937158e | dR5jeOduJWQt2y84nAfA / Touched by Adoption |
| 441a355a-8f94-4353-a720-c992ec3f8d45 | EAz541Amiv4dho87o8U9 / Creatives & Entreprenuers |
| 73e2af27-df86-4eae-8d1e-143fad288b38 | f9XQ35zFoqW1in7BjmRc / Young Dad's Group |
| 9bad6b23-40c6-45ba-b31a-83bc5a4d896b | fBKKZYJl8MJQv5pSSMGL / 3 Is 1 "The Check In" |
| c7eeb087-8e72-4fe9-95b6-32a54fc454b2 | GilRsIlxqQM4uL2YQjGT / Lazy Saturday morning Men's Group |
| 4de8ab6b-5cea-4c12-b169-2eec6d4e4af5 | Heppp6topjLKtBp0SAcc / Women's Bible Study |
| 9a8c6e32-5dea-4d37-b2d0-187f05d2cecc | jaSZsNWMFgZFZN7FxWeG / Good Beginnings |
| d60727ac-534e-42f5-85c3-ffbb4915d3bb | mnLsLDfzEBaKgcdaCqdb / Bible Study for 20/30 Somethings |
| 3f23f577-400d-4793-84c1-6215b8218db7 | Mr6axp8Fprtws27RU4h6 / Freedom fight \| men breaking free from sexual sin |
| 67844f81-6483-42c7-832a-9977bc30b1ee | o5vz1Xq7pfHMvOemd3Bz / Shine Cheer and Dance Cheer Class |
| 22a567e3-4167-47c6-8a6e-9d90217f6b1d | oG7199pPB6fE5DdTw9hy / Perspectives Class |
| e27a2a42-c5d8-4ff4-9835-d141b0418bf1 | PUDF2a0hb9oyVDFFWHOS / Monthly Cycling Group |
| a872d3d8-7c62-465c-940a-d7325fb3467a | QzJf3pukjB4jDc8JYkgV / Men Alive |
| 4929bd50-35ff-4aa2-9929-789eaac2ad3f | R0UUk5YPbAEbtRlTP8z4 / 2nd Sunday Lunch and Chat |
| 6bcf7e0c-00ab-4ea0-bc02-cb346fcea1bf | SrAJY0Lx90ghAwMlYm9s / Moms Meet-up |
| fb7ff25e-6b46-4b90-9ff5-a38b92015be4 | tl1xNwHZnAQ4BuZ5Tz5T / Practicing the Way |
| 7afc7725-d3d2-4c3f-a017-97383884e5b1 | wXjZduvItba0CfncL8TH / Missions Collective |

## Skips And Conflicts

Skipped blank contact emails:

None.

Skipped invalid contact emails:

None.

Ownership conflicts:

None.

Auth duplicate conflicts:

None.

Portal email conflicts:

None.

Runtime errors:

None.

## Other Details

Reused Auth users:

None.

Reused portal users:

None.

Portal users with blank names filled:

None.

Admins preserved:

None.

Groups already assigned:

None.

