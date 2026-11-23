# Repo Doctor

An inspection bench for public GitHub repositories. Four rule sets check architecture, security, performance and style. Open a finding to inspect its source context, why the pattern may matter and a suggested change. Repository-level checks can refer to a missing file or the repository rather than a line.

This is deterministic, rule-based static analysis in your browser. There is no remote analysis service, account, token or program execution. Findings can be false positives. Missing findings and high scores are not proof of correctness or safety.

Live: https://repo-doctor-cyan.vercel.app/

## Use it

Serve this folder over HTTP. There is no build step or runtime package dependency.

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`, then enter `owner/repository` or a public GitHub repository URL. A `/tree/branch` URL can select a revision. A link with `?repo=owner/repository` starts a review automatically. Private repositories are not supported.

The local example is available without a GitHub request. Select one of its three source files and apply or restore a sample fix. The displayed finding is computed by the same rules as full reviews. Sample code is inspected, never executed. Applying a fix only changes the example in this tab. A rule no longer matching does not prove the example is correct or safe.

## Reports

- Four rule scores start at 100 and subtract points for matched findings. Severity weights and per-rule penalties are defined in `analyzers.js`. Scores are not confidence, percentiles or audit grades.
- Filter by rule set and severity. The score strip also selects a rule set. Expand a finding for its reason and source context.
- Real reviews record the immutable commit SHA and pin source links to it. A local example has no commit and is labelled as an example in the page and exports.
- Export Markdown or JSON. Exports contain the complete report, not just the filtered view. JSON also records coverage and failed reads. Source-derived Markdown text is escaped.
- Reports are not stored on a server or published at a shareable report URL. Downloads may contain source snippets, including anything a secret-detection rule matched. Inspect them before sharing.

## Bounds and failure handling

A review uses three unauthenticated GitHub API requests for repository metadata, a commit and its tree. It then reads up to 160 supported text files, at most 150,000 bytes each, through up to six concurrent raw-file readers. Manifests and source files are prioritised, followed by shorter paths. Vendored directories, dependency lockfiles, minified code, large files and unsupported formats are excluded.

Each network request has a 20-second timeout and a bounded response body. Full-report analysis runs in a separate worker with a 20-second deadline, so it does not block the interface. Cancel stops the active read or analysis. Old responses cannot overwrite a newer review.

A partial read is explicitly incomplete. No readable candidates or no supported files produces an error, not a clean report. A GitHub access or rate-limit denial stops the queue without retry loops. Unauthenticated GitHub metadata requests share a per-network quota, usually 60 per hour. Availability and response policies remain GitHub's responsibility.

## Data

Your browser requests public code directly from `api.github.com` and `raw.githubusercontent.com`. GitHub receives request metadata. The site does not intentionally upload repository contents, collect a token or send code to an analysis service. All analysis dependencies and fonts are served with the site. A local example makes no GitHub requests. Browser/hosting infrastructure is not an independently audited privacy boundary.

## What the rules inspect

Architecture checks include repository documentation, license, test/CI signals, dependency declarations, large files and long functions. Security patterns include possible credentials, unsafe dynamic code, string-built SQL and shell commands, unsafe deserialisation and disabled TLS checks. Performance and style checks include serial awaits, synchronous calls, large assets, unfinished markers and formatting signals.

These are bounded text patterns, not a parser, compiler, dependency vulnerability database or whole-program analysis. They miss context and can mistake fixtures or harmless code for problems. The code and its real use have the final word. Read `analyzers.js` for the exact rules.

## Design and tests

An application-first inspection bench: compact white and graphite surfaces, acid-yellow source markers, ruled code and a working specimen. Keyboard source tabs and filters, focus-contained method dialog with exact focus return, reduced motion and matching 404. See `DESIGN.md` for inspected references and design decisions.

```sh
node --test tests/*.test.js
```

Project code is MIT licensed, copyright Aditya Kulkarni. Doctor Sans and Doctor Mono are renamed font derivatives of Inter and JetBrains Mono. Original copyright and OFL notices remain in `FONT-LICENSES.txt`.
