# Applywright — copying the repository

*Three ways to get a working copy, and how to keep it in step afterwards. For installing,
configuring, seeding and deploying the copy, follow [`../FORK-AND-RUN.md`](../FORK-AND-RUN.md);
this file only covers the transport, so it does not repeat that guide.*

The licence is **MIT** (`LICENSE`, `package.json`), so copying, modifying and running a copy
is permitted under those terms. Collaboration is **fork-only**: Johan does not add
collaborators or hand out push access, so changes go back as a pull request or a patch
(see [`../CONTRIBUTING.md`](../CONTRIBUTING.md)).

Measured on 2026-10-28 against HEAD `24eb0e7`: the bundle is **4.33 MB** and the zip is
**3.4 MB** (3,517 KB). Both grow with history, so treat the numbers as a shape, not a promise.

---

## 1. Pick a route

| Your situation | Use | What you get | What you need |
|---|---|---|---|
| You have GitHub and may send changes back | **A. Fork and clone** | full history, `origin` yours, `upstream` for updates | a GitHub account, git, Node |
| No GitHub, but git is installed and you want history | **B2. `git bundle`** | full history and every branch, in one file | git, Node |
| No git at all, or you only want to read the code | **B1. zip** | the files at one commit, no history | a zip tool, Node (to run it) |

Every route ends the same way: install the one dependency and boot the server
(`FORK-AND-RUN.md` §4). Nothing here needs a key, an account or a network connection beyond
`npm install`.

---

## 2. A — Fork on GitHub, then clone your fork

The full version, including the two `node_modules` traps and the WSL filesystem advice, is
[`../FORK-AND-RUN.md`](../FORK-AND-RUN.md) §2. The short version:

1. On <https://github.com/johancilliers22/applywright>, press **Fork**. Your fork keeps the
   name and the `main` branch.
2. Clone **your** fork and add Johan's repository as `upstream`:

   ```powershell
   cd $HOME\Code
   git clone https://github.com/<your-account>/applywright.git
   cd applywright
   git remote add upstream https://github.com/johancilliers22/applywright.git
   git remote -v
   ```

   ```bash
   mkdir -p ~/Code && cd ~/Code
   git clone https://github.com/<your-account>/applywright.git
   cd applywright
   git remote add upstream https://github.com/johancilliers22/applywright.git
   git remote -v
   ```

   `git remote -v` should print four lines: `origin` pointing at your fork (fetch and
   push), and `upstream` pointing at `johancilliers22/applywright`.

`origin` is where you push; `upstream` is how you pull future changes (§4 below).

---

## 3. B — Without git or GitHub

### B1. Zip (no history)

**From GitHub, no commands.** Open the repository page → **Code** → **Download ZIP**. That
is a web action, so there is nothing here to verify; it gives you the default branch at the
time of download, with no `.git` directory.

**From a local clone, exact commands.** `git archive` writes a zip of one commit — here
`HEAD` — with the project in a top-level folder:

```powershell
cd C:\path\to\your\applywright
git archive --format=zip --prefix=applywright/ -o applywright.zip HEAD
Expand-Archive -Path .\applywright.zip -DestinationPath .\out -Force
```

```bash
cd ~/Code/applywright
git archive --format=zip --prefix=applywright/ -o applywright.zip HEAD
unzip -q applywright.zip -d out
```

The result is `out/applywright/` containing the tree and **no `.git`** — verified: the
archive expands to a directory with `package.json` and `README.md`, and no repository.
From there:

```powershell
cd .\out\applywright
npm install
node server/index.js
```

Limits worth knowing before you choose this route: no history, no branches, and no way to
merge later changes — updating means downloading again and diffing by hand. Use it to read
or demo, not to work over time.

### B2. `git bundle` (full history in one file)

A bundle is a single file git can clone from. It carries every ref with `--all`, so the
recipient gets the same history as a clone.

**On the machine that has the repository:**

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git bundle create applywright.bundle --all
```

Verified: that writes a **4.33 MB** file. Send it by whatever channel you already trust —
it is a repository, so treat it like the code, not like a secret.

**On the receiving machine** (git required, GitHub not):

```powershell
git clone applywright.bundle applywright
cd applywright
git log --oneline -1
```

```bash
git clone ./applywright.bundle applywright
cd applywright
git log --oneline -1
```

Verified: the clone lands on the bundled HEAD (`24eb0e7` at measurement) and is a normal
repository from there — branches, commits and the full gate all work. `origin` points at
the bundle file, which is fine for a read-only copy; if you later create your own GitHub
repository, repoint it:

```bash
git remote set-url origin https://github.com/<your-account>/applywright.git
git remote add upstream https://github.com/johancilliers22/applywright.git
git push -u origin main
```

Either B route still needs **Node 22.5 or newer** to run the app, and `npm install` for the
one dependency. The zip and bundle routes need no GitHub account at all.

---

## 4. Staying in sync

### Fork (A)

```bash
git fetch upstream
git switch main
git merge upstream/main
git push origin main
```

GitHub's **Sync fork** button does the same in the browser. If you have local work, rebase
or merge rather than reset: `git switch main && git pull --ff-only upstream main`, then
rebase your branch onto the updated `main`.

### Bundle (B2)

Ask the sender for a fresh bundle, then merge it exactly as you would a remote branch.
Verified flow:

```powershell
git fetch ..\applywright-2.bundle main
git merge --ff-only FETCH_HEAD
```

```bash
git fetch ~/Downloads/applywright-2.bundle main
git merge --ff-only FETCH_HEAD
```

`--ff-only` refuses if you have diverged, which is the safe failure: you then merge
deliberately instead of accidentally creating a tangled history. If the sender's update is
not a descendant of your work, use `git merge FETCH_HEAD` and resolve it.

### Zip (B1)

There is no merge. Download again into a **new** folder and compare; if you have made
changes, copy them across by hand. If you find yourself doing this more than twice, move to
a fork or a bundle — the history is worth more than the convenience you think you are
saving.

---

## 5. What not to do

- **Do not share one checkout between Windows and WSL.** `node_modules` is
  platform-specific; a copy installed under Windows can misbehave when Node runs under WSL.
  Clone once per environment (`FORK-AND-RUN.md` §2).
- **Do not clone into `/mnt/c` from WSL.** It works, but every read crosses the
  Windows/Linux boundary and the test suites slow noticeably. Use `~/Code`.
- **Do not commit `data/`, `.env` or `.env.local`.** All are gitignored. `data/` holds CV
  text and application history — personal data, even in a fork.
- **Do not point a copy's deployment at `intelligentartificial.net`.** That domain is
  Johan's. Use your own hostname, and ask before publishing a modified copy under any name
  (`docs/HANDOFF-FOR-A-FRIEND.md`, "Three things to ask Johan").
- **Do not share credentials or a database.** A copy gets its own `data/applywright.db`; it
  is not something to pass around.
- **Do not put a token in a remote URL** or on a command line. Use git's credential helper
  or `gh auth login`.

---

## 6. Next

| You want | Read |
|---|---|
| Prerequisites, install, seed, configuration, where to change things, your own deployment | [`../FORK-AND-RUN.md`](../FORK-AND-RUN.md) |
| The five-step path from "I have the link" to a running copy | [`HANDOFF-FOR-A-FRIEND.md`](HANDOFF-FOR-A-FRIEND.md) |
| How to send a change back | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| What the project is and what it refuses to do | [`PROJECT-STATUS.md`](PROJECT-STATUS.md), [`SPEC.md`](SPEC.md) §1 |
