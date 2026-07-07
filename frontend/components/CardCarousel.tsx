"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

const AUTO_ADVANCE_MS = 4000;
const STEP_FRACTION = 0.8;

export function CardCarousel({
  children,
  loop = false,
  autoAdvance = true,
  arrowPosition = "overlay",
}: {
  children: ReactNode;
  /** Duplicates the row once and seamlessly wraps back to the start
   *  instead of visibly rewinding to the beginning. */
  loop?: boolean;
  autoAdvance?: boolean;
  /** "overlay": small arrows fade in over the row on hover.
   *  "below": larger, always-visible Previous/Next buttons under the row. */
  arrowPosition?: "overlay" | "below";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!autoAdvance) return;

    const timer = setInterval(() => {
      const scroller = scrollerRef.current;
      if (!scroller || pausedRef.current) return;

      const step = scroller.clientWidth * STEP_FRACTION;

      if (loop) {
        // The row is rendered twice back-to-back. Once we've scrolled past
        // the first copy, jump back by exactly one copy's width — since
        // both copies are identical, the jump is invisible — before
        // continuing forward. That's what makes it feel infinite instead
        // of visibly rewinding to the start.
        const halfWidth = scroller.scrollWidth / 2;
        let nextLeft = scroller.scrollLeft + step;
        if (nextLeft >= halfWidth) {
          scroller.scrollLeft -= halfWidth;
          nextLeft -= halfWidth;
        }
        scroller.scrollTo({ left: nextLeft, behavior: "smooth" });
      } else {
        const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 8;
        scroller.scrollTo({
          left: atEnd ? 0 : scroller.scrollLeft + step,
          behavior: "smooth",
        });
      }
    }, AUTO_ADVANCE_MS);

    return () => clearInterval(timer);
  }, [loop, autoAdvance]);

  function scrollByPage(direction: 1 | -1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * scroller.clientWidth * STEP_FRACTION, behavior: "smooth" });
  }

  const items = Children.toArray(children);
  const duplicated = loop
    ? items.map((child) => (isValidElement(child) ? cloneElement(child, { key: `dup-${child.key}` }) : child))
    : [];

  const scroller = (
    <div
      ref={scrollerRef}
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items}
      {duplicated}
    </div>
  );

  if (arrowPosition === "below") {
    return (
      <div>
        {scroller}
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label="Scroll left"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
          >
            &lsaquo; Previous
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label="Scroll right"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
          >
            Next &rsaquo;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
    >
      {scroller}

      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        aria-label="Scroll left"
        className="absolute left-0 top-1/2 hidden -translate-y-1/2 rounded-full border border-gray-200 bg-white p-2 opacity-0 shadow-md transition hover:bg-gray-50 group-hover:opacity-100 sm:flex"
      >
        <span aria-hidden className="block h-4 w-4 text-center leading-4">
          &lsaquo;
        </span>
      </button>
      <button
        type="button"
        onClick={() => scrollByPage(1)}
        aria-label="Scroll right"
        className="absolute right-0 top-1/2 hidden -translate-y-1/2 rounded-full border border-gray-200 bg-white p-2 opacity-0 shadow-md transition hover:bg-gray-50 group-hover:opacity-100 sm:flex"
      >
        <span aria-hidden className="block h-4 w-4 text-center leading-4">
          &rsaquo;
        </span>
      </button>
    </div>
  );
}
