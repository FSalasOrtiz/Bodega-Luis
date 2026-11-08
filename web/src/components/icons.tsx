/* Íconos SVG del prototipo (trazos constantes, sin datos del usuario). */
const I: Record<string, string> = {
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  dash: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  pos: '<path d="M6 6h15l-2 8H8L6 3H3"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  rec: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  inv: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  sales: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  moves: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5 6.5-5s5.7 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.3 0 4 1.2 4.5 4"/>',
  prod: '<path d="M12 21c-4-3-8-6.5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 4.5-4 8-8 11z"/>',
  rep: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  exp: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
  bal: '<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/>',
  cred: '<path d="M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2z"/><path d="M6 17a2 2 0 0 1 2-2h11M10 7h5M10 10.5h5"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
};

export function Icon({ n, s = 19 }: { n: string; s?: number }) {
  if (n === 'coin') return <Emo e="🪙" s={s} />;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: I[n] || '' }} />
  );
}
/** Emoji de cada módulo (menú lateral y barra inferior). */
export function Emo({ e, s = 19 }: { e: string; s?: number }) {
  return <span className="emoji-ic" aria-hidden="true" style={{ fontSize: Math.round(s * 1.05) }}>{e}</span>;
}
/** Logo raster oficial. `mark` usa solo el escudo; `w` es el ancho (logo completo) o el alto (escudo). */
export function Logo({ w = 180, mark = false, alt = 'LMA Agro Comercial' }: { w?: number; mark?: boolean; alt?: string }) {
  return mark
    ? <img className="logo logo-mark" src="/brand/lma-escudo.png" width={Math.round((w * 148) / 192)} height={w} alt={alt} decoding="async" />
    : <img className="logo" src="/brand/lma-logo.png" width={w} height={Math.round((w * 236) / 640)} alt={alt} decoding="async" />;
}
