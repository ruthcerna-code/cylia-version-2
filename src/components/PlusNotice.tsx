import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PLUS_FEATURES, PLUS_NOTICE_TITLE, plusNoticeSeen, plusNoticeText, rememberPlusNotice, type PlusFeature } from '../plus/plusFeatures';

type RequestPlus = (feature: PlusFeature) => Promise<void>;

const PlusNoticeContext = createContext<RequestPlus>(async () => undefined);

/**
 * `await requestPlus('chat_ia')` shows the paid-option notice when needed
 * and resolves when she taps OK. If she already saw it, it resolves at once.
 */
export function usePlusNotice(): RequestPlus {
  return useContext(PlusNoticeContext);
}

/** Small "Plus" label for buttons and cards of paid features. */
export function PlusBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#1B1F5E] px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-[#F6E27F]">PLUS</span>
  );
}

type Pending = { feature: PlusFeature; resolvers: Array<() => void> };

export function PlusNoticeProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const requestPlus = useCallback<RequestPlus>((feature) => {
    if (plusNoticeSeen(feature)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const current = pendingRef.current;
      // Two calls for the same feature share one notice.
      if (current && current.feature === feature) {
        current.resolvers.push(resolve);
        return;
      }
      const next = { feature, resolvers: [resolve] };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const accept = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    rememberPlusNotice(current.feature);
    pendingRef.current = null;
    setPending(null);
    current.resolvers.forEach((resolve) => resolve());
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    buttonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        accept();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, accept]);

  return (
    <PlusNoticeContext.Provider value={requestPlus}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1B1F5E]/50 px-4" role="presentation">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="plus-aviso-titulo"
            aria-describedby="plus-aviso-texto"
            className="w-full max-w-[400px] rounded-[28px] bg-white px-5 pb-5 pt-6 text-center shadow-[0_16px_40px_rgba(27,31,94,0.25)]"
          >
            <span className="inline-flex items-center rounded-full bg-[#F6E27F] px-3 py-1 text-xs font-extrabold tracking-wide text-[#1B1F5E]">CYCLIA PLUS</span>
            <h2 id="plus-aviso-titulo" className="mb-0 mt-3 text-xl font-extrabold text-[#1B1F5E]">{PLUS_NOTICE_TITLE}</h2>
            <p id="plus-aviso-texto" className="mb-0 mt-2 text-[15px] leading-relaxed text-[#3B4070]">{plusNoticeText(pending.feature)}</p>
            <p className="mb-0 mt-2 text-sm leading-relaxed text-[#4A4F7A]">{PLUS_FEATURES[pending.feature].detail}</p>
            <button
              ref={buttonRef}
              type="button"
              onClick={accept}
              className="mt-5 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]"
            >
              OK, seguir
            </button>
          </div>
        </div>
      )}
    </PlusNoticeContext.Provider>
  );
}
