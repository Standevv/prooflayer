/**
 * HeroWordmark — oversized PROOFLAYER as a subtle background element.
 * Server-safe, no "use client" needed.
 * Uses pure CSS for the background text effect.
 */
export function HeroWordmark() {
  return (
    <span
      className="hero-bg-wordmark hero-bg-wordmark-right"
      aria-hidden="true"
    >
      PROOFLAYER
    </span>
  );
}
