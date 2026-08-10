'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

const ASSISTANT_HREF = '/dashboard/assistant';
const DISMISS_KEY = 'mpt.bot.dismissed';

// Shown one at a time; the first is the pitch, the rest hint at what it can do.
const LINES = [
  'Ask me to make your life easier',
  'Which branch is winning this month?',
  'I can query the sales data for you',
  'Try: compare Casio across branches',
];

/** Small robot, drawn inline so it needs no image asset. */
function Robot() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
      {/* antenna */}
      <line x1="32" y1="6" x2="32" y2="14" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="5" r="3.5" fill="#38bdf8" />
      {/* head */}
      <rect x="12" y="13" width="40" height="30" rx="11" fill="#0f172a" />
      {/* visor */}
      <rect x="18" y="21" width="28" height="14" rx="7" fill="#1e293b" />
      <circle cx="26" cy="28" r="3.4" fill="#38bdf8" />
      <circle cx="38" cy="28" r="3.4" fill="#38bdf8" />
      {/* ears */}
      <rect x="7" y="24" width="5" height="10" rx="2.5" fill="#334155" />
      <rect x="52" y="24" width="5" height="10" rx="2.5" fill="#334155" />
      {/* body */}
      <rect x="19" y="45" width="26" height="14" rx="6" fill="#1e293b" />
      <rect x="28" y="49" width="8" height="3" rx="1.5" fill="#38bdf8" />
    </svg>
  );
}

export function AssistantBot() {
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [dismissed, setDismissed] = useState(true);   // assume hidden until storage says otherwise
  const [lineIndex, setLineIndex] = useState(0);
  const [bubbleVisible, setBubbleVisible] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  // Say hello, then get out of the way: the bubble shows on arrival, hides
  // after ~9s, and only reappears occasionally with a different line. A
  // permanently visible bubble is the difference between a hint and a nag.
  useEffect(() => {
    if (dismissed) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setBubbleVisible(false), 9000));

    const cycle = setInterval(() => {
      setLineIndex((i) => (i + 1) % LINES.length);
      setBubbleVisible(true);
      timers.push(setTimeout(() => setBubbleVisible(false), 7000));
    }, 45000);

    return () => {
      clearInterval(cycle);
      timers.forEach(clearTimeout);
    };
  }, [dismissed]);

  // Never offer to take you somewhere you already are.
  if (dismissed || pathname?.startsWith(ASSISTANT_HREF)) return null;

  const hide = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — it just reappears next page load */
    }
  };

  // Drifts inside the bottom-right margin only. The range is deliberately
  // small: a wide wander crosses dashboard cards and turns a helper into an
  // obstruction. Held still for anyone who prefers reduced motion.
  const drift = reduceMotion
    ? {}
    : { x: [0, -26, -8, -34, 0], y: [0, -14, -4, -20, 0] };

  return (
    <motion.div
      // pointer-events-none on the wrapper so the empty space around the robot
      // never swallows clicks meant for the page beneath it; the interactive
      // parts re-enable it individually.
      className="fixed bottom-6 right-6 z-40 flex items-end gap-2 pointer-events-none print:hidden"
      // No fade-in, and no `initial` to get stuck at. Animation frames stop in
      // a background tab, so anything whose visibility depends on an entrance
      // animation completing can be left permanently invisible. The robot is
      // visible by default; motion only moves it.
      animate={drift}
      transition={{
        x: { duration: 26, repeat: Infinity, ease: 'easeInOut' },
        y: { duration: 26, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      <AnimatePresence>
        {bubbleVisible && (
          <motion.button
            key={lineIndex}
            // Same reasoning as the wrapper: start visible so a throttled tab
            // cannot leave the bubble stuck at zero opacity.
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            onClick={() => router.push(ASSISTANT_HREF)}
            className="pointer-events-auto relative mb-4 max-w-[210px] rounded-[18px] rounded-br-sm bg-white px-4 py-2.5 text-left text-xs font-semibold leading-snug text-slate-700 shadow-lg shadow-slate-900/10 border border-slate-200 cursor-pointer hover:border-slate-400 transition-colors"
          >
            {LINES[lineIndex]}
          </motion.button>
        )}
      </AnimatePresence>

      <div className="relative pointer-events-auto group">
        <motion.button
          onClick={() => router.push(ASSISTANT_HREF)}
          aria-label="Open Ask the Data"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          animate={reduceMotion ? {} : { y: [0, -5, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          // Ring + strong shadow so it reads clearly against the light
          // dashboard; slightly transparent at rest so whatever it passes over
          // stays legible, opaque once you reach for it.
          className="w-16 h-16 rounded-full bg-white ring-2 ring-slate-900/10 shadow-xl shadow-slate-900/25 p-2.5 cursor-pointer opacity-90 hover:opacity-100 transition-opacity"
        >
          <Robot />
        </motion.button>

        <button
          onClick={hide}
          aria-label="Hide the assistant robot"
          // Only offered on hover/focus, so it isn't a permanent piece of chrome.
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-300 text-slate-700 hover:bg-slate-400 flex items-center justify-center transition-opacity cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <X size={11} />
        </button>
      </div>
    </motion.div>
  );
}
