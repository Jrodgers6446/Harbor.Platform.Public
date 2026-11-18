export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size, borderRadius: size / 4, background: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M5 12H3a9 9 0 0 0 18 0h-2M8 11h8"/></svg>
    </span>
  );
}
