const test = require('node:test'), assert = require('node:assert');
const A = require('../analyzers.js'), G = require('../github.js');
const run = (files, tree) => A.analyze({ files, tree: tree || Object.keys(files).map(p => ({ path: p, size: files[p].length })) }).findings;
const ids = f => f.map(x => x.id);

test('parses repository urls', () => {
  assert.deepStrictEqual(G.parseUrl('https://github.com/a/b.git'), { owner: 'a', repo: 'b', ref: null });
  assert.deepStrictEqual(G.parseUrl('github.com/a/b/tree/dev'), { owner: 'a', repo: 'b', ref: 'dev' });
  assert.deepStrictEqual(G.parseUrl('a/b'), { owner: 'a', repo: 'b', ref: null });
  assert.strictEqual(G.parseUrl('https://example.com/a/b'), null);
});
test('finds eval with the right line', () => {
  const f = run({ 'a.js': 'const x = 1;\nconst y = eval(input);\n' }).filter(x => x.id === 'sec-eval-js');
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].line, 2);
});
test('ignores eval in comments and in tests', () => {
  assert.ok(!ids(run({ 'a.js': '// eval(x)\n' })).includes('sec-eval-js'));
  assert.ok(!ids(run({ 'tests/a.js': 'eval(x)\n' })).includes('sec-eval-js'));
});
test('RegExp.exec is not flagged as a shell command', () => {
  assert.ok(!ids(run({ 'a.js': 'const m = re.exec(`${a}${b}`);\n' })).includes('sec-node-exec'));
  assert.ok(ids(run({ 'a.js': 'exec(`ls ${dir}`);\n' })).includes('sec-node-exec'));
});
test('finds committed secrets and env files', () => {
  const f = run({ 'a.py': 'k = "AKIAABCDEFGHIJKLMNOP"\n', '.env': 'A=1\n' });
  assert.ok(ids(f).includes('sec-aws-key')); assert.ok(ids(f).includes('sec-env-committed'));
});
test('python rules', () => {
  const f = ids(run({ 'a.py': 'import subprocess\nsubprocess.run(c, shell=True)\ntry:\n    x()\nexcept:\n    pass\nfor i in r:\n    s += str(i)\n' }));
  ['sec-py-shell', 'style-bare-except', 'perf-py-loop-concat'].forEach(i => assert.ok(f.includes(i), i));
});
test('await in loop is reported at the await line', () => {
  const f = run({ 'a.js': 'for (const u of urls) {\n  const r = await fetch(u);\n}\n' }).filter(x => x.id === 'perf-await-loop');
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].line, 2);
});
test('vendored and minified code is skipped', () => {
  assert.strictEqual(run({ 'node_modules/x/a.js': 'eval(x)\n' }).filter(x => x.id === 'sec-eval-js').length, 0);
  assert.strictEqual(run({ 'a.min.js': 'eval(x)\n' }).filter(x => x.id === 'sec-eval-js').length, 0);
});
test('repo level checks', () => {
  const files = {}; for (let i = 0; i < 6; i++) files['s' + i + '.js'] = 'const a = 1;\n';
  const f = ids(run(files));
  ['arch-no-readme', 'arch-no-tests', 'arch-no-ci', 'arch-no-gitignore', 'arch-no-license'].forEach(i => assert.ok(f.includes(i), i));
});
test('scores are bounded and one noisy rule cannot zero a reviewer', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ reviewer: 'style', id: 'style-var', severity: 'low', path: 'a', line: i }));
  const s = A.score(many, 'style'); assert.ok(s >= 70 && s <= 100);
});
