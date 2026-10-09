/* Reads a public repo: 2 API calls for metadata + tree, file bodies from raw.githubusercontent.com (no API quota). */
(function (root) {
  'use strict';
  var MAX_FILES = 160, MAX_BYTES = 150000;
  function parseUrl(s) {
    s = String(s || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
    var m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/([^?#]+))?/i.exec(s) || /^([\w.-]+)\/([\w.-]+)$/.exec(s);
    if (!m) return null;
    return { owner: m[1], repo: m[2], ref: m[3] || null };
  }
  async function getJson(url) {
    var r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 403 || r.status === 429) {
      var reset = r.headers.get('x-ratelimit-reset');
      var e = new Error('GitHub rate limit reached for this network' + (reset ? '. It resets around ' + new Date(reset * 1000).toLocaleTimeString() : '') + '. The free limit is 60 requests an hour.'); e.code = 'rate'; throw e;
    }
    if (r.status === 404) { var e2 = new Error('Repository not found, or it is private. Only public repositories can be read.'); e2.code = 'notfound'; throw e2; }
    if (!r.ok) throw new Error('GitHub returned ' + r.status);
    return r.json();
  }
  async function load(spec, onProgress, signal) {
    onProgress = onProgress || function () {};
    var info = await getJson('https://api.github.com/repos/' + spec.owner + '/' + spec.repo);
    var ref = spec.ref || info.default_branch;
    onProgress('tree', { ref: ref, info: info });
    var t = await getJson('https://api.github.com/repos/' + spec.owner + '/' + spec.repo + '/git/trees/' + encodeURIComponent(ref) + '?recursive=1');
    var tree = (t.tree || []).filter(function (x) { return x.type === 'blob'; }).map(function (x) { return { path: x.path, size: x.size || 0 }; });
    var A = root.RepoDoctor || (typeof require !== 'undefined' ? require('./analyzers.js') : null);
    var want = tree.filter(function (x) { return A.TEXT.test(x.path) && !A.isVendored(x.path) && x.size > 0 && x.size <= MAX_BYTES; });
    var rank = function (p) { return (/^(package\.json|requirements\.txt)$/.test(p) ? 0 : A.CODE.test(p) ? 1 : 2); };
    want.sort(function (a, b) { return rank(a.path) - rank(b.path) || a.path.length - b.path.length; });
    var truncatedList = want.length > MAX_FILES;
    want = want.slice(0, MAX_FILES);
    var files = {}, done = 0, idx = 0;
    async function worker() {
      while (idx < want.length) {
        var f = want[idx++];
        if (signal && signal.aborted) return;
        try {
          var r = await fetch('https://raw.githubusercontent.com/' + spec.owner + '/' + spec.repo + '/' + encodeURIComponent(ref) + '/' + f.path.split('/').map(encodeURIComponent).join('/'), { signal: signal });
          if (r.ok) files[f.path] = await r.text();
        } catch (e) { if (e.name === 'AbortError') return; }
        done++; onProgress('files', { done: done, total: want.length, path: f.path });
      }
    }
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    return { info: info, ref: ref, tree: tree, files: files, truncatedTree: !!t.truncated, truncatedList: truncatedList, totalCandidate: tree.length, fetched: Object.keys(files).length };
  }
  var api = { parseUrl: parseUrl, load: load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RepoGitHub = api;
})(typeof self !== 'undefined' ? self : this);
