# GitHub Actions zero-step failure diagnosis

OpenFieldPro release CI is defined with ordinary `ubuntu-latest` jobs and explicit checkout, setup, install, build, test, browser, mobile, audit, and key-verification steps.

A workflow result is an infrastructure non-result when every job has all of the following:

- the job is created and immediately concludes `failure`;
- the GitHub API returns `steps: null` or no steps;
- no job log archive exists;
- no artifact exists;
- retrying failed jobs creates new jobs with the same zero-step result.

This pattern means no repository command ran. Do not modify application code or weaken the workflow to make this result appear green.

## Repository-owner checks

Review these GitHub settings:

1. **Repository → Settings → Actions → General**
   - Actions are enabled for the repository.
   - The allowed-action policy permits `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact`.
   - Fork pull-request restrictions are not incorrectly applied to same-repository branches.
2. **Account/organization billing and usage**
   - Actions spending limits are not set to zero.
   - No payment failure or usage suspension blocks hosted runners.
   - Included minutes or paid usage are available when required by the repository visibility/account plan.
3. **Organization policy**
   - GitHub-hosted runners are permitted.
   - The repository is not restricted to unavailable self-hosted runner labels.
   - Required approval policies are not leaving jobs unapproved.
4. **Enterprise policy**, when applicable
   - Actions and reusable actions are permitted for the repository.
   - IP allowlists and runner groups do not prevent hosted-runner allocation.
5. **GitHub status/support**
   - Check GitHub Actions service health.
   - If settings and billing are valid, provide GitHub Support with the workflow run ID and job IDs showing no steps/log blobs.

## Verification after correction

Rerun the existing failed workflow without changing the YAML. A healthy allocation must show at least:

```text
Set up job
Run actions/checkout@v4
```

Only after steps exist should a failure be treated as a repository build, test, or dependency issue.

## Merge policy

Security-sensitive pull requests remain on merge hold while required CI jobs have no executable result. A zero-step failure is not evidence that code failed, but it is also not evidence that code passed.
