import { SparkleDoodle } from './Doodles'

/**
 * The app's margin note: one cheeky handwritten line, rotated in every few
 * hours by pickQuip. Deliberately chromeless — no card, no border — so the
 * calm screens stay calm.
 */
export function Quip({ text }: { text: string }) {
  return (
    <p className="tilt-l flex w-fit items-baseline gap-2 font-display text-lg leading-snug text-cream-300">
      <SparkleDoodle className="h-3.5 w-3.5 shrink-0 translate-y-0.5 opacity-80" />
      {text}
    </p>
  )
}
