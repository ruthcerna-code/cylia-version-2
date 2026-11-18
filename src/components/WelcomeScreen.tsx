import React from 'react';
import Cira from './Cira';

export default function WelcomeScreen({
  subtitle,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  extra,
  error,
}: {
  subtitle: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  extra?: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex min-h-dvh justify-center bg-transparent px-4 py-8 text-[#153E40]">
      <div className="flex w-full max-w-[640px] flex-col justify-end gap-6">
        <header className="flex items-center gap-4">
          <Cira size={80} />
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-normal leading-[1.1]">Cyclia</h1>
            <p className="m-0 mt-2 max-w-[36ch] text-base leading-normal">{subtitle}</p>
          </div>
        </header>
        <div className="flex flex-col gap-3 rounded-[20px] bg-[#FFF8EE] p-5">
          {error && <p className="notice-error m-0 rounded-2xl px-3 py-2 text-sm">{error}</p>}
          <p className="m-0 max-w-[65ch] text-base leading-normal">{body}</p>
          <button type="button" onClick={onPrimary} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#FF8243] text-base font-semibold text-[#153E40]">{primaryLabel}</button>
          {secondaryLabel && onSecondary && (
            <button type="button" onClick={onSecondary} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#FCE883] text-base font-semibold text-[#153E40]">{secondaryLabel}</button>
          )}
          {extra}
          <p className="m-0 text-center text-sm text-[#3E6466]">Cyclia es educativa y de bienestar: no reemplaza a un profesional de salud.</p>
        </div>
      </div>
    </div>
  );
}
