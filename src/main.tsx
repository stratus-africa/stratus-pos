import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-recover from stale dynamic import chunks after a redeploy.
// When the user has an old tab open and we ship new hashed assets,
// React.lazy() imports fail with "error loading dynamically imported module".
// A one-time hard reload picks up the new chunk hashes.
const RELOAD_KEY = "__chunk_reload_attempted__";
function isChunkLoadError(msg: unknown): boolean {
  const s = typeof msg === "string" ? msg : (msg as any)?.message ?? "";
  return /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(s);
}
function tryReload() {
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
}
window.addEventListener("error", (e) => {
  if (isChunkLoadError(e.message) || isChunkLoadError(e.error)) tryReload();
});
window.addEventListener("unhandledrejection", (e) => {
  if (isChunkLoadError(e.reason)) tryReload();
});

createRoot(document.getElementById("root")!).render(<App />);
