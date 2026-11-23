(function () {
  "use strict";
  const $ = (s) => document.querySelector(s),
    sample = window.RepoSample;
  let selected = "server.py";
  function render() {
    const files = sample.files(),
      tree = Object.entries(files).map(([path, text]) => ({
        path,
        size: new TextEncoder().encode(text).length,
      }));
    const result = RepoDoctor.analyze({ tree, files }),
      example = sample.examples[selected];
    const finding = result.findings.find(
      (f) => f.path === selected && f.id === example.rule,
    );
    $("#previewPath").textContent = selected;
    $("#previewCode").replaceChildren();
    files[selected]
      .trimEnd()
      .split("\n")
      .forEach((line, i) => {
        const li = document.createElement("li"),
          code = document.createElement("code");
        code.textContent = line || " ";
        li.append(code);
        if (finding?.line === i + 1) li.className = "flagged";
        $("#previewCode").append(li);
      });
    $("#previewSeverity").textContent = finding
      ? finding.reviewer.charAt(0).toUpperCase() +
        finding.reviewer.slice(1) +
        " · " +
        finding.severity
      : "Sample change applied";
    $("#previewTitle").textContent = finding
      ? finding.title
      : "This rule no longer matches.";
    $("#previewWhy").textContent = finding
      ? finding.why
      : "The sample now uses a different pattern. This is not proof that the code is correct or secure. Read it in context.";
    $("#previewLine").textContent = finding ? "L" + finding.line : "n/a";
    $("#sampleFix").replaceChildren(
      document.createTextNode(
        sample.fixed[selected]
          ? "Restore the sample issue"
          : "Apply the sample fix",
      ),
    );
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    $("#sampleFix").append(arrow);
    $("#previewState").textContent = finding
      ? "Computed by the actual rule engine"
      : "Rechecked by the same rule engine";
    document
      .querySelectorAll("[data-file]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.file === selected)),
      );
  }
  document.querySelectorAll("[data-file]").forEach((b) =>
    b.addEventListener("click", () => {
      selected = b.dataset.file;
      render();
    }),
  );
  $("#sampleFix").addEventListener("click", () => {
    sample.fixed[selected] = !sample.fixed[selected];
    render();
  });
  const dialog = $("#methodDialog");
  let invoker = null,
    background = [];
  function restore() {
    if (dialog.open) return;
    for (const [el, inert] of background) el.inert = inert;
    background = [];
    const previous = invoker;
    invoker = null;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }
  function close() {
    dialog.close();
    restore();
  }
  function open(event) {
    if (dialog.open) return;
    invoker = event.currentTarget;
    background = [...document.body.children]
      .filter(
        (el) => el !== dialog && !["SCRIPT", "STYLE"].includes(el.tagName),
      )
      .map((el) => [el, el.inert]);
    dialog.showModal();
    for (const [el] of background) el.inert = true;
    $("#methodClose").focus({ preventScroll: true });
  }
  for (const id of ["methodOpen", "methodInline", "methodReport"])
    $("#" + id).addEventListener("click", open);
  $("#methodClose").addEventListener("click", close);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("close", restore);
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      close();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const items = [
      ...dialog.querySelectorAll(
        'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.getClientRects().length);
    if (!items.length) {
      dialog.focus();
      return;
    }
    const i = items.indexOf(document.activeElement);
    items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
  });
  document.addEventListener("focusin", (e) => {
    if (dialog.open && !dialog.contains(e.target))
      $("#methodClose").focus({ preventScroll: true });
  });
  render();
})();
