import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Crisp, scalable QR code drawn as one SVG path. Scanned by the check-in desk and kiosk. */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label?: string }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d: path, n: count + 8 };
  }, [value]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label ?? value} shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 12 }}>
      <path d={d} fill="#0f2a26" />
    </svg>
  );
}
