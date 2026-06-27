# First GitHub Push Recipe

Three git-ops gotchas that bit during the 2026-06-26/27 force-push chain —
distilled into a checklist so the next bad-push recovery is mechanical
instead of a debugging spiral.

## 1. Rescuing an over-broad initial push

When `gh repo create --source=. --push` (or any recursive `git add`) drags in
directories you did NOT intend (`.github/`, `.husky/`, `coverage.json`,
`dev-docs/`), the cleanup path is staged deletions + force-push. Working tree
is preserved; only the index changes.

```bash
# Stage deletions for the offending directories (keeps the files on disk).
git rm --cached -rf .github .husky

# Re-stage the planned paths your real commit was meant to add.
git add app.py routes/ static/ tests/ scripts/ services/ README.md CHANGELOG.md \
        .gitignore .env.example docs/

# Confirm the staged set is what you expect (see §3 for the right filter).
git diff --cached --diff-filter=A --name-only

git commit --no-verify -m "chore: drop accidentally-staged dev tooling from initial push"
git push --force-with-lease origin main
```

**Note:** For directories that were already tracked in a prior commit (the
`.github/` case we hit), `git rm --cached -r <dir>` stages a deletion in
your new commit -- the path stays in the prior commits' hash chain, but
the `.gitignore` rule keeps new commits clean. For never-tracked
directories, prefer adding to `.gitignore` and re-staging instead.

**Decision framework:** Pick by repo-privacy + commit-graph-shape, not by gut.

Both paths recover from an over-broad push, but they differ in what gets
cleaned and what collateral damage happens. Pull from two primary
criteria:

| Criterion                     | `git push --force-with-lease`                                            | `gh repo delete` + recreate                                                                |
|-------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| **Repo privacy**              | Private only. Public repos keep orphan commits in the fetch-graph window. | Either. Full state reset at the URL; orphan-window is no longer a factor.                  |
| **Commit graph**              | Linear main, no PRs/tags/releases you must keep.                          | Tangled graph with branches/tags/releases — all gone with the delete.                     |
| **Leaked-content risk**       | Tolerable IF the orphan touches nothing sensitive.                       | Mandatory: rotate every credential referenced in the orphaned commits afterward.           |
| **Collateral damage**         | None. Issues, PR cross-refs, clone URLs keep working.                    | Full reset. URL may change, every collaborator re-clones, tags/Releases are gone.         |
| **Operator scope**            | None extra.                                                              | `gh auth refresh -s delete_repo --hostname github.com` (one-time), then `gh repo create --private --source=. --push`. Run on a **real terminal** — the OAuth consent redirect cannot complete inside a spawned agent's bash subshell. |

**Rule of thumb:**

1. *Over-broad but PRUNE-able* — `.github/`, `.husky/`, `coverage.json`
   slipped in; single committer; single-branch main. Use
   `git push --force-with-lease`. Fast, no scope dance, paper-trail intact.
2. *Over-broad AND CONTAINS secrets* — real keys, customer PII, internal
   IPs, prod tokens leaked into the orphan. Use delete-and-recreate, then
   **rotate the credential anyway** because GitHub keeps cached/forks for
   a window that defies any single delete. Force-push on a public repo
   leaves orphans in the public fetch window indefinitely; rewriting
   history does NOT shrink the blast radius on its own.
3. *Tangled graph* — branches, tags, releases, post-mortems you cannot
   rebuild. **Use force-push** because `git reflog` (~30 days) preserves
   the orphan chain on each collaborator's clone, making recovery
   possible. **Delete-and-recreate is irreversible** — every prior tag
   reference, every fork, every paper-trail evaporates.

The OFP case at `niko4244/openfieldpro` matched rule (1) — private repo,
no secrets, prune-able paths only. This framework is here so a future
operator doesn't reach for force-push when rules (2) or (3) actually
apply.

## 2. Detecting cwd-leak failures early

A spawned bash session's default cwd may not be the target repo — it can be
the umbrella repo (e.g. `/c/Users/nikma/` on a Brainz checkout) where
destructive-looking git commands silently mutate the wrong project. Add a
post-`cd` sanity check before any state-mutating operation:

```bash
cd /path/to/target-repo
git remote get-url origin                            # cwd-leak sanitizer -- must match intended push URL
git rev-parse --is-inside-work-tree                  # confirms we're in a git repo (any repo)
git branch --show-current                            # must match expected branch

# Or, belt-and-suspenders, use absolute paths for every command:
git -C /path/to/target-repo status --short
git -C /path/to/target-repo push --force-with-lease origin main
```

The `git remote get-url origin` line is the actual cwd-leak sanitizer --
`git rev-parse --is-inside-work-tree` only proves you're in *some* git
repo, not necessarily the right one. Confirm the remote URL matches the
intended push target before running any state-mutating op.

## 3. Leak detection in the staged set

`git diff --cached --name-only` returns ALL staged paths — additions,
modifications, AND deletions. When you intentionally stage a deletion via
`git rm --cached`, that path appears in the output and can fool a
leak-detection grep into matching your own staged deletion as a "leak."

```bash
# Bad (matches additions + modifications + deletions):
git diff --cached --name-only | grep -E '^\.github/'

# Good (only additions — staged deletions are filtered out):
git diff --cached --name-only --diff-filter=A | grep -E '^\.github/'
```

Other diff-filter letters:

| Filter | Matches                         |
|--------|---------------------------------|
| `A`    | Added                           |
| `M`    | Modified                        |
| `D`    | Deleted                         |
| `R`    | Renamed                         |
| `C`    | Copied                          |
| `T`    | Type changed (e.g. symlink → file) |

For a typical "did I leak directories into this commit?" check,
`--diff-filter=A` is the right filter. For a "did I accidentally delete one of
my holdbacks?" check, use `D`.

## Holdback-list reference

The OFP push used a 10-item holdback list to keep `.env`, store files, dev
notes, and CI templates out of GitHub. Paste this into any future
leak-detection step. The pattern is a substring match (no `^` or `$`
anchors) -- any path containing one of the listed names triggers a hit.
That trades some over-match (e.g. `xyz-coverage.json`) for consistency;
none of those substrings appear in legitimate OFP code paths so the
collision risk is zero in practice:

```bash
HOLD='\.env|\.ofp-store\.json|coverage\.json|TODO\.md|Agents/|dev-docs/|docs/windows-port|\.github/|\.husky/|\.pre-commit-config\.yaml'
git diff --cached --name-only --diff-filter=A | grep -E "$HOLD" || echo OK_clean
```

The list is held back per the "minimum: code + tests + docs only" intent;
extend it deliberately, never via accidental recursive staging. Once a held
directory makes it into a committed snapshot, clean it up with
`git rm --cached -rf <dir>` from §1 — it is cheaper than `gh repo delete`
when scope is missing.

## Recovery checklist (TL;DR)

1. `cd /path/to/target-repo && git remote get-url origin` — confirm cwd and remote.
2. `git diff --cached --name-only --diff-filter=A < /tmp/empty` — confirm staged
   set is intentional.
3. `git rm --cached -rf <leaked_dir>` — stage deletions for unwanted paths.
4. `git commit --no-verify` — bypass the husky CSS lint hook for infra edits.
5. `git push --force-with-lease origin main` — refuse if remote moved.
6. Fetch the GitHub tree to a local file (`gh api ... git/trees/main?recursive=1
   --jq '.tree[].path'`) and re-run the holdback regex on it.
7. If the push landed clean, you're done. If it landed wider than intended,
   repeat 1–6 with a tighter add set.
