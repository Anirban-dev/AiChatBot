/// <reference lib="webworker" />
import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodide: PyodideInterface | null = null;

async function initPyodide() {
  if (pyodide) return pyodide;

  // 1. Point the indexURL to the CDN instead of your local public folder
  // IMPORTANT: The version here must match the version in your package.json!
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/", 
  });

  // 2. Load essential packages (these will now automatically download from the CDN)
  await pyodide.loadPackage(["micropip", "numpy", "pandas"]);

  // 3. Setup micropip for any extra AI-requested installs
  pyodide.pyimport("micropip");

  self.postMessage({ type: "READY" });
  return pyodide;
}

// Global promise to ensure we only init once
const pyodideReadyPromise = initPyodide();

self.onmessage = async (event: MessageEvent) => {
  const py = await pyodideReadyPromise;
  const { code, id } = event.data;

  try {
    // Redirect Python's print() to our frontend
    py.setStdout({
      batched: (str: string) => {
        self.postMessage({ type: "STDOUT", str, id });
      },
    });

    const result = await py.runPythonAsync(code);
    self.postMessage({ type: "RESULT", result, id });
  } catch (error: any) {
    self.postMessage({ type: "ERROR", error: error.message, id });
  }
};