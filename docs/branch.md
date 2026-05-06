# Branch workflow — push a feature branch to master

How to take work from a feature branch onto master without breaking
production. Two paths: PR-based (recommended for review trail) or
local fast-forward (faster for simple changes).

> Per CLAUDE.md Critical Rule #10: never edit master directly. Always
> branch first, even for one-line changes.

---

## Prerequisites for any merge

- [ ] You're on a feature branch (`git branch --show-current` is **not** master)
- [ ] `pnpm smoke` passes locally (typecheck + lint + test:unit + next build)
- [ ] Your branch is pushed to `origin/<branch>`
- [ ] Master hasn't moved underneath you, OR you've rebased on top of it

---

## Option A — merge via Pull Request (recommended)

After the push, GitHub prints a URL like:

```
https://github.com/Parvinder123456/automatebro/pull/new/feat/<short-name>
```

1. **Open it in browser** → click "Create pull request"
2. **Review the diff** in the GitHub UI — every file changed, line by line
3. **Wait for Vercel preview** to deploy (gets posted as a comment on the PR after ~2 min)
4. **Click the preview URL** → click around the new feature
5. If happy → "Squash and merge" (clean history) or "Merge" (preserves all your commits)
6. **Delete the branch** when GitHub prompts

After merge, sync your local master:

```bash
git checkout master
git pull origin master
git branch -d feat/<short-name>      # delete local branch
```

---

## Option B — fast-forward merge locally (no PR)

```bash
# you're on feat/<short-name>, smoke is green, branch is pushed
git checkout master
git pull origin master                       # confirm master hasn't moved underneath you
git merge --ff-only feat/<short-name>        # fast-forward only — refuses if branches diverged
git push origin master
git branch -d feat/<short-name>              # local cleanup
git push origin --delete feat/<short-name>   # remote cleanup
```

If `--ff-only` errors out ("not possible to fast-forward"), it means
master moved while you were working. Rebase first:

```bash
git checkout feat/<short-name>
git rebase master                       # replay your commits on top of new master
# resolve any conflicts → git add → git rebase --continue
pnpm smoke                              # re-run smoke after rebase
git push --force-with-lease             # required after rebase; --force-with-lease is safe
                                        #   (refuses if someone else pushed)
git checkout master
git merge --ff-only feat/<short-name>
git push origin master
```

---

## Mistakes to avoid

1. **Never `git push origin master` directly without going through a feature branch.** The
   `check-branch.sh` hook blocks commits on master, but pushes from a separate clone could slip
   through.
2. **Never `git merge` without `--ff-only`** unless you specifically want a merge commit. Plain
   merge creates merge bubbles in history that are hard to read.
3. **Never `git push --force` without `--with-lease`.** `--force-with-lease` refuses if someone
   else pushed in the meantime; plain `--force` would clobber their work.
4. **Don't skip `pnpm smoke`.** That's the only gate before code reaches users. CLAUDE.md §12.8
   makes it mandatory.
5. **Don't merge without checking the diff.** `git diff master..feat/<name>` in the terminal or
   the GitHub PR diff. Catches "I forgot to delete a console.log" 9 times out of 10.

---

## Quick reference card

| Goal | Command |
|---|---|
| Start a feature | `git checkout master && git pull && git checkout -b feat/<name>` |
| Smoke gate | `pnpm smoke` |
| Push branch | `git push -u origin feat/<name>` |
| Open PR | Click the URL GitHub printed |
| Merge to master locally | `git checkout master && git merge --ff-only feat/<name> && git push origin master` |
| Delete branch (local + remote) | `git branch -d feat/<name> && git push origin --delete feat/<name>` |
| Rebase if master moved | `git rebase master` then `git push --force-with-lease` |

---

## When rebasing onto a moved master with conflicts

This is the trickiest case. Example: you branched off `master@v1`, master
moved to `master@v2`, your branch has its own commits, and the same
files were touched on both sides.

```bash
git checkout feat/<short-name>
git rebase master
# git stops at the first conflicting commit and lists files
git status                              # see which files have UU markers
```

For each conflict file:

```bash
# 1. Open the file in an editor.
# 2. Find conflict markers: <<<<<<< HEAD ... ======= ... >>>>>>> <commit>
# 3. Keep the version you want (or merge both manually).
# 4. Save.
git add <file>
```

Once all conflicts are resolved:

```bash
git rebase --continue
# repeat for each commit; rebase pauses on every conflicting commit
```

If a rebase goes badly and you want to abort:

```bash
git rebase --abort                      # drops you back to where you started
```

After rebase succeeds, **always re-run smoke**:

```bash
pnpm smoke
```

Rebases can introduce build breaks even with no apparent conflicts —
e.g. master added a new symbol that your branch references but didn't
import. Smoke catches this before push.

---

## When the rebase footprint surprises you

After a successful rebase, sometimes you'll see Biome auto-format diffs
across files that neither side edited. This is normal — Biome's
formatting rules picked up trailing-LF / line-wrap inconsistencies that
the rebase exposed. Two options:

- **Bundle into the rebase commit:** `git add -A && git commit --amend --no-edit`
  (only safe before push; rewrites the rebase head)
- **Add a separate follow-through commit:** `git commit -m "chore: post-rebase format pass"`
  (cleaner history, doesn't rewrite the dev's original commits)

Prefer the second option when collaborating — keeps the dev's authored
commits intact.
