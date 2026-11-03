# Repo Doctor

Paste a public GitHub repository link and get a review report from four reviewers: architecture, security, performance and style. Every finding points to a file and line, says why it matters and how to fix it.

It is rule-based static analysis that runs in your browser. There is no AI model and no server. The page reads the repository straight from GitHub and the analysis runs on your device.

Live: https://repo-doctor-cyan.vercel.app

## Use it

Open `index.html` through any static server, for example:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000` and paste `github.com/owner/repo`. You can also link directly with `?repo=owner/repo`.

Reports can be downloaded as Markdown or JSON.

## What the reviewers check

- **Architect:** missing README, license, tests, CI or .gitignore; files over 800 lines; functions over 80 to 100 lines; directories with more than 60 files; unpinned or unlocked dependencies.
- **Security:** committed private keys, cloud and GitHub and Slack tokens, hardcoded secrets, `.env` and key files, `eval`, shell commands built from strings, `innerHTML`, unsafe `pickle` and `yaml.load`, disabled TLS verification, weak hashes, SQL built by string formatting, debug mode left on.
- **Performance:** `await` inside loops, synchronous file calls, `SELECT *`, whole-library imports, large files and images, string concatenation in loops, images without dimensions.
- **Style:** unfinished markers, `console.log`, `var`, loose equality, bare `except`, `print` in library code, very long lines, mixed indentation.

Scores start at 100. Findings subtract points by severity, and one noisy rule cannot take more than 30 points.

## Limits

- These are pattern rules. Some findings will be false alarms, which is why each shows the line and the reason.
- At most 160 files of up to 150 KB each are read. Vendored, lock and minified files are skipped, and the report says so.
- A clean score is not a security audit.
- Public repositories only. GitHub allows 60 metadata requests an hour per network. File contents come from raw.githubusercontent.com and do not use that quota.

## Tests

```
node --test tests/analyzers.test.js
```


## Review boundaries and failure handling

A report is pinned to an immutable commit SHA, including its file links and exports. Reading uses three GitHub API requests (metadata, commit and tree), then up to 160 raw text files of150KB each across six workers. Requests time out after20seconds, cancellation reaches every stage, and response bodies have byte limits. Some file failures produce an explicitly incomplete report; zero readable candidates produces an error, not a clean bill of health. Rate-limit or access errors are shown without retry loops.

No sign-in, token collection or server storage. Only public repositories. All findings are rule-based heuristics that can miss vulnerabilities and produce false positives, never proof of safety or a substitute for a security audit. Coverage excludes large files, vendored/minified code and unsupported formats. Tests: `node --test tests/*.test.js`. No runtime/build dependencies. GitHub/Vercel control service availability and hosting headers.
