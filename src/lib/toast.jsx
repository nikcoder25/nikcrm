import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { ink, BD } from "./theme";

// Lightweight toast system: a provider holds a queue and exposes a `toast(msg,
// type)` function via context. Success/error feedback for every save lands here
// so the UI never mutates silently.
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

const TONE = {
  success: { bg: "#d7f5df", fg: "#15603a", Icon: CheckCircle2 },
  error: { bg: "#f7dede", fg: "#8f2020", Icon: AlertCircle },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((message, type = "success") => {
    if (!message) return;
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div aria-live="polite" aria-atomic="false"
        style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", gap: 10, maxWidth: "min(340px, calc(100vw - 40px))" }}>
        {toasts.map((t) => {
          const tone = TONE[t.type] || TONE.success;
          const Icon = tone.Icon;
          return (
            <div key={t.id} role="status"
              style={{ display: "flex", alignItems: "center", gap: 10, background: tone.bg, color: tone.fg, border: BD, borderRadius: 12, padding: "12px 15px", boxShadow: "4px 4px 0 " + ink, fontWeight: 800, fontSize: 13.5 }}>
              <Icon size={18} style={{ flexShrink: 0 }} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
