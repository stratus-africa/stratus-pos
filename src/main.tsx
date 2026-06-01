import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-recover from stale dynamic import chunks after a redeploy.
// Throttle by timestamp so subsequent redeploys can also trigger a reload,
// but we never loop more than once per 10s.
const RELOAD_KEY = "__chunk_reload_at__";
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadError(msg: unknown): boolean {
  const s = typeof msg === "string" ? msg : (msg as any)?.message ?? "";
  return /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(s);
}
function tryReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {}
  window.location.reload();
}
window.addEventListener("error", (e) => {
  if (isChunkLoadError(e.message) || isChunkLoadError(e.error)) tryReload();
});
window.addEventListener("unhandledrejection", (e) => {
  if (isChunkLoadError(e.reason)) tryReload();
});

createRoot(document.getElementById("root")!).render(<App />);
