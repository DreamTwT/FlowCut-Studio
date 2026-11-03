import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  rightMeta?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps<T extends string = string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  size?: 'xs' | 'sm' | 'md';
  accent?: 'cyan' | 'amber';
  className?: string;
  menuMinWidth?: number;
  title?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
  prefixLabel?: string;
}

export function CustomSelect<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = '请选择...',
  size = 'md',
  accent = 'cyan',
  className = '',
  menuMinWidth,
  title,
  disabled = false,
  stopPropagation = false,
  prefixLabel,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 0, left: 0, width: 180, maxHeight: 260 });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOpt = selectedIndex >= 0 ? options[selectedIndex] : null;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const desiredWidth = Math.max(rect.width, menuMinWidth || (size === 'xs' ? 128 : 168));
    const clampedLeft = Math.max(8, Math.min(rect.left, vw - desiredWidth - 8));

    const spaceBelow = vh - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const openUpward = spaceBelow < 185 && spaceAbove > spaceBelow;

    if (openUpward) {
      setCoords({
        bottom: vh - rect.top + 5,
        left: clampedLeft,
        width: desiredWidth,
        maxHeight: Math.min(280, Math.max(120, spaceAbove)),
      });
    } else {
      setCoords({
        top: rect.bottom + 5,
        left: clampedLeft,
        width: desiredWidth,
        maxHeight: Math.min(280, Math.max(120, spaceBelow)),
      });
    }
  }, [menuMinWidth, size]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    setHighlightIdx(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, updatePosition, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return; // scrolling inside the dropdown list itself
      }
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => (options.length ? (i + 1) % options.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) =>
          options.length ? (i - 1 + options.length) % options.length : 0
        );
      } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < options.length) {
        e.preventDefault();
        onChange(options[highlightIdx].value);
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, options, highlightIdx, onChange, updatePosition]);

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] rounded gap-1 min-h-[20px]'
      : size === 'sm'
      ? 'px-2 py-1 text-[11px] rounded-md gap-1.5 min-h-[26px]'
      : 'px-2.5 py-1.5 text-xs rounded-lg gap-2 min-h-[32px]';

  const openBorderClass =
    accent === 'amber'
      ? 'border-[#FFB800] bg-[#1E2231] shadow-[0_0_0_2px_rgba(255,184,0,0.16)]'
      : 'border-[#00E5FF] bg-[#1E2231] shadow-[0_0_0_2px_rgba(0,229,255,0.16)]';

  const closedBorderClass =
    size === 'xs'
      ? 'border-[#2E3448] bg-[#212534] hover:bg-[#2A3044] hover:border-[#424B68]'
      : 'border-[#2C3144] bg-[#161923] hover:bg-[#1E2332] hover:border-[#3E4660]';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={title || selectedOpt?.label}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        }}
        className={`border text-left text-[#ECEEF2] outline-none transition flex items-center justify-between select-none disabled:opacity-45 ${sizeClasses} ${
          open ? openBorderClass : closedBorderClass
        } ${className}`}
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          {selectedOpt?.icon && <span className="shrink-0">{selectedOpt.icon}</span>}
          {prefixLabel && (
            <span className="text-[#8A90A2] shrink-0 font-normal">{prefixLabel}</span>
          )}
          <span className={`truncate ${selectedOpt ? 'text-[#F1F5F9] font-medium' : 'text-[#8A90A2]'}`}>
            {selectedOpt ? selectedOpt.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`shrink-0 transition-transform duration-150 ${
            size === 'xs' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
          } ${
            open
              ? accent === 'amber'
                ? 'rotate-180 text-[#FFB800]'
                : 'rotate-180 text-[#00E5FF]'
              : 'text-[#8A90A2]'
          }`}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => {
              if (stopPropagation) e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              zIndex: 9999,
            }}
            className="rounded-xl bg-[#171A25]/98 backdrop-blur-md border border-[#343C55] shadow-[0_16px_44px_rgba(0,0,0,0.82)] p-1 overflow-y-auto select-none"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightIdx;
              const activeClass =
                accent === 'amber'
                  ? 'bg-[#FFB800]/16 text-[#FFB800] font-semibold'
                  : 'bg-[#00E5FF]/15 text-[#00E5FF] font-semibold';

              return (
                <button
                  key={`${String(opt.value)}_${idx}`}
                  type="button"
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={(e) => {
                    if (stopPropagation) e.stopPropagation();
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left transition flex items-center justify-between gap-2 ${
                    size === 'xs' ? 'text-[11px]' : 'text-xs'
                  } ${
                    isSelected
                      ? activeClass
                      : isHighlighted
                      ? 'bg-[#252B3E] text-white'
                      : 'text-[#CBD5E1] hover:bg-[#23283A] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0 truncate">
                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                    <span className="truncate">{opt.label}</span>
                  </span>

                  <span className="flex items-center gap-1.5 shrink-0">
                    {opt.rightMeta && (
                      <span
                        className={`text-[10px] font-mono ${
                          isSelected ? 'opacity-90' : 'text-[#7E8596]'
                        }`}
                      >
                        {opt.rightMeta}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className={`w-3.5 h-3.5 shrink-0 ${
                          accent === 'amber' ? 'text-[#FFB800]' : 'text-[#00E5FF]'
                        }`}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
