import React from 'react';

function Botanica() {
  return (
    <svg aria-hidden="true" viewBox="0 0 390 844" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <g id="lf"><path d="M0 0C30-40 110-46 170 0C110 46 30 40 0 0Z" /><path d="M10 0H158" fill="none" stroke="#1E2580" strokeOpacity="0.45" strokeWidth="2" /></g>
        <g id="mo"><path d="M0 0C-6-70 60-118 130-100C196-82 214 0 176 52C140 100 50 96 0 0Z" /><path d="M0 0L130-14" fill="none" stroke="#1E2580" strokeOpacity="0.5" strokeWidth="3" /><path d="M78-34L150-60M92 2L182 14M70 36L142 76M52-62L92-104" fill="none" stroke="#2E37B0" strokeWidth="9" strokeLinecap="round" /></g>
        <path id="hl" d="M0 26C-28 8-30-18-12-24C-4-27 0-20 0-14C0-20 4-27 12-24C30-18 28 8 0 26Z" />
        <g id="fl"><ellipse cy="-15" rx="10" ry="15" /><ellipse cy="-15" rx="10" ry="15" transform="rotate(72)" /><ellipse cy="-15" rx="10" ry="15" transform="rotate(144)" /><ellipse cy="-15" rx="10" ry="15" transform="rotate(216)" /><ellipse cy="-15" rx="10" ry="15" transform="rotate(288)" /><circle r="7" fill="#F6E27F" /></g>
        <g id="wf"><circle cy="-5" r="4.5" /><circle cx="5" cy="-1.5" r="4.5" /><circle cx="3" cy="4.5" r="4.5" /><circle cx="-3" cy="4.5" r="4.5" /><circle cx="-5" cy="-1.5" r="4.5" /><circle r="2.4" fill="#F49A9E" /></g>
        <g id="wc"><use href="#wf" /><use href="#wf" transform="translate(15 -7) scale(0.8)" /><use href="#wf" transform="translate(11 13) scale(0.85)" /><use href="#wf" transform="translate(-13 9) scale(0.75)" /><use href="#wf" transform="translate(-9 -13) scale(0.8)" /></g>
      </defs>
      <use href="#mo" fill="#4A55D6" transform="translate(-30 120) rotate(-20) scale(1.2)" />
      <use href="#mo" fill="#5F6DE0" transform="translate(250 40) rotate(150) scale(1.1)" />
      <use href="#lf" fill="#7C8BEB" transform="translate(120 -10) rotate(60) scale(1.1)" />
      <use href="#lf" fill="#A9C4F0" transform="translate(395 150) rotate(-170)" />
      <use href="#lf" fill="#3F4ACB" transform="translate(140 236) rotate(-40) scale(0.9)" />
      <use href="#mo" fill="#6C7BE8" transform="translate(340 236) rotate(200) scale(0.8)" />
      <use href="#hl" fill="#F6E27F" transform="translate(40 40) rotate(-20)" />
      <use href="#hl" fill="#F6E27F" transform="translate(215 160) rotate(30) scale(1.2)" />
      <use href="#hl" fill="#F6E27F" transform="translate(362 66) rotate(10) scale(0.9)" />
      <use href="#fl" fill="#F49A9E" transform="translate(112 112) scale(1.4)" />
      <use href="#fl" fill="#E86E86" transform="translate(300 104) scale(1.1)" />
      <use href="#wc" fill="#FFFFFF" transform="translate(66 204)" />
      <use href="#wc" fill="#FFFFFF" transform="translate(190 56)" />
      <use href="#wc" fill="#FFFFFF" transform="translate(356 196) scale(0.8)" />
      <circle cx="250" cy="200" r="5" fill="#F49A9E" /><circle cx="262" cy="194" r="4" fill="#F49A9E" /><circle cx="30" cy="150" r="4" fill="#F6E27F" />
      <use href="#mo" fill="#4A55D6" transform="translate(-40 566) rotate(-30)" />
      <use href="#lf" fill="#A9C4F0" transform="translate(222 520) rotate(-10) scale(1.1)" />
      <use href="#mo" fill="#5F6DE0" transform="translate(424 600) rotate(190)" />
      <use href="#fl" fill="#F49A9E" transform="translate(172 590) scale(1.5)" />
      <use href="#hl" fill="#F6E27F" transform="translate(84 520)" />
      <use href="#wc" fill="#FFFFFF" transform="translate(302 524)" />
      <use href="#lf" fill="#7C8BEB" transform="translate(-20 820) rotate(-50) scale(1.2)" />
      <use href="#mo" fill="#4A55D6" transform="translate(262 770) rotate(-30)" />
      <use href="#fl" fill="#E86E86" transform="translate(362 826)" />
      <use href="#hl" fill="#F6E27F" transform="translate(32 690)" />
    </svg>
  );
}

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
    <div className="flex min-h-screen justify-center bg-[#2E37B0]">
      <div className="relative h-dvh w-full max-w-[390px] overflow-hidden text-white" style={{ background: '#2E37B0' }}>
        <Botanica />
        <div className="absolute inset-x-0 top-[28%] flex h-[200px] flex-col items-center justify-center gap-3 bg-[#3A44C4] px-6 shadow-[0_10px_30px_rgba(20,24,90,0.35)]">
          <h1 className="m-0 font-serif text-[52px] font-light tracking-[0.16em] text-[#F9C4C6]">CYCLIA</h1>
          <div className="h-[3px] w-12 rounded-full bg-[#F6E27F]" />
          <p className="m-0 text-base font-semibold">{subtitle}</p>
        </div>
        <div className="absolute inset-x-5 bottom-7 flex flex-col gap-3 rounded-[26px] bg-[#3A44C4] p-6 shadow-[0_12px_32px_rgba(20,24,90,0.4)]">
          {error && <p className="rounded-2xl bg-white/15 px-3 py-2 text-xs">{error}</p>}
          <p className="m-0 text-[15px] leading-relaxed">{body}</p>
          <button type="button" onClick={onPrimary} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-base font-extrabold text-[#1B1F5E]">{primaryLabel}</button>
          {secondaryLabel && onSecondary && (
            <button type="button" onClick={onSecondary} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-bold text-[#1B1F5E]">{secondaryLabel}</button>
          )}
          {extra}
          <p className="m-0 text-center text-xs text-[#D2DDF8]">Cyclia es educativa y de bienestar: no reemplaza a un profesional de salud.</p>
        </div>
      </div>
    </div>
  );
}
