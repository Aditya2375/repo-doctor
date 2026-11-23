(function () {
  "use strict";
  var $ = function (s) {
    return document.querySelector(s);
  };
  var REV = [
    ["architecture", "Architecture"],
    ["security", "Security"],
    ["performance", "Performance"],
    ["style", "Style"],
  ];
  var activeReview = null,
    reviewId = 0;
  var state = { data: null, res: null, rev: "all", sev: "all", spec: null };

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c)
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }
  function show(id, on) {
    $(id).hidden = !on;
  }
  function fail(msg) {
    var e = $("#err");
    e.textContent = msg;
    e.hidden = !msg;
  }

  function ring(score) {
    return h("span", { class: "score-block" }, [
      h("span", { class: "score" }, [
        String(score),
        h("small", { text: "/ 100" }),
      ]),
      h("span", { class: "score-meter", "aria-hidden": "true" }, [
        h("i", { style: "width:" + score + "%" }),
      ]),
    ]);
  }

  function blobUrl(f) {
    var d = state.data,
      s = state.spec;
    if (d.sample) return null;
    if (!f.line || f.path.charAt(0) === "(")
      return f.line === 0 && f.path.indexOf("(") !== 0
        ? "https://github.com/" +
            s.owner +
            "/" +
            s.repo +
            "/blob/" +
            encodeURIComponent(d.ref) +
            "/" +
            f.path.split("/").map(encodeURIComponent).join("/")
        : null;
    return (
      "https://github.com/" +
      s.owner +
      "/" +
      s.repo +
      "/blob/" +
      encodeURIComponent(d.ref) +
      "/" +
      f.path.split("/").map(encodeURIComponent).join("/") +
      "#L" +
      f.line
    );
  }
  function where(f) {
    return f.line ? f.path + ":" + f.line : f.path;
  }

  function renderCrew() {
    var box = $("#crew");
    box.textContent = "";
    var all = state.res.findings;
    REV.forEach(function (r) {
      var n = all.filter(function (f) {
        return f.reviewer === r[0];
      });
      var hi = n.filter(function (f) {
        return f.severity === "high";
      }).length;
      var b = h(
        "button",
        {
          class: "rev",
          type: "button",
          "aria-pressed": String(state.rev === r[0]),
          "data-r": r[0],
        },
        [
          h("span", { class: "nm", text: r[1] }),
          ring(RepoDoctor.score(all, r[0])),
          h("span", {
            class: "sm",
            text: n.length
              ? n.length +
                " finding" +
                (n.length > 1 ? "s" : "") +
                (hi ? ", " + hi + " high" : "")
              : "Nothing found",
          }),
        ],
      );
      b.addEventListener("click", function () {
        state.rev = state.rev === r[0] ? "all" : r[0];
        renderFilters();
        renderCrew2();
        renderList();
      });
      box.appendChild(b);
    });
  }
  function renderCrew2() {
    document.querySelectorAll(".rev").forEach(function (b) {
      b.setAttribute("aria-pressed", String(state.rev === b.dataset.r));
    });
  }

  function seg(box, items, key) {
    box.textContent = "";
    items.forEach(function (it) {
      var b = h("button", {
        type: "button",
        "data-v": it[0],
        "aria-pressed": String(state[key] === it[0]),
        text: it[1],
      });
      b.addEventListener("click", function () {
        state[key] = it[0];
        renderFilters();
        renderCrew2();
        renderList();
        var next = [].find.call(
          box.querySelectorAll("button"),
          function (button) {
            return button.dataset.v === it[0];
          },
        );
        if (next) next.focus({ preventScroll: true });
      });
      box.appendChild(b);
    });
  }
  function renderFilters() {
    var all = state.res.findings;
    seg(
      $("#fRev"),
      [["all", "All rule sets (" + all.length + ")"]].concat(
        REV.map(function (r) {
          return [r[0], r[1]];
        }),
      ),
      "rev",
    );
    seg(
      $("#fSev"),
      [
        ["all", "Any severity"],
        ["high", "High"],
        ["medium", "Medium"],
        ["low", "Low"],
      ],
      "sev",
    );
  }

  function renderList() {
    var list = $("#list");
    list.textContent = "";
    var fs = state.res.findings.filter(function (f) {
      return (
        (state.rev === "all" || f.reviewer === state.rev) &&
        (state.sev === "all" || f.severity === state.sev)
      );
    });
    $("#count").textContent =
      fs.length + " shown of " + state.res.findings.length;
    if (!fs.length) {
      list.appendChild(
        h("li", {
          class: "empty",
          text: state.res.findings.length
            ? "Nothing matches these filters."
            : "These rules found nothing. That does not make the code flawless, only that none of the checks fired.",
        }),
      );
      return;
    }
    fs.forEach(function (f) {
      var url = blobUrl(f),
        body = h("div", { class: "body" }, [
          f.code
            ? h("pre", {}, [
                h("code", { text: (f.line ? f.line + "  " : "") + f.code }),
              ])
            : null,
          h("p", {}, [h("b", { text: "Why it matters. " }), f.why]),
          h("p", {}, [h("b", { text: "Fix. " }), f.fix]),
          url
            ? h("p", {}, [
                h("a", {
                  href: url,
                  target: "_blank",
                  rel: "noopener",
                  text: "Open " + where(f) + " on GitHub",
                }),
              ])
            : null,
        ]);
      var head = h("button", { type: "button", "aria-expanded": "false" }, [
        h("span", { class: "sev", text: f.severity }),
        h("span", {}, [
          h("span", { class: "ft", text: f.title }),
          h("span", { class: "fp", text: where(f) }),
        ]),
        h("span", {
          class: "who",
          text: (REV.filter(function (r) {
            return r[0] === f.reviewer;
          })[0] || [0, f.reviewer])[1],
        }),
      ]);
      var li = h("li", { class: "f " + f.severity, "data-open": "false" }, [
        head,
        body,
      ]);
      head.addEventListener("click", function () {
        var o = li.dataset.open !== "true";
        li.dataset.open = String(o);
        head.setAttribute("aria-expanded", String(o));
      });
      list.appendChild(li);
    });
  }

  function mdText(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/([`*_{}\[\]()<>!#|])/g, "\\$1")
      .replace(/[\r\n]+/g, " ");
  }
  function markdown() {
    var d = state.data,
      s = state.spec,
      L = [
        "# Repo Doctor report: " +
          (d.sample
            ? "dispatch-board (local example)"
            : s.owner + "/" + s.repo),
        "",
        (d.sample
          ? "Original bundled example. No GitHub requests, branch or immutable commit."
          : "Branch: " + mdText(d.branch) + ". Commit: " + d.ref + ".") +
          " Files read: " +
          d.fetched +
          " of " +
          d.tree.length +
          ". Rule-based static analysis, not a security audit.",
        "",
        "Coverage: up to 160 text files, 150 KB each; excludes vendored/minified code. Unreadable candidates: " +
          d.failures.length +
          ". Truncated tree: " +
          d.truncatedTree +
          ". Truncated file list: " +
          d.truncatedList +
          ".",
        "",
        "| Rule set | Score | Findings |",
        "|---|---|---|",
      ];
    REV.forEach(function (r) {
      L.push(
        "| " +
          r[1] +
          " | " +
          RepoDoctor.score(state.res.findings, r[0]) +
          " | " +
          state.res.findings.filter(function (f) {
            return f.reviewer === r[0];
          }).length +
          " |",
      );
    });
    REV.forEach(function (r) {
      var fs = state.res.findings.filter(function (f) {
        return f.reviewer === r[0];
      });
      if (!fs.length) return;
      L.push("", "## " + r[1], "");
      fs.forEach(function (f) {
        L.push(
          "- **[" +
            f.severity +
            "] " +
            mdText(f.title) +
            "** - " +
            mdText(where(f)),
          "  - Why: " + mdText(f.why),
          "  - Fix: " + mdText(f.fix),
        );
      });
    });
    return L.join("\n") + "\n";
  }
  function download(name, text, type) {
    var a = h("a", {
      href: URL.createObjectURL(new Blob([text], { type: type })),
      download: name,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
  }

  async function analyzeInWorker(data, signal) {
    if (signal.aborted)
      throw new DOMException("Review cancelled", "AbortError");
    return new Promise(function (resolve, reject) {
      var worker;
      try {
        worker = new Worker("review-worker.js");
      } catch (e) {
        reject(
          new Error(
            "This browser could not start the review worker. Check worker support and reload.",
          ),
        );
        return;
      }
      var done = false,
        timer;
      function finish(error, result) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        worker.terminate();
        error ? reject(error) : resolve(result);
      }
      function abort() {
        finish(new DOMException("Review cancelled", "AbortError"));
      }
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(function () {
        finish(
          new Error("Analysis exceeded 20 seconds. No report was produced."),
        );
      }, 20000);
      worker.onerror = function () {
        finish(new Error("The review worker failed. No report was produced."));
      };
      worker.onmessage = function (event) {
        event.data.error
          ? finish(new Error(event.data.error))
          : finish(null, event.data.result);
      };
      worker.postMessage({ tree: data.tree, files: data.files });
    });
  }
  function localData() {
    var files = RepoSample.files(),
      tree = Object.keys(files).map(function (path) {
        return {
          path: path,
          size: new TextEncoder().encode(files[path]).length,
        };
      });
    return {
      sample: true,
      info: {
        description:
          "Original bundled example. Not a real repository or customer report.",
        language: "JavaScript / Python",
      },
      branch: null,
      ref: "local-example",
      tree: tree,
      files: files,
      failures: [],
      truncatedTree: false,
      truncatedList: false,
      totalCandidate: tree.length,
      fetched: tree.length,
    };
  }
  async function examine(raw, isSample) {
    fail("");
    var spec = isSample
      ? { owner: "local-example", repo: "dispatch-board" }
      : RepoGitHub.parseUrl(raw);
    if (!spec) {
      fail(
        "That does not look like a GitHub repository. Use a link like github.com/owner/repo.",
      );
      return;
    }
    if (activeReview) activeReview.abort();
    var controller = new AbortController(),
      id = ++reviewId;
    activeReview = controller;
    document.body.classList.add("reviewing");
    state.spec = spec;
    $("#go").disabled = true;
    show("#hero", false);
    show("#report", false);
    show("#run", true);
    window.scrollTo(0, 0);
    $("#bar").style.width = "4%";
    $("#runTitle").textContent = isSample
      ? "Reading the local example"
      : "Reading " + spec.owner + "/" + spec.repo;
    $("#runSub").textContent = isSample
      ? "Loading bundled code. No GitHub requests."
      : "Asking GitHub for the file list";
    try {
      var data = isSample
        ? localData()
        : await RepoGitHub.load(
            spec,
            function (k, p) {
              if (id !== reviewId) return;
              if (k === "tree") {
                $("#runSub").textContent =
                  "Branch " + p.ref + ". Listing files";
                $("#bar").style.width = "12%";
              } else {
                $("#bar").style.width =
                  12 + (78 * p.done) / Math.max(1, p.total) + "%";
                $("#runSub").textContent =
                  p.done + " of " + p.total + " files  " + p.path;
              }
            },
            controller.signal,
          );
      if (id !== reviewId || controller.signal.aborted) return;
      $("#runTitle").textContent = "Applying the four rule sets";
      $("#bar").style.width = "95%";
      await new Promise(function (r) {
        setTimeout(r, 30);
      });
      if (id !== reviewId || controller.signal.aborted) return;
      var res = await analyzeInWorker(data, controller.signal);
      if (id !== reviewId || controller.signal.aborted) return;
      state.data = data;
      state.res = res;
      state.rev = "all";
      state.sev = "all";
      show("#run", false);
      render();
      show("#hero", false);
      show("#report", true);
      window.scrollTo(0, 0);
      $("#rName").setAttribute("tabindex", "-1");
      $("#rName").focus({ preventScroll: true });
    } catch (e) {
      if (id !== reviewId) return;
      show("#run", false);
      show("#hero", true);
      $("#url").focus();
      fail(
        e.name === "AbortError"
          ? "Review cancelled. No report was produced."
          : e.message || "Something went wrong while reading the repository.",
      );
    } finally {
      if (id === reviewId) {
        $("#go").disabled = false;
        activeReview = null;
        document.body.classList.remove("reviewing");
      }
    }
  }

  function render() {
    var d = state.data,
      s = state.spec,
      i = d.info;
    $("#reportOrigin").textContent = d.sample
      ? "Local example / no GitHub requests"
      : "Commit-pinned source";
    $("#rMeta").textContent = d.sample
      ? "Local example · " + d.fetched + " bundled files · no commit"
      : "Commit " +
        d.ref.slice(0, 12) +
        " (" +
        d.branch +
        ")" +
        "  /  " +
        d.fetched +
        " of " +
        d.tree.length +
        " files read" +
        (i.language ? "  /  " + i.language : "");
    $("#rName").textContent = d.sample
      ? "dispatch-board / local example"
      : s.owner + "/" + s.repo;
    $("#rDesc").textContent = i.description || "";
    var notes = [];
    if (d.sample)
      notes.push(
        "This is a local demonstration, not a review of a GitHub repository.",
      );
    notes.push(
      "Heuristic findings only, not a security audit or proof of safety. Files above 150 KB, vendored code and non-text files are not reviewed.",
    );
    if (d.failures && d.failures.length)
      notes.push(
        d.failures.length +
          " candidate file(s) could not be read. This report is incomplete.",
      );
    if (d.truncatedList)
      notes.push(
        "This repository has more readable files than the 160-file limit, so source files and manifests were prioritised before shorter paths.",
      );
    if (d.truncatedTree)
      notes.push(
        "GitHub returned a truncated file list for this very large repository.",
      );
    if (state.res.skippedMinified.length)
      notes.push(
        state.res.skippedMinified.length + " minified file(s) were skipped.",
      );
    var hid = Object.keys(state.res.hidden).reduce(function (a, k) {
      return a + state.res.hidden[k];
    }, 0);
    if (hid)
      notes.push(
        hid + " repeated findings were folded away so the list stays readable.",
      );
    $("#rNote").textContent = notes.join(" ");
    $("#rNote").hidden = !notes.length;
    renderCrew();
    renderFilters();
    renderList();
  }

  $("#sampleRun").addEventListener("click", function () {
    examine(null, true);
  });
  $("#cancel").addEventListener("click", function () {
    if (activeReview) activeReview.abort();
  });
  $("#form").addEventListener("submit", function (e) {
    e.preventDefault();
    examine($("#url").value);
  });
  document.querySelectorAll(".chip").forEach(function (c) {
    c.addEventListener("click", function () {
      $("#url").value = c.dataset.u;
      examine(c.dataset.u);
    });
  });
  $("#dlMd").addEventListener("click", function () {
    download(state.spec.repo + "-repo-doctor.md", markdown(), "text/markdown");
  });
  $("#dlJson").addEventListener("click", function () {
    download(
      state.spec.repo + "-repo-doctor.json",
      JSON.stringify(
        {
          repo: state.spec.owner + "/" + state.spec.repo,
          sample: !!state.data.sample,
          branch: state.data.branch,
          commit: state.data.sample ? null : state.data.ref,
          coverage: {
            filesRead: state.data.fetched,
            treeFiles: state.data.tree.length,
            maximumFiles: 160,
            maximumBytesPerFile: 150000,
            truncatedTree: state.data.truncatedTree,
            truncatedList: state.data.truncatedList,
          },
          failures: state.data.failures,
          incomplete: !!(
            state.data.truncatedTree ||
            state.data.truncatedList ||
            state.data.failures.length
          ),
          scores: REV.reduce(function (o, r) {
            o[r[0]] = RepoDoctor.score(state.res.findings, r[0]);
            return o;
          }, {}),
          findings: state.res.findings,
        },
        null,
        2,
      ),
      "application/json",
    );
  });
  $("#again").addEventListener("click", function () {
    show("#report", false);
    show("#hero", true);
    $("#url").value = "";
    $("#url").focus();
  });
  var q = new URLSearchParams(location.search).get("repo");
  if (q) {
    $("#url").value = q;
    examine(q);
  }
})();
