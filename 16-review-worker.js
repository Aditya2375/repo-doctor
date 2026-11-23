"use strict";
importScripts("analyzers.js");
self.onmessage = function (event) {
  try {
    self.postMessage({ result: RepoDoctor.analyze(event.data) });
  } catch (error) {
    self.postMessage({
      error:
        "The rules could not complete this review. No report was produced.",
    });
  }
};
