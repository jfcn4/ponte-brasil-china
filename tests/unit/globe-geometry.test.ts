import { describe, expect, it } from "vitest";
import {
  BEIJING,
  RECIFE,
  VIEW,
  apply,
  isLand,
  routeArc,
  swingAt,
  toVec,
  viewMatrix,
} from "@/components/brand/globe-geometry";

const recife = toVec(RECIFE.lat, RECIFE.lon);
const beijing = toVec(BEIJING.lat, BEIJING.lon);
const route = routeArc(recife, beijing, 120);

/** Instantes de um ciclo completo de ida e volta, incluindo as duas inversões. */
const cycle = Array.from({ length: 241 }, (_, i) => (i / 240) * VIEW.period);

describe("globo da abertura", () => {
  it("usa a máscara de terra: Recife e Pequim em terra, meio do Atlântico no oceano", () => {
    expect(isLand(RECIFE.lat, RECIFE.lon - 0.5)).toBe(true);
    expect(isLand(BEIJING.lat, BEIJING.lon)).toBe(true);
    expect(isLand(0, -25)).toBe(false);
    expect(isLand(30, 20)).toBe(true); // Líbia
  });

  it("prende as pontas do arco aos pontos geográficos", () => {
    expect(route[0]).toEqual(recife);
    route.at(-1)!.forEach((value, i) => expect(value).toBeCloseTo(beijing[i]!, 12));
  });

  it("oscila em vaivém suave, sem passar da amplitude", () => {
    const swings = cycle.map(swingAt);
    expect(Math.max(...swings)).toBeCloseTo(VIEW.swing, 6);
    expect(Math.min(...swings)).toBeCloseTo(-VIEW.swing, 6);
    expect(swingAt(0)).toBe(0);
    expect(swingAt(VIEW.period)).toBeCloseTo(0, 9);
  });

  it("mantém Recife, Pequim e todo o arco visíveis durante um ciclo inteiro", () => {
    for (const time of cycle) {
      const m = viewMatrix(swingAt(time));
      // z > 0 é a face voltada para quem olha; a margem evita a borda do disco.
      expect(apply(m, recife)[2]).toBeGreaterThan(0.15);
      expect(apply(m, beijing)[2]).toBeGreaterThan(0.15);
      for (const point of route) {
        const [x, y, z] = apply(m, point);
        expect(z > 0 || Math.hypot(x, y) > 1).toBe(true);
      }
    }
  });

  it("no ângulo estático (movimento reduzido) Recife fica à esquerda e Pequim à direita", () => {
    const m = viewMatrix(0);
    const [rx] = apply(m, recife);
    const [bx] = apply(m, beijing);
    expect(rx).toBeLessThan(-0.5);
    expect(bx).toBeGreaterThan(0.5);
  });
});
