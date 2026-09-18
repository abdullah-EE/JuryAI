// tsx asks Node for the current user to name a temporary directory. The
// managed Windows demo environment can deny that OS lookup, so provide a
// test-process-only numeric identity before tsx loads.
if (typeof process.geteuid !== "function") {
  Object.defineProperty(process, "geteuid", { value: () => 1000 });
}

