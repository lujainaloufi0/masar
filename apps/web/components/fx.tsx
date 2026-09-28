'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { reducedMotion } from '@/lib/format';

/* ---------- Toasts ---------- */

type ToastKind = '' | 'gold' | 'err';
interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const toast = useCallback((msg: string, kind: ToastKind = '') => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, msg, kind }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), kind === 'err' ? 5000 : 3400);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        <AnimatePresence initial={false}>
          {items.map((x) => (
            <motion.div
              key={x.id}
              layout
              className={`toast ${x.kind}`}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, transition: { duration: 0.2 } }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <Icon name={x.kind === 'gold' ? 'completed' : x.kind === 'err' ? 'alert' : 'check'} />
              <span>{x.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Confetti ---------- */

interface Part {
  x: number; y: number; vx: number; vy: number; g: number; w: number; h: number; r: number; vr: number;
  c: string; life: number; max: number; flip: number; dot: boolean;
}

let canvas: HTMLCanvasElement | null = null;
let parts: Part[] = [];
let running = false;

export function ConfettiCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    canvas = ref.current;
    return () => {
      canvas = null;
    };
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

function burst(x: number, y: number, dir: number, spread: number, count: number, power: number) {
  if (!canvas) return;
  const cs = getComputedStyle(document.documentElement);
  const cols = [cs.getPropertyValue('--accent').trim(), cs.getPropertyValue('--gold').trim(), cs.getPropertyValue('--gold-2').trim(), '#9ED9BD', '#F4EBD0'];
  for (let i = 0; i < count; i++) {
    const a = dir + (Math.random() - 0.5) * Math.PI * spread;
    const sp = 5 + Math.random() * power;
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, g: 0.22 + Math.random() * 0.1,
      w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
      c: cols[i % cols.length], life: 0, max: 90 + Math.random() * 60, flip: Math.random() * 6.28, dot: i % 5 === 0,
    });
  }
  if (!running) loop();
}

function loop() {
  const cv = canvas;
  if (!cv) return;
  running = true;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const step = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of parts) {
      if (p.life > p.max) continue;
      alive++;
      p.life++;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.flip += 0.18;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.max - p.life) / 30);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.dot) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 2 + 1, 0, 6.28);
        ctx.fill();
      } else {
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (alive && canvas) requestAnimationFrame(step);
    else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts = [];
      running = false;
    }
  };
  step();
}

/** Confetti from the ring, then from both bottom corners. */
export function celebrateFx(x: number, y: number) {
  if (reducedMotion()) return;
  burst(x, y, -Math.PI / 2, 1.25, 160, 9);
  setTimeout(() => {
    burst(0, innerHeight, -Math.PI / 3, 0.5, 70, 15);
    burst(innerWidth, innerHeight, (-Math.PI * 2) / 3, 0.5, 70, 15);
  }, 260);
}

/** Restarts the shake animation on an element. */
export function shake(el: Element | null) {
  if (!el || reducedMotion()) return;
  el.classList.remove('celebrate');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('celebrate');
  setTimeout(() => el.classList.remove('celebrate'), 1500);
}
