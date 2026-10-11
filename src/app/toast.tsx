import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
type Show = (text: string, action?: ToastMsg['action']) => void;
const Ctx = createContext<Show>(() => undefined);
export const useToast = (): Show => useContext(Ctx);

/** One toast at a time; an action toast (e.g. "Отменить") stays a little longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback<Show>((text, action) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setMsg({ id, text, action });
    timer.current = window.setTimeout(() => setMsg((m) => (m?.id === id ? null : m)), action ? 6000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {msg && (
          <div className="toast" key={msg.id} role="status">
            <span className="grow">{msg.text}</span>
            {msg.action && (
              <button
                type="button"
                onClick={() => {
                  msg.action?.run();
                  setMsg(null);
                }}
              >
                {msg.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
