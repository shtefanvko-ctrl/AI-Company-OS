# MB Monitoring Contract

This repository participates in the MB-file monitoring workflow.

## Purpose

Monitor selected GitHub and Google Drive sources and notify only when a change materially affects one or more of the following:

- project rules;
- an approved plan;
- changelog/release state;
- open or closed issues;
- Definition of Done (DoD);
- the current next step.

Cosmetic, formatting-only, comment-only, or otherwise non-actionable changes are ignored unless they alter one of the items above.

## Material change criteria

A change is material when it creates, removes, reorders, blocks, unblocks, or invalidates a concrete project action. Typical examples:

- a project rule or invariant changes;
- an approved plan is replaced, narrowed, expanded, or reordered;
- a changelog entry changes the release candidate or shipped state;
- an issue is created, closed, reopened, reprioritized, or its acceptance criteria materially change;
- DoD gains or loses a required verification/evidence step;
- the next step changes because a prerequisite is completed, failed, or superseded;
- a branch/PR/staging/deployed state contradicts the documented plan or release status.

## Baseline state

The monitoring baseline is the latest verified state, not simply the newest timestamp.

Prefer states in this order when they disagree:

1. Deployed and externally verified state.
2. Staging state that passed the project verification gate.
3. Merged default-branch state with passing required checks.
4. Approved/open PR state with passing checks.
5. Issue/plan/document intent not yet implemented.

A newer unverified artifact does not automatically replace an older verified baseline.

## Conflict handling

When PRs, issues, changelog, Drive documents, and deployed/staging state disagree:

- distinguish desired, implemented, verified, and deployed state;
- do not infer DONE from code presence alone;
- do not infer deployment from a merge or PR status;
- do not infer correctness from a changelog claim without the required evidence;
- prefer concrete verification evidence over descriptive text;
- report the contradiction only when it changes a rule, DoD, issue status, release state, or next action.

## Notification format

Every notification must contain exactly the decision-relevant information:

1. What changed.
2. Why it matters.
3. The concrete action created or changed.

If no material change exists, no project action is created.

## Scope

GitHub and selected Google Drive folders/files are monitored under the same criteria. Android-specific repositories are outside this MB workflow unless explicitly added later.
