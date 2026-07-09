"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import type { ShowEvent } from "@/lib/events";

const INTERVAL_MS = 5000;

export type HeroSlide = {
  show: ShowEvent;
  image: string;
};

export function HeroCarousel({ slides, children }: { slides: HeroSlide[]; children: ReactNode }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  const active = slides[index];

  return (
    <div className="relative overflow-hidden">
      {slides.map((slide, i) => (
        <div
          key={slide.show.id}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={slide.image}
            alt={`${slide.show.name} card show floor`}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-black/45" />

      <div className="relative flex flex-col items-center gap-6 px-6 py-24 text-center text-white">
        {children}

        {active && (
          <p className="text-sm text-white/80">
            Photos from {active.show.name} &middot; {active.show.city}
          </p>
        )}

        {slides.length > 1 && (
          <div className="flex gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.show.id}
                onClick={() => setIndex(i)}
                aria-label={`Show photos from ${slide.show.name}`}
                className={`h-1.5 w-6 rounded-full transition ${
                  i === index ? "bg-white" : "bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
