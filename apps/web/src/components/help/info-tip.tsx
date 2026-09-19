'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '@/lib/brand';

/** Portaled so help is not clipped by tables, cards or the independently scrolling sidebar. */
export function InfoTip({
  locale,
  label,
  text,
}: {
  readonly locale: Locale;
  readonly label: string;
  readonly text: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    hideTimer.current = setTimeout(() => {
      setOpen(false);
    }, 120);
  };
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      const box = panel.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({
        left: Math.max(
          12,
          Math.min(anchor.left, window.innerWidth - box.width - 12),
        ),
        top: Math.max(
          12,
          Math.min(anchor.bottom + 8, window.innerHeight - box.height - 12),
        ),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, text]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !button.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <span
      className="info-tip"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') show();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') hideSoon();
      }}
    >
      <button
        ref={button}
        type="button"
        className="info-tip-button"
        aria-label={`${locale === 'ar' ? 'شرح' : 'Explain'}: ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={show}
        onBlur={() => {
          setOpen(false);
        }}
        onClick={show}
      >
        i
      </button>
      {open &&
        createPortal(
          <span
            ref={panel}
            id={id}
            role="tooltip"
            className="info-tip-content"
            style={position}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
            onPointerEnter={show}
            onPointerLeave={hideSoon}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
