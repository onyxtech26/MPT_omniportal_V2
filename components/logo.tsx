import React from 'react';

export const Logo = ({ className = "", textClassName = "" }: { className?: string, textClassName?: string }) => {
  return (
    <div className={`flex items-center gap-2 sm:gap-3 ${className}`}>
      <div className="bg-black text-white px-3 py-1 rounded-sm flex items-center justify-center shrink-0">
        <span className="font-bold text-xl tracking-tighter leading-none font-sans">MPT</span>
        <sup className="text-[8px] ml-0.5 mt-1">®</sup>
      </div>
      <span className={`font-bold text-slate-900 tracking-tight ${textClassName}`}>
        OMNIPORTAL
      </span>
    </div>
  );
};
