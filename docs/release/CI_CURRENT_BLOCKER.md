# Current hosted CI blocker

As of July 12, 2026, OpenFieldPro release CI is not allocating runners for PR #7.

Observed behavior:

- five jobs are created for API, web, mobile, release safety, and operations visual QA;
- every job immediately concludes failure;
- every job has no steps;
- no logs or artifacts exist;
- re-running failed jobs reproduces the same zero-step state.

This is not an application test result. It is an unresolved GitHub Actions allocation/account-policy result. Follow `GITHUB_ACTIONS_ZERO_STEP_FAILURES.md` and attach the first workflow run that contains executable steps before merging PR #7.
