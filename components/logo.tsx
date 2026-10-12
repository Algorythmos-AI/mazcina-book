/** The public site's wordmark, with "Kitchen" where the site says "Resto - Bar". */
export function Logo({ size = 'md', label = 'Kitchen' }: { size?: 'md' | 'lg'; label?: string }) {
  return (
    <span className="flex flex-col">
      <span className={`font-serif font-bold italic leading-none tracking-tight text-mazcina-emerald ${size === 'lg' ? 'text-5xl' : 'text-3xl sm:text-4xl'}`}>
        Mazcina
      </span>
      <span className="-mt-0.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-mazcina-wood">{label}</span>
    </span>
  );
}
