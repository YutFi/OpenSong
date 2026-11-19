import { cn } from '../lib/util'

/** Vertical range input (native, so keyboard / screen-reader support is free). */
export function VSlider({ value, min, max, step = 0.5, onChange, label, valueText, className }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; valueText?: string; className?: string }) {
  return (
    <input
      type="range" min={min} max={max} step={step} value={value} aria-label={label} aria-orientation="vertical" aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      onDoubleClick={() => onChange(0)}
      className={cn('os-range os-vrange', className)}
      style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 28, height: '100%' } as React.CSSProperties}
    />
  )
}
