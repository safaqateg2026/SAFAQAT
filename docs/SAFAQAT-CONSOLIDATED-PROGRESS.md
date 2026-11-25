# SAFAQAT consolidated implementation progress

## Completed in current resume
- Backend registration validation recognizes `bicycle` and rejects any bicycle plate values.
- Added forward-only migration `0012_bicycle_delivery.sql`, which copies all delivery rows and restores the courier-role trigger while expanding the allowed vehicle type.

## Remaining
- Implement and translate the four vehicle choices, plate artwork overlays, and bicycle form behavior.
- Add verification dossier, locked document-derived fields, and sample-only guided document/face capture interfaces.
- Add deterministic vehicle-photo requirement rules and tests.
- Add and run backend migration tests plus frontend lint, TypeScript, tests, and production build sequentially with low memory.
- Commit only task-related files, push `feature/landing-pwa`, prepare isolated release worktree, and report readiness. Do not apply production migrations or deploy.
- Milestone 2: added the four vehicle options to Arabic/English registration and made plate inputs read-only overlays on the approved original artwork. Bicycle hides plate artwork and fields.
- Milestone 3: added deterministic backend and frontend vehicle-photo requirement rules. Unknown vehicle ownership leads to manual review for car/truck; owner status is never inferred.
- Remaining: reusable verification dossier/locked document fields, expanded guided capture instructions and face steps, tests, sequential validation, isolated release worktree, and task-only commit/push.
- Milestone 4: added a reusable read-only verification dossier with role-appropriate document field sets and explicit unavailable/trusted-result messaging. Retailer identity documents remain omitted to preserve the approved retailer onboarding rule.
- Milestone 5: camera workflow provides rear-camera document capture with landscape rectangular guide and quality feedback, plus front-camera live preview and manual front/right/left prompts. No pose detection or video retention is claimed. Added migration-preservation and vehicle-rules tests.
- Milestone 6: role-scoped verification dossier and read-only empty document results are wired into registration. Document guidance uses rear camera, landscape framing and manual quality feedback. Face preview uses front camera with manual front/right/left prompts only. Vehicle capture items now vary by selected vehicle. Unknown car/truck ownership is explicitly routed to manual review and never trusted from client input.
- Remaining: isolated synthetic plate fixture and any missing capture/role tests, validate every sequence, fix errors, verify current migration and plate assets, update this log, task-only commit/push, remote verification, isolated release worktree.

## Validation checkpoint
- ESLint: passed without warnings after plate artwork switched to Next Image.
- TypeScript: passed (`tsc --noEmit --incremental false`).
- Node tests: all 5 test files passed, including registration, bicycle validation, and vehicle evidence rules.
- Python/SQLite tests: all 5 passed, including migration row preservation, bicycle acceptance, trigger and foreign-key checks.
- Static production build: passed using one worker and 768 MB Node heap. No production migration or deployment was run.
- Next: inspect exact task-only staged files, commit and push feature branch, confirm remote commit, then create an isolated release worktree.
