# GitHub Support request — remove cached commits containing private data

**Status (checked 2026-11-07 from the public internet):**

| Commit | `tests/fixtures/foods-160.csv` (private 160-food table, 13,451 bytes) |
| --- | --- |
| `a7b5bbbda5c78a1c50367c0b1da7fae7800c8d49` | **still downloadable** (HTTP 200) |
| `3fb3c82a557e243cfe26919632b44d013ac561b1` | **still downloadable** (HTTP 200) |
| `2523513a3a34218c388f1d3df4ce0ebceee6c934` | not present (404) |
| `5bc5b6b3b8beaaa64eb4adddeca74b2d61c98e81` | not present (404) |
| current branch `claude/nutrition-tracking-app-989rku` | not present (404) — removed from history |

The file is no longer in any branch (history was rewritten and force-pushed after a private backup was confirmed).
The two commits remain reachable only by their SHA, because GitHub keeps unreferenced objects and the old
GitHub Actions runs #2 and #3 still reference them. Only GitHub Support can purge them.

## What only you can do

1. Open https://support.github.com/contact while signed in as **Mego2012** (the repository owner).
2. Choose the topic for removing sensitive data / cached views from a repository, and paste the text below.
3. Optional, before sending: in the repository's **Actions** tab, delete workflow runs **#2** ("v2: recipe library…",
   commit a7b5bbb) and **#3** ("Fix mobile touch scrolling…", commit 3fb3c82). They only hold old CI logs; deleting
   them removes two of the references. (Not done automatically: deleting is irreversible and was not explicitly requested.)
4. Before sending, check the repository's **Forks** count on its GitHub page; if any fork exists, mention it in the request.

## Text to paste

> Subject: Request to remove cached commits containing private data — Mego2012/Mego
>
> Hello GitHub Support,
>
> I am the owner of the repository https://github.com/Mego2012/Mego. A file containing my private nutrition data,
> `tests/fixtures/foods-160.csv`, was committed by mistake. I have rewritten the history and force-pushed, so the
> file is no longer in any branch, but these two commits are still accessible by SHA:
>
> - https://github.com/Mego2012/Mego/commit/a7b5bbbda5c78a1c50367c0b1da7fae7800c8d49
> - https://github.com/Mego2012/Mego/commit/3fb3c82a557e243cfe26919632b44d013ac561b1
>
> (for example https://raw.githubusercontent.com/Mego2012/Mego/a7b5bbbda5c78a1c50367c0b1da7fae7800c8d49/tests/fixtures/foods-160.csv)
>
> Please remove the cached views of these commits, dereference them (they are referenced by the GitHub Actions
> runs of the workflow "Test & deploy to GitHub Pages", runs #2 and #3), and run garbage collection on the
> repository so the file can no longer be retrieved. No pull requests reference these commits.
>
> Thank you.

After GitHub confirms, re-check with:
`curl -s -o /dev/null -w '%{http_code}\n' https://raw.githubusercontent.com/Mego2012/Mego/a7b5bbbda5c78a1c50367c0b1da7fae7800c8d49/tests/fixtures/foods-160.csv` (expect 404; same for 3fb3c82…).
