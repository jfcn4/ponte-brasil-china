/**
 * Gera os dados do globo da abertura a partir do Natural Earth 110m
 * (domínio público), no formato TopoJSON do world-atlas:
 *   - src/components/brand/land-mask.ts: máscara terra/oceano 1° × 1°;
 *   - src/components/brand/coastlines.ts: contornos dos continentes e fronteiras entre países.
 *
 *   curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json -o /tmp/land-110m.json
 *   curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json -o /tmp/countries-110m.json
 *   node scripts/globe-data.mjs /tmp/land-110m.json /tmp/countries-110m.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const [input, countriesInput] = process.argv.slice(2);
if (!input || !countriesInput) throw new Error("Informe os caminhos do land-110m.json e do countries-110m.json.");

const decodeArcs = (topology) => {
  const { scale, translate } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
};

const topo = JSON.parse(readFileSync(input, "utf8"));
const arcs = decodeArcs(topo);

const ring = (ids) => {
  const points = [];
  for (const id of ids) {
    const arc = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
};

const rings = [];
for (const geometry of topo.objects.land.geometries) {
  const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
  for (const polygon of polygons) for (const r of polygon) rings.push(ring(r));
}

// Par-ímpar sobre todos os anéis: buracos (lagos) ficam fora da terra.
const isLand = (lon, lat) => {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
};

const WIDTH = 360;
const HEIGHT = 180;
const bytes = new Uint8Array((WIDTH * HEIGHT) / 8);
for (let row = 0; row < HEIGHT; row++) {
  for (let col = 0; col < WIDTH; col++) {
    if (isLand(-179.5 + col, 89.5 - row)) {
      const k = row * WIDTH + col;
      bytes[k >> 3] |= 1 << (k & 7);
    }
  }
}

const base64 = Buffer.from(bytes).toString("base64");
const source = `// Gerado por scripts/globe-data.mjs a partir do Natural Earth 110m (domínio público).
// Máscara terra/oceano 1° × 1°: 360 × 180 bits, linha 0 = 90°N, coluna 0 = 180°O, bit menos significativo primeiro.
export const LAND_MASK_WIDTH = ${WIDTH};
export const LAND_MASK_HEIGHT = ${HEIGHT};
export const LAND_MASK =
  "${base64}";
`;
writeFileSync(new URL("../src/components/brand/land-mask.ts", import.meta.url), source);
console.log(`land-mask.ts: ${base64.length} caracteres`);

// Fronteiras: arcos compartilhados por dois países diferentes (malha interna).
const countries = JSON.parse(readFileSync(countriesInput, "utf8"));
const countryArcs = decodeArcs(countries);
const owners = new Map();
countries.objects.countries.geometries.forEach((geometry, index) => {
  const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.type === "MultiPolygon" ? geometry.arcs : [];
  for (const polygon of polygons)
    for (const r of polygon)
      for (const id of r) {
        const arc = id < 0 ? ~id : id;
        if (!owners.has(arc)) owners.set(arc, new Set());
        owners.get(arc).add(index);
      }
});
const borders = [...owners].filter(([, set]) => set.size > 1).map(([arc]) => countryArcs[arc]);

// Int16 little-endian: [quantidade de linhas, tamanho de cada linha..., lon × 10, lat × 10, ...].
const pack = (lines) => {
  const quantized = lines.map((line) => line.map(([lon, lat]) => [Math.round(lon * 10), Math.round(lat * 10)]));
  const header = [quantized.length, ...quantized.map((line) => line.length)];
  return Buffer.from(Int16Array.from([...header, ...quantized.flat(2)]).buffer).toString("base64");
};
const coastRings = rings.filter((r) => r.length >= 4);
const coastSource = `// Gerado por scripts/globe-data.mjs a partir do Natural Earth 110m (domínio público).
// Int16 little-endian: [quantidade de linhas, tamanho de cada linha..., lon × 10, lat × 10, ...].
// COASTLINES traz anéis fechados de terra; BORDERS, as fronteiras internas entre países.
export const COASTLINES =
  "${pack(coastRings)}";
export const BORDERS =
  "${pack(borders)}";
`;
writeFileSync(new URL("../src/components/brand/coastlines.ts", import.meta.url), coastSource);
console.log(`coastlines.ts: ${coastRings.length} anéis, ${borders.length} fronteiras, ${coastSource.length} caracteres`);
