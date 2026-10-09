/* Repo Doctor rule engine. Pure functions, no network. Four reviewers share one file set. */
(function (root) {
  'use strict';
  var SEV = { high: 3, medium: 2, low: 1 };
  var SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|\.git|\.next|coverage|__pycache__|\.venv|venv|third_party|bower_components)\//;
  var LOCK = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/;
  var CODE = /\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|java|php|rs|c|cc|cpp|h|cs|sh|vue|svelte)$/i;
  var JS = /\.(js|jsx|mjs|cjs|ts|tsx|vue|svelte)$/i;
  var PY = /\.py$/i;
  var TEXT = /\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|java|php|rs|c|cc|cpp|h|cs|sh|vue|svelte|json|ya?ml|toml|env|md|html|css|scss|sql|txt|cfg|ini|gradle|xml)$/i;

  function isVendored(p) { return SKIP_DIR.test(p) || /\.min\.(js|css)$/i.test(p) || LOCK.test(p); }
  function isTest(p) { return /(^|\/)(tests?|__tests__|spec|specs|benchmarks?|e2e|mocks?)\//i.test(p) || /(\.|_)(test|spec)\.[a-z]+$/i.test(p) || /(^|\/)test_[^/]+\.py$/.test(p); }
  function isMinified(text) { var l = text.split('\n'); return l.length < 20 && text.length > 3000 || (text.length / Math.max(1, l.length) > 400 && text.length > 5000); }
  function commentLine(line, path) {
    var t = line.trim();
    if (PY.test(path) || /\.(rb|sh)$/.test(path)) return t.charAt(0) === '#';
    return t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0;
  }

  /* ---------- line rules: [id, reviewer, severity, fileRegex, lineRegex, title, why, fix, skipTests, skipComments] ---------- */
  var RULES = [
    ['sec-private-key', 'security', 'high', null, /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, 'Private key committed', 'Anyone who can read the repo can use this key.', 'Revoke the key, remove it from history, load it from the environment.', false, false],
    ['sec-aws-key', 'security', 'high', null, /\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id in source', 'Key ids starting AKIA are live credential identifiers.', 'Rotate the key and read credentials from the environment or a secrets manager.', false, false],
    ['sec-github-token', 'security', 'high', null, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'GitHub token in source', 'Tokens with this prefix grant access to the account.', 'Revoke it in GitHub settings and use an environment variable.', false, false],
    ['sec-slack-token', 'security', 'high', null, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'Slack token in source', 'Tokens with this prefix grant workspace access.', 'Revoke it and load it from the environment.', false, false],
    ['sec-hardcoded-secret', 'security', 'high', null, /(api[_-]?key|secret|passwd|password|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-\/+=.]{16,}["']/i, 'Possible hardcoded secret', 'A long literal is assigned to a name that suggests a credential.', 'Move it to an environment variable. If it is a placeholder, use an obviously fake value.', true, true],
    ['sec-eval-js', 'security', 'high', JS, /(^|[^\w.$])eval\s*\(/, 'eval() call', 'eval runs any string as code, so any untrusted input becomes code execution.', 'Parse data with JSON.parse or a real parser, and avoid dynamic code.', true, true],
    ['sec-new-function', 'security', 'medium', JS, /new\s+Function\s*\(/, 'new Function() call', 'Builds code from a string, with the same risk as eval.', 'Pass a real function or a lookup table instead.', true, true],
    ['sec-innerhtml', 'security', 'medium', JS, /\.(innerHTML|outerHTML)\s*(\+?=)[^=]/, 'innerHTML assignment', 'If any part of the value comes from a user or an API, this is cross-site scripting.', 'Use textContent, or build nodes. Sanitise if HTML is required.', true, true],
    ['sec-doc-write', 'security', 'medium', JS, /document\.write\s*\(/, 'document.write call', 'Injects raw markup and blocks parsing.', 'Create elements and append them.', true, true],
    ['sec-dangerously', 'security', 'medium', JS, /dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML used', 'Bypasses React escaping.', 'Sanitise the value (for example with DOMPurify) or render it as text.', true, true],
    ['sec-node-exec', 'security', 'high', JS, /(^|[^\w.$])(exec|execSync)\s*\(\s*(`[^`]*\$\{|["'][^"']*["']\s*\+|[A-Za-z_$][\w$]*\s*\+)/, 'Shell command built from a string', 'Concatenated input reaches the shell, which allows command injection.', 'Use execFile or spawn with an argument array.', true, true],
    ['sec-py-eval', 'security', 'high', PY, /(^|[^\w.])(eval|exec)\s*\(/, 'eval/exec call', 'Runs any string as Python code.', 'Use ast.literal_eval for data, or remove the dynamic code.', true, true],
    ['sec-py-shell', 'security', 'high', PY, /subprocess\.[A-Za-z_]+\([^)]*shell\s*=\s*True/, 'subprocess with shell=True', 'Input that reaches the shell can inject commands.', 'Pass a list of arguments and drop shell=True.', true, true],
    ['sec-py-ossystem', 'security', 'medium', PY, /os\.(system|popen)\s*\(/, 'os.system / os.popen call', 'Runs a shell string, so injection is possible if any part is user-controlled.', 'Use subprocess.run with a list.', true, true],
    ['sec-py-pickle', 'security', 'high', PY, /pickle\.loads?\s*\(/, 'pickle load', 'Unpickling untrusted data runs arbitrary code.', 'Use JSON, or only unpickle data you wrote yourself.', true, true],
    ['sec-py-yaml', 'security', 'medium', PY, /yaml\.load\s*\((?![^)]*Loader\s*=\s*(yaml\.)?(Safe|CSafe))/, 'yaml.load without a safe loader', 'The default loader can build arbitrary objects.', 'Use yaml.safe_load.', true, true],
    ['sec-tls-off', 'security', 'high', null, /(verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|InsecureSkipVerify\s*:\s*true)/, 'TLS verification disabled', 'Connections can be intercepted without any warning.', 'Remove the override and trust a proper certificate.', true, true],
    ['sec-weak-hash', 'security', 'medium', CODE, /(createHash\(\s*["'](md5|sha1)["']|hashlib\.(md5|sha1)\s*\(|MessageDigest\.getInstance\(\s*"(MD5|SHA-?1)")/i, 'Weak hash (MD5 or SHA-1)', 'Both are broken for passwords and signatures.', 'Use SHA-256 for integrity and bcrypt, scrypt or argon2 for passwords.', true, true],
    ['sec-sql-concat', 'security', 'high', CODE, /\b(execute|query|raw)\s*\(\s*(f["']|["'](SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']\s*(\+|%)|`(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{)/i, 'SQL built by string formatting', 'Values pasted into SQL allow injection.', 'Use parameterised queries.', true, true],
    ['sec-cors-star', 'security', 'low', CODE, /(Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']|origin\s*:\s*["']\*["'])/i, 'CORS open to every origin', 'Any website can call this endpoint from a browser.', 'Allow only the origins that need it.', true, true],
    ['sec-debug-on', 'security', 'medium', PY, /^\s*(app\.run\([^)]*debug\s*=\s*True|DEBUG\s*=\s*True)/, 'Debug mode enabled', 'Debug pages can expose code and secrets.', 'Read it from an environment variable that defaults to off.', true, true],

    ['perf-await-loop', 'performance', 'medium', JS, /^\s*(for\s*\(|for\s+await|while\s*\()[^\n]*\)\s*\{?\s*$/, null, null, null, true, true], /* placeholder, replaced by block rule below */
    ['perf-sync-fs', 'performance', 'medium', /\.(js|mjs|cjs|ts)$/i, /\b(readFileSync|writeFileSync|readdirSync|statSync|existsSync|execSync)\s*\(/, 'Synchronous file or process call', 'Blocks the event loop for every request that reaches it.', 'Use the async version, or move it to start-up code.', true, true],
    ['perf-select-star', 'performance', 'low', CODE, /SELECT\s+\*\s+FROM/i, 'SELECT * query', 'Returns every column, which wastes bandwidth and breaks when the schema grows.', 'List the columns you use.', true, true],
    ['perf-lodash', 'performance', 'low', JS, /import\s+_\s+from\s+["']lodash["']|require\(\s*["']lodash["']\s*\)\s*;?\s*$/, 'Whole lodash imported', 'Pulls the full library into the bundle.', 'Import single functions (lodash/debounce) or use native methods.', true, true],
    ['perf-moment', 'performance', 'low', JS, /from\s+["']moment["']|require\(\s*["']moment["']\s*\)/, 'moment imported', 'About 70 KB with locales and now in maintenance mode.', 'Use date-fns, dayjs, or Intl.DateTimeFormat.', true, true],
    ['perf-regex-in-loop', 'performance', 'low', JS, /^\s{4,}.*\bnew RegExp\(/, 'RegExp constructed in nested code', 'Rebuilt on every pass when it sits inside a loop or handler.', 'Create it once outside the loop.', true, true],
    ['perf-img-tag', 'performance', 'low', /\.(html|jsx|tsx|vue|svelte)$/i, /<img\s(?![^>]*\b(width|height)\s*=)[^>]*>/i, '<img> without width and height', 'The page shifts as images load.', 'Set width and height, or reserve space with CSS aspect-ratio.', true, true],

    ['style-todo', 'style', 'low', CODE, /\b(TODO|FIXME|HACK|XXX)\b/, 'Unfinished marker', 'Notes like this tend to outlive the intention.', 'Fix it, or open an issue and link it.', false, false],
    ['style-console', 'style', 'low', JS, /(^|[^\w.])console\.(log|debug)\s*\(/, 'console.log left in code', 'Noise in production and sometimes leaks data.', 'Remove it or use a leveled logger.', true, true],
    ['style-var', 'style', 'low', JS, /^\s*var\s+[A-Za-z_$]/, 'var declaration', 'Function scoped and hoisted, which causes subtle bugs.', 'Use const, or let when it is reassigned.', true, true],
    ['style-loose-eq', 'style', 'low', JS, /[^=!<>]==[^=]|!=[^=]/, 'Loose equality (== or !=)', 'Type coercion makes comparisons surprising.', 'Use === and !==.', true, true],
    ['style-bare-except', 'style', 'medium', PY, /^\s*except\s*:/, 'Bare except', 'Swallows every error including KeyboardInterrupt.', 'Catch the specific exception, or at least Exception.', true, true],
    ['style-py-print', 'style', 'low', PY, /^\s*print\s*\(/, 'print() in library code', 'Hard to silence or route.', 'Use the logging module.', true, true],
    ['style-long-line', 'style', 'low', CODE, null, null, null, null, true, false] /* handled in file rules */
  ].filter(function (r) { return r[5]; });

  function mk(rule, path, lineNo, line) {
    return { id: rule[0], reviewer: rule[1], severity: rule[2], path: path, line: lineNo, title: rule[5], why: rule[6], fix: rule[7], code: line.trim().slice(0, 200) };
  }

  function lineRules(path, lines, out) {
    var test = isTest(path);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.length > 600) continue;
      for (var k = 0; k < RULES.length; k++) {
        var r = RULES[k];
        if (r[3] && !r[3].test(path)) continue;
        if (r[8] && test) continue;
        if (r[9] && commentLine(line, path)) continue;
        if (r[4].test(line)) out.push(mk(r, path, i + 1, line));
      }
    }
  }

  /* await inside a loop body (JS): tracks brace depth from the loop header, bounded to 40 lines */
  function awaitInLoop(path, lines, out) {
    var hdr = /^\s*(for\s*\(|for\s+await\s*\(|while\s*\()/;
    for (var i = 0; i < lines.length; i++) {
      if (!hdr.test(lines[i]) || /\bfor\s+await\b/.test(lines[i])) continue;
      var depth = 0, started = false;
      for (var j = i; j < Math.min(lines.length, i + 40); j++) {
        var l = lines[j];
        if (j > i && /\bawait\s/.test(l) && !commentLine(l, path)) {
          out.push({ id: 'perf-await-loop', reviewer: 'performance', severity: 'low', path: path, line: j + 1, title: 'await inside a loop', why: 'Each iteration waits for the previous one. That is fine when order matters, and slow when the iterations are independent.', fix: 'Collect the promises and use Promise.all when iterations do not depend on each other.', code: l.trim().slice(0, 200) });
          break;
        }
        for (var c = 0; c < l.length; c++) { if (l[c] === '{') { depth++; started = true; } else if (l[c] === '}') depth--; }
        if (started && depth <= 0) break;
      }
    }
  }

  function pyLoopConcat(path, lines, out) {
    var ind = function (l) { return l.length - l.replace(/^\s+/, '').length; };
    for (var i = 0; i < lines.length; i++) {
      if (!/^\s*(for|while)\b.*:\s*(#.*)?$/.test(lines[i])) continue;
      var base = ind(lines[i]), hit = 0;
      for (var j = i + 1; j < lines.length && j < i + 60; j++) {
        var l = lines[j];
        if (!l.trim() || /^\s*#/.test(l)) continue;
        if (ind(l) <= base) break;
        if (/^\s*\w+\s*\+=\s*(str\(|f?["'])/.test(l)) { out.push({ id: 'perf-py-loop-concat', reviewer: 'performance', severity: 'low', path: path, line: j + 1, title: 'String built with += inside a loop', why: 'Each pass copies the whole string, so cost grows with its length.', fix: 'Collect the parts in a list and join once after the loop.', code: l.trim().slice(0, 200) }); hit = 1; break; }
      }
    }
  }

  function pyAwaitLoop() {}

  function fileRules(path, text, lines, out) {
    var n = lines.length;
    if (CODE.test(path) && n > 800 && !isTest(path)) {
      out.push({ id: 'arch-large-file', reviewer: 'architecture', severity: n > 1500 ? 'high' : 'medium', path: path, line: 1, title: 'Very large file (' + n + ' lines)', why: 'Files this long usually mix responsibilities and are hard to review or test.', fix: 'Split by responsibility into modules of a few hundred lines.', code: '' });
    }
    var longHits = 0, firstLong = 0, tabs = 0, spaces = 0, firstTab = 0, firstSpace = 0;
    for (var i = 0; i < n; i++) {
      var l = lines[i];
      if (l.length > 160 && l.length < 600 && CODE.test(path)) { longHits++; if (!firstLong) firstLong = i + 1; }
      if (/^\t/.test(l)) { tabs++; if (!firstTab) firstTab = i + 1; } else if (/^ {2,}\S/.test(l)) { spaces++; if (!firstSpace) firstSpace = i + 1; }
    }
    if (longHits >= 5) out.push({ id: 'style-long-lines', reviewer: 'style', severity: 'low', path: path, line: firstLong, title: longHits + ' lines longer than 160 characters', why: 'Long lines are hard to review and diff.', fix: 'Wrap them, or run a formatter.', code: lines[firstLong - 1].trim().slice(0, 200) });
    if (CODE.test(path) && tabs >= 5 && spaces >= 5) out.push({ id: 'style-mixed-indent', reviewer: 'style', severity: 'low', path: path, line: firstTab, title: 'Tabs and spaces mixed for indentation', why: 'Indentation looks different in every editor, and in Python it can break code.', fix: 'Pick one and enforce it with a formatter or .editorconfig.', code: '' });
    if (PY.test(path)) {
      var defs = 0;
      for (var d = 0; d < n; d++) { if (/^\s*def\s+\w+\(/.test(lines[d])) defs++; }
    }
  }

  /* function length, brace languages and python */
  function longFunctions(path, lines, out) {
    if (isTest(path)) return;
    if (PY.test(path)) {
      var starts = [];
      for (var i = 0; i < lines.length; i++) { var m = /^(\s*)def\s+(\w+)\(/.exec(lines[i]); if (m) starts.push({ i: i, indent: m[1].length, name: m[2] }); }
      starts.forEach(function (s) {
        var end = lines.length;
        for (var j = s.i + 1; j < lines.length; j++) { var t = lines[j]; if (t.trim() && !/^\s*#/.test(t) && (t.length - t.replace(/^\s+/, '').length) <= s.indent) { end = j; break; } }
        var len = end - s.i;
        if (len > 80) out.push({ id: 'arch-long-function', reviewer: 'architecture', severity: len > 150 ? 'high' : 'medium', path: path, line: s.i + 1, title: s.name + '() is ' + len + ' lines long', why: 'Long functions hide several jobs in one place.', fix: 'Extract the steps into named helpers.', code: lines[s.i].trim().slice(0, 200) });
      });
    } else if (JS.test(path) || /\.(go|java|c|cc|cpp|cs|rs|php)$/.test(path)) {
      var fn = /(function\s*\*?\s*([\w$]*)\s*\(|([\w$]+)\s*[:=]\s*(async\s*)?(function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)|^\s*(async\s+)?([\w$]+)\s*\([^)]*\)\s*\{)/;
      for (var a = 0; a < lines.length; a++) {
        var line = lines[a];
        if (!fn.test(line) || !/\{\s*$/.test(line)) continue;
        if (/^\s*(if|for|while|switch|catch|else|return)\b/.test(line)) continue;
        var depth = 0, started = false, b;
        for (b = a; b < lines.length && b < a + 400; b++) {
          var l = lines[b];
          for (var c = 0; c < l.length; c++) { if (l[c] === '{') { depth++; started = true; } else if (l[c] === '}') depth--; }
          if (started && depth <= 0) break;
        }
        var len2 = b - a + 1;
        if (len2 > 100 && started && depth <= 0) {
          var nm = (fn.exec(line)[2] || fn.exec(line)[3] || fn.exec(line)[7] || 'anonymous function');
          out.push({ id: 'arch-long-function', reviewer: 'architecture', severity: len2 > 200 ? 'high' : 'medium', path: path, line: a + 1, title: nm + ' is ' + len2 + ' lines long', why: 'Long functions hide several jobs in one place.', fix: 'Extract the steps into named helpers.', code: line.trim().slice(0, 200) });
          a = b;
        }
      }
    }
  }

  /* ---------- repo-level (architecture and hygiene) ---------- */
  function repoRules(files, tree, manifests, out) {
    var paths = tree.map(function (t) { return t.path; });
    var has = function (re) { return paths.some(function (p) { return re.test(p); }); };
    var src = paths.filter(function (p) { return CODE.test(p) && !isVendored(p); });
    var add = function (id, rev, sev, title, why, fix, path) { out.push({ id: id, reviewer: rev, severity: sev, path: path || '(repository)', line: 0, title: title, why: why, fix: fix, code: '' }); };
    if (!has(/^readme(\.\w+)?$/i)) add('arch-no-readme', 'architecture', 'medium', 'No README at the repository root', 'Visitors cannot tell what this is or how to run it.', 'Add a README with purpose, setup and usage.');
    if (!has(/^license(\.\w+)?$/i) && !has(/^copying$/i)) add('arch-no-license', 'architecture', 'low', 'No LICENSE file', 'Without a license nobody else may legally reuse the code.', 'Add one, for example MIT or Apache-2.0.');
    if (src.length >= 5 && !paths.some(isTest)) add('arch-no-tests', 'architecture', 'high', 'No tests found', 'Nothing guards the ' + src.length + ' source files against regressions.', 'Add tests for the core logic first, then run them in CI.');
    if (src.length >= 5 && !has(/^\.github\/workflows\/.+\.ya?ml$/) && !has(/^(\.gitlab-ci\.yml|\.circleci\/|azure-pipelines\.yml|Jenkinsfile|\.travis\.yml)/)) add('arch-no-ci', 'architecture', 'medium', 'No CI configuration found', 'Tests and checks only run if someone remembers to.', 'Add a workflow that installs, lints and tests on every push.');
    if (!has(/(^|\/)\.gitignore$/)) add('arch-no-gitignore', 'architecture', 'medium', 'No .gitignore', 'Build output, caches and secrets are easy to commit by accident.', 'Add one for your language.');
    paths.filter(function (p) { return !isTest(p) && !/(^|\/)(examples?|fixtures?|samples?)\//i.test(p) && /(^|\/)\.env(\.[\w.]+)?$/.test(p) && !/\.(example|sample|template)$/.test(p); }).forEach(function (p) {
      add('sec-env-committed', 'security', 'high', 'Environment file committed', 'Env files usually hold real credentials.', 'Remove it from the repo and history, add it to .gitignore, commit a .env.example instead.', p);
    });
    paths.filter(function (p) { return /\.(pem|p12|pfx|keystore|jks)$/i.test(p) || /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/.test(p); }).forEach(function (p) {
      add('sec-key-file', 'security', 'high', 'Key or certificate file committed', 'Private key material should never be in version control.', 'Remove it, rotate it, and store it outside the repo.', p);
    });
    var big = tree.filter(function (t) { return t.size > 1000000 && !isVendored(t.path); });
    big.slice(0, 5).forEach(function (t) { add('perf-big-file', 'performance', 'medium', 'Large file in repository (' + (t.size / 1048576).toFixed(1) + ' MB)', 'Slows every clone and, if served, every page load.', 'Compress it, move it to releases or LFS, or load it on demand.', t.path); });
    tree.filter(function (t) { return /\.(png|jpe?g|gif|bmp)$/i.test(t.path) && t.size > 500000 && t.size <= 1000000 && !isVendored(t.path); }).slice(0, 5).forEach(function (t) {
      add('perf-big-image', 'performance', 'low', 'Unoptimised image (' + Math.round(t.size / 1024) + ' KB)', 'Large images dominate page weight.', 'Resize and convert to WebP or AVIF.', t.path);
    });
    var perDir = {};
    paths.forEach(function (p) { if (isVendored(p)) return; var d = p.indexOf('/') < 0 ? '(root)' : p.slice(0, p.lastIndexOf('/')); perDir[d] = (perDir[d] || 0) + 1; });
    Object.keys(perDir).forEach(function (d) { if (perDir[d] > 60) add('arch-flat-dir', 'architecture', 'low', perDir[d] + ' files in one directory', 'A flat folder this size is hard to navigate and usually hides several modules.', 'Group related files into subfolders.', d); });
    var pkg = manifests['package.json'];
    if (pkg) {
      var p0; try { p0 = JSON.parse(pkg.text); } catch (e) { p0 = null; }
      if (p0) {
        var deps = Object.assign({}, p0.dependencies || {}, p0.devDependencies || {});
        var names = Object.keys(deps);
        var lineOf = function (name) { var ls = pkg.text.split('\n'); for (var i = 0; i < ls.length; i++) if (ls[i].indexOf('"' + name + '"') >= 0) return i + 1; return 1; };
        if (names.length > 60) add('arch-many-deps', 'architecture', 'low', names.length + ' dependencies declared', 'Every dependency is code you must trust and update.', 'Audit and remove what you do not use.', 'package.json');
        names.forEach(function (n) { if (deps[n] === '*' || deps[n] === 'latest') out.push({ id: 'arch-unpinned', reviewer: 'architecture', severity: 'medium', path: 'package.json', line: lineOf(n), title: n + ' uses "' + deps[n] + '"', why: 'A new release can break the build with no change on your side.', fix: 'Pin a version range such as ^1.2.3.', code: '"' + n + '": "' + deps[n] + '"' }); });
        if (names.length && !has(/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/)) add('arch-no-lockfile', 'architecture', 'medium', 'package.json without a lockfile', 'Installs are not reproducible.', 'Commit package-lock.json, yarn.lock or pnpm-lock.yaml.', 'package.json');
        if (!(p0.scripts && p0.scripts.test)) add('arch-no-test-script', 'architecture', 'low', 'No "test" script in package.json', 'There is no standard way to run the tests.', 'Add a "test" script.', 'package.json');
      }
    }
    if (manifests['requirements.txt']) {
      var rl = manifests['requirements.txt'].text.split('\n'), un = 0, first = 0;
      rl.forEach(function (l, i) { var t = l.trim(); if (t && t[0] !== '#' && t[0] !== '-' && !/[=<>~!]/.test(t)) { un++; if (!first) first = i + 1; } });
      if (un >= 3) out.push({ id: 'arch-unpinned-py', reviewer: 'architecture', severity: 'medium', path: 'requirements.txt', line: first, title: un + ' requirements without a version', why: 'Installs are not reproducible.', fix: 'Pin versions, for example with pip freeze or pip-compile.', code: rl[first - 1].trim() });
    }
  }

  function analyze(input) {
    /* input: {tree:[{path,size}], files:{path:text}} */
    var out = [], manifests = {};
    var tree = input.tree || [];
    ['package.json', 'requirements.txt'].forEach(function (m) { if (input.files[m] != null) manifests[m] = { text: input.files[m] }; });
    var scanned = 0, skipped = [];
    Object.keys(input.files).forEach(function (path) {
      if (isVendored(path)) return;
      var text = input.files[path];
      if (text == null) return;
      if (isMinified(text)) { skipped.push(path); return; }
      var lines = text.split('\n');
      scanned++;
      if (CODE.test(path) || /\.(env|json|ya?ml|toml|cfg|ini|html)$/i.test(path)) lineRules(path, lines, out);
      if (JS.test(path)) awaitInLoop(path, lines, out);
      if (PY.test(path) && !isTest(path)) pyLoopConcat(path, lines, out);
      if (CODE.test(path)) { fileRules(path, text, lines, out); longFunctions(path, lines, out); }
    });
    repoRules(input.files, tree, manifests, out);
    /* collapse noisy repeats: at most 8 per rule per file, 25 per rule overall */
    var perFile = {}, perRule = {}, kept = [], hidden = {};
    out.sort(function (a, b) { return SEV[b.severity] - SEV[a.severity] || (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line); });
    out.forEach(function (f) {
      var kf = f.id + '|' + f.path, kr = f.id;
      perFile[kf] = (perFile[kf] || 0) + 1; perRule[kr] = (perRule[kr] || 0) + 1;
      if (perFile[kf] > 8 || perRule[kr] > 25) { hidden[f.id] = (hidden[f.id] || 0) + 1; return; }
      kept.push(f);
    });
    return { findings: kept, hidden: hidden, scanned: scanned, skippedMinified: skipped };
  }

  function score(findings, reviewer) {
    /* each rule can cost at most 30 points, so one noisy rule cannot zero a reviewer */
    var by = {};
    findings.forEach(function (f) {
      if (f.reviewer !== reviewer) return;
      by[f.id] = (by[f.id] || 0) + (f.severity === 'high' ? 12 : f.severity === 'medium' ? 5 : 1.5);
    });
    var pts = 0; Object.keys(by).forEach(function (k) { pts += Math.min(30, by[k]); });
    return Math.max(0, Math.round(100 - Math.min(100, pts)));
  }

  var api = { analyze: analyze, score: score, isVendored: isVendored, TEXT: TEXT, CODE: CODE, SEV: SEV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RepoDoctor = api;
})(typeof self !== 'undefined' ? self : this);
