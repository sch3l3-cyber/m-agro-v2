/**
 * HTRS96/TM (EPSG:3765) ↔ WGS84 bez proj4 — za poslužitelj (Worker 3 MiB limit).
 * Transverse Mercator, Krügerovi redovi do n⁴ (Karney 2011), elipsoid GRS80.
 * Točnost ≪ 1 mm unutar Hrvatske (test uspoređuje s proj4). HTRS96 ≡ ETRS89 ≈ WGS84 (towgs84 = 0).
 */
const a = 6378137;
const f = 1 / 298.257222101; // GRS80
const k0 = 0.9999;
const lon0 = (16.5 * Math.PI) / 180;
const FE = 500000;

const n = f / (2 - f);
const n2 = n * n;
const n3 = n2 * n;
const n4 = n3 * n;
const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
const e = Math.sqrt(f * (2 - f));
const alfa = [n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4, (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4, (61 / 240) * n3 - (103 / 140) * n4, (49561 / 161280) * n4];
const beta = [n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4, (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4, (17 / 480) * n3 - (37 / 840) * n4, (4397 / 161280) * n4];

/** WGS84 (stupnjevi) → HTRS96/TM (metri) */
export function wgs84UHtrs96(lonDeg: number, latDeg: number): [number, number] {
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180 - lon0;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi1 = Math.atan2(t, Math.cos(lam));
  const eta1 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xi1;
  let eta = eta1;
  alfa.forEach((al, i) => {
    const j = 2 * (i + 1);
    xi += al * Math.sin(j * xi1) * Math.cosh(j * eta1);
    eta += al * Math.cos(j * xi1) * Math.sinh(j * eta1);
  });
  return [FE + k0 * A * eta, k0 * A * xi];
}

/** HTRS96/TM (metri) → WGS84 (stupnjevi) */
export function htrs96UWgs84(x: number, y: number): [number, number] {
  const xi = y / (k0 * A);
  const eta = (x - FE) / (k0 * A);
  let xi1 = xi;
  let eta1 = eta;
  beta.forEach((be, i) => {
    const j = 2 * (i + 1);
    xi1 -= be * Math.sin(j * xi) * Math.cosh(j * eta);
    eta1 -= be * Math.cos(j * xi) * Math.sinh(j * eta);
  });
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  const lam = Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  // konformna → geodetska širina (Newtonova iteracija, 4 koraka dovoljno)
  const tChi = Math.tan(chi);
  let tPhi = tChi;
  for (let i = 0; i < 5; i++) {
    const s = Math.sinh(e * Math.atanh((e * tPhi) / Math.sqrt(1 + tPhi * tPhi)));
    const tPrime = tPhi * Math.sqrt(1 + s * s) - s * Math.sqrt(1 + tPhi * tPhi);
    const dt = ((tChi - tPrime) / Math.sqrt(1 + tPrime * tPrime)) * ((1 + (1 - e * e) * tPhi * tPhi) / ((1 - e * e) * Math.sqrt(1 + tPhi * tPhi)));
    tPhi += dt;
  }
  return [((lam + lon0) * 180) / Math.PI, (Math.atan(tPhi) * 180) / Math.PI];
}
