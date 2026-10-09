(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var REV = [['architecture', 'Architect'], ['security', 'Security'], ['performance', 'Performance'], ['style', 'Style']];
  var state = { data: null, res: null, rev: 'all', sev: 'all', spec: null };

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function show(id, on) { $(id).hidden = !on; }
  function fail(msg) { var e = $('#err'); e.textContent = msg; e.hidden = !msg; }

  function ring(score) {
    var NS = 'http://www.w3.org/2000/svg', r = 34, c = 2 * Math.PI * r;
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 84 84'); s.setAttribute('width', '84'); s.setAttribute('height', '84'); s.setAttribute('class', 'ring'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Score ' + score + ' out of 100');
    var mk = function (n, a) { var e = document.createElementNS(NS, n); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; };
    s.appendChild(mk('circle', { cx: 42, cy: 42, r: r, fill: 'none', stroke: '#e4dfd2', 'stroke-width': 7 }));
    var col = score >= 85 ? '#2f7d4f' : score >= 60 ? '#c27a00' : '#d6371b';
    var arc = mk('circle', { cx: 42, cy: 42, r: r, fill: 'none', stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c, transform: 'rotate(-90 42 42)' });
    arc.style.transition = 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)';
    s.appendChild(arc);
    var t = mk('text', { x: 42, y: 51, 'text-anchor': 'middle' }); t.textContent = score; s.appendChild(t);
    requestAnimationFrame(function () { requestAnimationFrame(function () { arc.style.strokeDashoffset = c * (1 - score / 100); }); });
    return s;
  }

  function blobUrl(f) {
    var d = state.data, s = state.spec;
    if (!f.line || f.path.charAt(0) === '(') return f.line === 0 && f.path.indexOf('(') !== 0 ? 'https://github.com/' + s.owner + '/' + s.repo + '/blob/' + encodeURIComponent(d.ref) + '/' + f.path.split('/').map(encodeURIComponent).join('/') : null;
    return 'https://github.com/' + s.owner + '/' + s.repo + '/blob/' + encodeURIComponent(d.ref) + '/' + f.path.split('/').map(encodeURIComponent).join('/') + '#L' + f.line;
  }
  function where(f) { return f.line ? f.path + ':' + f.line : f.path; }

  function renderCrew() {
    var box = $('#crew'); box.textContent = '';
    var all = state.res.findings;
    REV.forEach(function (r) {
      var n = all.filter(function (f) { return f.reviewer === r[0]; });
      var hi = n.filter(function (f) { return f.severity === 'high'; }).length;
      var b = h('button', { class: 'rev', type: 'button', 'aria-pressed': String(state.rev === r[0]), 'data-r': r[0] }, [
        h('span', { class: 'nm', text: r[1] }), ring(RepoDoctor.score(all, r[0])),
        h('span', { class: 'sm', text: n.length ? n.length + ' finding' + (n.length > 1 ? 's' : '') + (hi ? ', ' + hi + ' high' : '') : 'Nothing found' })
      ]);
      b.addEventListener('click', function () { state.rev = state.rev === r[0] ? 'all' : r[0]; renderFilters(); renderCrew2(); renderList(); });
      box.appendChild(b);
    });
  }
  function renderCrew2() { document.querySelectorAll('.rev').forEach(function (b) { b.setAttribute('aria-pressed', String(state.rev === b.dataset.r)); }); }

  function seg(box, items, key) {
    box.textContent = '';
    items.forEach(function (it) {
      var b = h('button', { type: 'button', 'aria-pressed': String(state[key] === it[0]), text: it[1] });
      b.addEventListener('click', function () { state[key] = it[0]; renderFilters(); renderCrew2(); renderList(); });
      box.appendChild(b);
    });
  }
  function renderFilters() {
    var all = state.res.findings;
    seg($('#fRev'), [['all', 'All reviewers (' + all.length + ')']].concat(REV.map(function (r) { return [r[0], r[1]]; })), 'rev');
    seg($('#fSev'), [['all', 'Any severity'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], 'sev');
  }

  function renderList() {
    var list = $('#list'); list.textContent = '';
    var fs = state.res.findings.filter(function (f) { return (state.rev === 'all' || f.reviewer === state.rev) && (state.sev === 'all' || f.severity === state.sev); });
    $('#count').textContent = fs.length + ' shown of ' + state.res.findings.length;
    if (!fs.length) { list.appendChild(h('li', { class: 'empty', text: state.res.findings.length ? 'Nothing matches these filters.' : 'These rules found nothing. That does not make the code flawless, only that none of the checks fired.' })); return; }
    fs.forEach(function (f) {
      var url = blobUrl(f), body = h('div', { class: 'body' }, [
        f.code ? h('pre', {}, [h('code', { text: (f.line ? f.line + '  ' : '') + f.code })]) : null,
        h('p', {}, [h('b', { text: 'Why it matters. ' }), f.why]),
        h('p', {}, [h('b', { text: 'Fix. ' }), f.fix]),
        url ? h('p', {}, [h('a', { href: url, target: '_blank', rel: 'noopener', text: 'Open ' + where(f) + ' on GitHub' })]) : null
      ]);
      var head = h('button', { type: 'button', 'aria-expanded': 'false' }, [
        h('span', { class: 'sev', text: f.severity }),
        h('span', {}, [h('span', { class: 'ft', text: f.title }), h('span', { class: 'fp', text: where(f) })]),
        h('span', { class: 'who', text: (REV.filter(function (r) { return r[0] === f.reviewer; })[0] || [0, f.reviewer])[1] })
      ]);
      var li = h('li', { class: 'f ' + f.severity, 'data-open': 'false' }, [head, body]);
      head.addEventListener('click', function () { var o = li.dataset.open !== 'true'; li.dataset.open = String(o); head.setAttribute('aria-expanded', String(o)); });
      list.appendChild(li);
    });
  }

  function markdown() {
    var d = state.data, s = state.spec, L = ['# Repo Doctor report: ' + s.owner + '/' + s.repo, '', 'Branch: ' + d.ref + '. Files read: ' + d.fetched + ' of ' + d.tree.length + '. Rule-based static analysis, not a security audit.', '', '| Reviewer | Score | Findings |', '|---|---|---|'];
    REV.forEach(function (r) { L.push('| ' + r[1] + ' | ' + RepoDoctor.score(state.res.findings, r[0]) + ' | ' + state.res.findings.filter(function (f) { return f.reviewer === r[0]; }).length + ' |'); });
    REV.forEach(function (r) {
      var fs = state.res.findings.filter(function (f) { return f.reviewer === r[0]; });
      if (!fs.length) return;
      L.push('', '## ' + r[1], '');
      fs.forEach(function (f) { L.push('- **[' + f.severity + '] ' + f.title + '** - `' + where(f) + '`', '  - Why: ' + f.why, '  - Fix: ' + f.fix); });
    });
    return L.join('\n') + '\n';
  }
  function download(name, text, type) {
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type })), download: name }); document.body.appendChild(a); a.click(); a.remove();
  }

  async function examine(raw) {
    fail('');
    var spec = RepoGitHub.parseUrl(raw);
    if (!spec) { fail('That does not look like a GitHub repository. Use a link like github.com/owner/repo.'); return; }
    state.spec = spec; $('#go').disabled = true; show('#report', false); show('#run', true);
    $('#bar').style.width = '4%'; $('#runTitle').textContent = 'Reading ' + spec.owner + '/' + spec.repo; $('#runSub').textContent = 'Asking GitHub for the file list';
    try {
      var data = await RepoGitHub.load(spec, function (k, p) {
        if (k === 'tree') { $('#runSub').textContent = 'Branch ' + p.ref + '. Listing files'; $('#bar').style.width = '12%'; }
        else { $('#bar').style.width = (12 + 78 * p.done / Math.max(1, p.total)) + '%'; $('#runSub').textContent = p.done + ' of ' + p.total + ' files  ' + p.path; }
      });
      $('#runTitle').textContent = 'Four reviewers are reading'; $('#bar').style.width = '95%';
      await new Promise(function (r) { setTimeout(r, 30); });
      var res = RepoDoctor.analyze({ tree: data.tree, files: data.files });
      state.data = data; state.res = res; state.rev = 'all'; state.sev = 'all';
      show('#run', false); render(); show('#hero', false); show('#report', true); window.scrollTo(0, 0);
    } catch (e) {
      show('#run', false); fail(e.message || 'Something went wrong while reading the repository.');
    } finally { $('#go').disabled = false; }
  }

  function render() {
    var d = state.data, s = state.spec, i = d.info;
    $('#rMeta').textContent = 'Branch ' + d.ref + '  /  ' + d.fetched + ' of ' + d.tree.length + ' files read' + (i.language ? '  /  ' + i.language : '');
    $('#rName').textContent = s.owner + '/' + s.repo;
    $('#rDesc').textContent = i.description || '';
    var notes = [];
    if (d.truncatedList) notes.push('This repository has more readable files than the 160-file limit, so the smallest paths were read first.');
    if (d.truncatedTree) notes.push('GitHub returned a truncated file list for this very large repository.');
    if (state.res.skippedMinified.length) notes.push(state.res.skippedMinified.length + ' minified file(s) were skipped.');
    var hid = Object.keys(state.res.hidden).reduce(function (a, k) { return a + state.res.hidden[k]; }, 0);
    if (hid) notes.push(hid + ' repeated findings were folded away so the list stays readable.');
    $('#rNote').textContent = notes.join(' '); $('#rNote').hidden = !notes.length;
    renderCrew(); renderFilters(); renderList();
  }

  $('#form').addEventListener('submit', function (e) { e.preventDefault(); examine($('#url').value); });
  document.querySelectorAll('.chip').forEach(function (c) { c.addEventListener('click', function () { $('#url').value = c.dataset.u; examine(c.dataset.u); }); });
  $('#dlMd').addEventListener('click', function () { download(state.spec.repo + '-repo-doctor.md', markdown(), 'text/markdown'); });
  $('#dlJson').addEventListener('click', function () { download(state.spec.repo + '-repo-doctor.json', JSON.stringify({ repo: state.spec.owner + '/' + state.spec.repo, branch: state.data.ref, scores: REV.reduce(function (o, r) { o[r[0]] = RepoDoctor.score(state.res.findings, r[0]); return o; }, {}), findings: state.res.findings }, null, 2), 'application/json'); });
  $('#again').addEventListener('click', function () { show('#report', false); show('#hero', true); $('#url').value = ''; $('#url').focus(); });
  var q = new URLSearchParams(location.search).get('repo'); if (q) { $('#url').value = q; examine(q); }
})();
