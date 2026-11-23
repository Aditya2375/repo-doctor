const test = require("node:test"),
  assert = require("node:assert/strict");
const A = require("../analyzers.js"),
  G = require("../github.js"),
  S = require("../sample.js");
const SHA = "a".repeat(40),
  TREE = "b".repeat(40);
function response(url, tree) {
  if (url.endsWith("/repos/owner/project"))
    return Response.json({ default_branch: "main" });
  if (url.includes("/commits/"))
    return Response.json({ sha: SHA, commit: { tree: { sha: TREE } } });
  if (url.includes("/git/trees/")) return Response.json({ tree });
  return null;
}
async function mocked(fn, run) {
  const old = global.fetch;
  global.fetch = fn;
  try {
    await run();
  } finally {
    global.fetch = old;
  }
}
function analyze(files) {
  return A.analyze({
    files,
    tree: Object.entries(files).map(([path, text]) => ({
      path,
      size: Buffer.byteLength(text),
    })),
  });
}
test("each specimen triggers its stated rule and its fix clears that rule", () => {
  for (const [path, example] of Object.entries(S.examples)) {
    delete S.fixed[path];
    assert(
      analyze(S.files()).findings.some(
        (f) => f.path === path && f.id === example.rule,
      ),
    );
    S.fixed[path] = true;
    assert(
      !analyze(S.files()).findings.some(
        (f) => f.path === path && f.id === example.rule,
      ),
    );
    delete S.fixed[path];
  }
});
test("unsupported-only repository cannot receive a report", async () => {
  await mocked(
    async (url) =>
      response(url, [{ type: "blob", path: "photo.png", size: 10 }]),
    async () => {
      await assert.rejects(
        G.load({ owner: "owner", repo: "project" }),
        /No supported text files/,
      );
    },
  );
});
test("file count, bytes and vendored limits are enforced before raw reads", async () => {
  const tree = Array.from({ length: 170 }, (_, i) => ({
    type: "blob",
    path: "src/f" + i + ".js",
    size: 20,
  })).concat([
    { type: "blob", path: "too-big.js", size: 150001 },
    { type: "blob", path: "node_modules/v/a.js", size: 20 },
  ]);
  const raw = [];
  await mocked(
    async (url) => {
      const r = response(url, tree);
      if (r) return r;
      raw.push(url);
      return new Response("const x=1;");
    },
    async () => {
      const data = await G.load({ owner: "owner", repo: "project" });
      assert.equal(data.fetched, 160);
      assert.equal(raw.length, 160);
      assert(data.truncatedList);
      assert(
        !raw.some((u) => u.includes("too-big") || u.includes("node_modules")),
      );
      assert(raw.every((u) => u.includes("/" + SHA + "/")));
    },
  );
});
test("metadata denial stops without retries", async () => {
  let count = 0;
  await mocked(
    async () => {
      count++;
      return new Response("", { status: 403 });
    },
    async () => {
      await assert.rejects(
        G.load({ owner: "owner", repo: "project" }),
        /denied/,
      );
      assert.equal(count, 1);
    },
  );
});
test("raw-file denial cancels the other workers and stops the queue", async () => {
  let raw = 0;
  const tree = Array.from({ length: 60 }, (_, i) => ({
    type: "blob",
    path: "src/f" + i + ".js",
    size: 20,
  }));
  await mocked(
    async (url) => {
      const r = response(url, tree);
      if (r) return r;
      raw++;
      return new Response("", { status: 429 });
    },
    async () => {
      await assert.rejects(
        G.load({ owner: "owner", repo: "project" }),
        /denied/,
      );
      assert(raw <= 6, "no more than the active worker set may be requested");
    },
  );
});
test("cancellation reaches raw-file reads", async () => {
  const c = new AbortController();
  let started = 0;
  const tree = [{ type: "blob", path: "a.js", size: 20 }];
  await mocked(
    async (url, options) => {
      const r = response(url, tree);
      if (r) return r;
      started++;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Cancelled", "AbortError")),
          { once: true },
        );
        setImmediate(() => c.abort());
      });
    },
    async () => {
      await assert.rejects(
        G.load({ owner: "owner", repo: "project" }, null, c.signal),
        { name: "AbortError" },
      );
      assert.equal(started, 1);
    },
  );
});
test("prototype-named dependency is inert data", () => {
  const files = {
    "package.json": '{"dependencies":{"__proto__":"*","constructor":"latest"}}',
  };
  const result = analyze(files);
  assert(
    result.findings.some(
      (f) => f.id === "arch-unpinned" && f.title.startsWith("__proto__"),
    ),
  );
  assert.equal({}.polluted, undefined);
});
test("prototype-named directory is counted normally", () => {
  const files = Object.fromEntries(
    Array.from({ length: 61 }, (_, i) => [
      "constructor/f" + i + ".js",
      "const x=1;",
    ]),
  );
  assert(
    analyze(files).findings.some(
      (f) => f.id === "arch-flat-dir" && f.path === "constructor",
    ),
  );
});
