/* Original local specimen. These strings are inspected, never executed. */
(function (root) {
  "use strict";
  const examples = {
    "server.py": {
      rule: "sec-sql-concat",
      before:
        "import sqlite3\n\n\ndef find_user(db, name):\n    return db.execute(f\"SELECT id, name FROM users WHERE name = '{name}'\")\n",
      after:
        'import sqlite3\n\n\ndef find_user(db, name):\n    return db.execute("SELECT id, name FROM users WHERE name = ?", (name,))\n',
    },
    "queue.js": {
      rule: "perf-await-loop",
      before:
        "export async function loadItems(ids) {\n  const items = [];\n  for (const id of ids) {\n    const item = await fetchItem(id);\n    items.push(item);\n  }\n  return items;\n}\n",
      after:
        "export async function loadItems(ids) {\n  // Suitable only when requests are independent.\n  // Bound concurrency for large input lists.\n  return Promise.all(ids.map(id => fetchItem(id)));\n}\n",
    },
    "view.js": {
      rule: "sec-innerhtml",
      before:
        'export function showMessage(node, message) {\n  node.innerHTML = message;\n  node.classList.add("visible");\n}\n',
      after:
        'export function showMessage(node, message) {\n  node.textContent = message;\n  node.classList.add("visible");\n}\n',
    },
  };
  const fixed = {};
  function files() {
    return Object.assign(
      {
        "README.md":
          "# Dispatch board\nOriginal local review example. Not a deployed service.",
        LICENSE: "MIT License\nCopyright (c) 2026 Aditya Kulkarni",
        ".gitignore": "node_modules/\n.env\n",
        "package.json":
          '{"name":"dispatch-board-example","private":true,"dependencies":{"express":"*"}}',
      },
      Object.fromEntries(
        Object.entries(examples).map(([name, data]) => [
          name,
          data[fixed[name] ? "after" : "before"],
        ]),
      ),
    );
  }
  const api = { examples, fixed, files };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RepoSample = api;
})(typeof self !== "undefined" ? self : this);
