'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Scales its children down (never up) so the printed sheet always lands on a
 * single page, however many rows the queue has. Shrinks height and width by
 * the same factor, then stretches the box back out to fill the page, so text
 * gets smaller instead of the sheet gaining a blank strip down one side.
 */
export function FitOnePage({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    function fit() {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      // Measure at natural size — a stale scale from a prior pass would throw
      // off scrollHeight, since the transform doesn't affect layout flow.
      inner.style.transform = 'none';
      inner.style.width = '100%';
      const available = outer.clientHeight;
      const needed = inner.scrollHeight;
      setScale(available > 0 && needed > available ? Math.max(available / needed, 0.4) : 1);
    }

    fit();
    window.addEventListener('beforeprint', fit);
    const mq = window.matchMedia('print');
    mq.addEventListener('change', fit);
    return () => {
      window.removeEventListener('beforeprint', fit);
      mq.removeEventListener('change', fit);
    };
  }, [children]);

  return (
    <div ref={outerRef} className="print-fit">
      <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: `${100 / scale}%` }}>
        {children}
      </div>
    </div>
  );
}
