'use client';
import { animate } from 'framer-motion';
import { createContext, useContext, useEffect, useRef } from 'react';
import { fillMs } from '@/lib/format';
import { shake } from './fx';

/** Remembers the last value shown for each bar, so the next render fills from there. */
const shown = new Map<string, number>();
export const forgetProgress = () => shown.clear();

/** While a drawer is open, bars wait so the fill happens where the person can see it. */
export const HoldFill = createContext(false);

export const EASE_IO: [number, number, number, number] = [0.65, 0, 0.35, 1];

export function ProgressBar({ k, p, index = 0, label = false }: { k: string; p: number; index?: number; label?: boolean }) {
  const hold = useContext(HoldFill);
  const bar = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);
  const text = useRef<HTMLElement>(null);
  // Fixed for the life of this element, so re-renders never fight the running animation.
  const start = useRef(shown.has(k) ? shown.get(k)! : 0).current;

  useEffect(() => {
    if (hold) return;
    const f = fill.current, b = bar.current;
    if (!f || !b) return;
    const set = (v: number) => {
      f.style.setProperty('--p', String(v));
      if (text.current) text.current.textContent = Math.round(v * 100) + '%';
    };
    const prev = shown.has(k) ? shown.get(k)! : 0;
    shown.set(k, p);
    if (prev === p) {
      set(p);
      b.classList.toggle('full', p === 1);
      return;
    }
    b.classList.remove('full');
    let stop = () => {};
    const timer = setTimeout(() => {
      const ctl = animate(prev, p, {
        duration: fillMs(p - prev) / 1000,
        ease: EASE_IO,
        onUpdate: set,
        onComplete: () => {
          if (p === 1) {
            b.classList.add('full');
            shake(b);
          }
        },
      });
      stop = () => ctl.stop();
    }, Math.min(index, 8) * 70);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [k, p, hold, index]);

  const barEl = (
    <div ref={bar} className={`bar ${start === 1 && p === 1 ? 'full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
      <i ref={fill} style={{ '--p': start } as React.CSSProperties} />
    </div>
  );
  if (!label) return barEl;
  return (
    <div className="prog">
      {barEl}
      <b ref={text}>{Math.round(start * 100)}%</b>
    </div>
  );
}
