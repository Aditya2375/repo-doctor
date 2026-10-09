# Repo Doctor

Paste a public GitHub repository link and get a review report from four reviewers: architecture, security, performance and style. Every finding points to a file and line, says why it matters and how to fix it.

It is rule-based static analysis that runs in your browser. There is no AI model and no server. The page reads the repository straight from GitHub and the analysis runs on your device.

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
