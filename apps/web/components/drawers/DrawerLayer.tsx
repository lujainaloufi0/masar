'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { usePrefs } from '@/lib/prefs';
import { useDrawer } from '../drawer-ctx';
import { TaskDrawer } from './TaskDrawer';
import { TaskForm } from './TaskForm';
import { EmpDrawer } from './EmpDrawer';

/** The side panel. It stays mounted while its content changes, so moving between views inside it doesn't replay the entrance. */
export function DrawerLayer() {
  const { drawer, close } = useDrawer();
  const { lang } = usePrefs();
  const ref = useRef<HTMLElement>(null);
  const dx = lang === 'ar' ? -40 : 40;

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.pop')) close();
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')].filter((x) => !x.hasAttribute('disabled') && x.offsetParent);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, close]);

  const key = drawer ? `${drawer.type}:${'id' in drawer ? drawer.id : 'editId' in drawer ? drawer.editId ?? 'new' : ''}` : '';

  useEffect(() => {
    if (!drawer) return;
    const f = ref.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('.drawer-h .icon-btn');
    f?.focus({ preventScroll: true });
  }, [key, drawer]);

  return (
    <AnimatePresence>
      {drawer && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.25 } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          />
          <motion.aside
            key="drawer"
            ref={ref}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dTitle"
            initial={{ x: dx, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ x: dx, opacity: 0, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
          >
            {drawer.type === 'task' && <TaskDrawer key={drawer.id} id={drawer.id} />}
            {drawer.type === 'taskForm' && <TaskForm key={drawer.editId ?? 'new'} editId={drawer.editId} />}
            {drawer.type === 'emp' && <EmpDrawer key={drawer.id ?? 'new'} id={drawer.id} />}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
