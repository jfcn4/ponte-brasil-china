import { BORDERS, COASTLINES } from "./coastlines";
import { LAND_MASK, LAND_MASK_HEIGHT, LAND_MASK_WIDTH } from "./land-mask";

/** Vetor unitário: x aponta para 90°L, y para o polo norte, z para 0°/0°. */
export type Vec3 = [number, number, number];
/** Matriz 3 × 3 em ordem de linhas. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;

/** Recife representa Pernambuco; Pequim, o destino na China. */
export const RECIFE = { lat: -8.05, lon: -34.88 };
export const BEIJING = { lat: 39.9, lon: 116.4 };

/**
 * Enquadramento da rota. O centro da vista fica ao sul do plano do grande
 * círculo Recife–Pequim, para o arco aparecer como uma ponte sobre o globo.
 * O giro oscila em torno do eixo polar do próprio globo (que aparece
 * inclinado pela vista e pelo `roll`) e mantém as duas pontas na face visível.
 */
export const VIEW = {
  lat: 24,
  lon: 24,
  roll: -8,
  /** Amplitude do vaivém em longitude, em graus. */
  swing: 6,
  /** Duração de um ciclo completo de ida e volta, em ms. */
  period: 24_000,
} as const;

export function toVec(lat: number, lon: number): Vec3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Deslocamento de longitude no instante `time`: senoide, com inversões suaves. */
export function swingAt(time: number) {
  return VIEW.swing * Math.sin((2 * Math.PI * time) / VIEW.period);
}

/**
 * Matriz mundo → vista para um deslocamento `swing` (graus) em torno do eixo
 * polar. Na vista, x aponta para a direita, y para cima e z para o observador.
 */
export function viewMatrix(swing: number): Mat3 {
  const lon = (VIEW.lon + swing) * DEG;
  const lat = VIEW.lat * DEG;
  const roll = VIEW.roll * DEG;
  const cl = Math.cos(lon);
  const sl = Math.sin(lon);
  const cp = Math.cos(lat);
  const sp = Math.sin(lat);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // 1) gira em torno do eixo polar: a longitude da vista vem para a frente.
  // 2) inclina em torno de x: a latitude da vista vem para o centro.
  // 3) roll em torno de z: o eixo do globo aparece inclinado na tela.
  const a: Mat3 = [cl, 0, -sl, -sp * sl, cp, -sp * cl, cp * sl, sp, cp * cl];
  return [
    cr * a[0] - sr * a[3],
    cr * a[1] - sr * a[4],
    cr * a[2] - sr * a[5],
    sr * a[0] + cr * a[3],
    sr * a[1] + cr * a[4],
    sr * a[2] + cr * a[5],
    a[6],
    a[7],
    a[8],
  ];
}

export function apply(m: Mat3, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
  ];
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let decoded: Uint8Array | null = null;

export function isLand(lat: number, lon: number) {
  if (!decoded) decoded = decodeBase64(LAND_MASK);
  const row = Math.min(LAND_MASK_HEIGHT - 1, Math.max(0, Math.floor(90 - lat)));
  const col = (((Math.floor(lon + 180) % LAND_MASK_WIDTH) + LAND_MASK_WIDTH) % LAND_MASK_WIDTH);
  const k = row * LAND_MASK_WIDTH + col;
  return (decoded[k >> 3]! & (1 << (k & 7))) !== 0;
}

/** Pontos uniformes na esfera (espiral de Fibonacci), separados em terra e oceano. */
export function globeDots(count: number) {
  const land: Vec3[] = [];
  const ocean: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const p: Vec3 = [Math.cos(theta) * r, y, Math.sin(theta) * r];
    const lat = Math.asin(y) / DEG;
    const lon = Math.atan2(p[0], p[2]) / DEG;
    (isLand(lat, lon) ? land : ocean).push(p);
  }
  return { land, ocean };
}

/** Arco de grande círculo entre a e b, elevado sobre a superfície. As pontas ficam na superfície. */
export function routeArc(a: Vec3, b: Vec3, steps: number, lift = 0.5): Vec3[] {
  const omega = Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s0 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s1 = Math.sin(t * omega) / Math.sin(omega);
    const h = 1 + lift * Math.sin(Math.PI * t);
    out.push([(a[0] * s0 + b[0] * s1) * h, (a[1] * s0 + b[1] * s1) * h, (a[2] * s0 + b[2] * s1) * h]);
  }
  return out;
}

/** Linhas de latitude e longitude (a cada `stepDeg`) para dar leitura de volume e de eixo. */
export function graticule(stepDeg = 30, sampleDeg = 3): Vec3[][] {
  const lines: Vec3[][] = [];
  for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
    if (Math.abs(lat) > 80) continue;
    const line: Vec3[] = [];
    for (let lon = -180; lon <= 180; lon += sampleDeg) line.push(toVec(lat, lon));
    lines.push(line);
  }
  for (let lon = -180; lon < 180; lon += stepDeg) {
    // Perto dos polos só um meridiano a cada 15°, para a grade não virar um borrão.
    const limit = lon % 15 === 0 ? 80 : 62;
    const line: Vec3[] = [];
    for (let lat = -limit; lat <= limit; lat += sampleDeg) line.push(toVec(lat, lon));
    lines.push(line);
  }
  return lines;
}

export type Coastline = {
  points: Vec3[];
  /** `seam[i]` marca o trecho i → i + 1 criado pelo recorte do mapa (antimeridiano ou polo sul): não é costa. */
  seam: boolean[];
};

/** Linhas em graus [lon, lat], no formato gerado por scripts/globe-data.mjs. */
function decodeLines(value: string): Array<Array<[number, number]>> {
  const bytes = decodeBase64(value);
  const view = new DataView(bytes.buffer);
  const read = (i: number) => view.getInt16(i * 2, true);
  const count = read(0);
  const lines: Array<Array<[number, number]>> = [];
  let offset = 1 + count;
  for (let r = 0; r < count; r++) {
    const length = read(1 + r);
    const line: Array<[number, number]> = [];
    for (let i = 0; i < length; i++) line.push([read(offset + i * 2) / 10, read(offset + i * 2 + 1) / 10]);
    offset += length * 2;
    lines.push(line);
  }
  return lines;
}

/** Contornos dos continentes (anéis fechados), em vetores unitários. */
export function coastlines(): Coastline[] {
  return decodeLines(COASTLINES).map((lonLat) => ({
    points: lonLat.map(([lon, lat]) => toVec(lat, lon)),
    seam: lonLat.map(([lon, lat], i) => {
      const [nextLon, nextLat] = lonLat[(i + 1) % lonLat.length]!;
      return (Math.abs(lon) >= 179.9 && Math.abs(nextLon) >= 179.9) || (lat <= -89.9 && nextLat <= -89.9);
    }),
  }));
}

/** Fronteiras internas entre países (linhas abertas), em vetores unitários. */
export function borders(): Vec3[][] {
  return decodeLines(BORDERS).map((line) => line.map(([lon, lat]) => toVec(lat, lon)));
}

/** Malha regular de pontos sobre os continentes (a cada `step` graus), como na textura holográfica. */
export function landLattice(step: number): Vec3[] {
  const points: Vec3[] = [];
  for (let lat = -84; lat <= 84; lat += step) {
    // Espaçamento em longitude corrigido pela latitude: pontos equidistantes também perto dos polos.
    const lonStep = 360 / Math.max(1, Math.round((360 / step) * Math.cos((lat * Math.PI) / 180)));
    for (let lon = -180; lon < 180; lon += lonStep) {
      if (isLand(lat, lon)) points.push(toVec(lat, lon));
    }
  }
  return points;
}
