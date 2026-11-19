import { describe, expect, it } from "vitest";
import {
  BEIJING,
  PULSE_GAP,
  PULSE_TRIP,
  RECIFE,
  VIEW,
  apply,
  clipToFrontHemisphere,
  coastlines,
  createPulse,
  isLand,
  routeArc,
  spinAt,
  toVec,
  viewMatrix,
} from "@/components/brand/globe-geometry";

const recife = toVec(RECIFE.lat, RECIFE.lon);
const beijing = toVec(BEIJING.lat, BEIJING.lon);
const route = routeArc(recife, beijing, 120);

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

  it("mantém o arco perto do globo: sobe no máximo cerca de um quarto do raio", () => {
    for (const point of route) expect(Math.hypot(...point)).toBeLessThanOrEqual(1.27);
  });

  it("curva a rota para fora do próprio plano, para ela não virar uma linha reta de perfil", () => {
    const normal = [
      recife[1] * beijing[2] - recife[2] * beijing[1],
      recife[2] * beijing[0] - recife[0] * beijing[2],
      recife[0] * beijing[1] - recife[1] * beijing[0],
    ];
    const length = Math.hypot(...normal);
    const offset = (p: readonly number[]) => Math.abs(p[0]! * normal[0]! + p[1]! * normal[1]! + p[2]! * normal[2]!) / length;
    expect(offset(route[0]!)).toBeCloseTo(0, 9);
    expect(offset(route[60]!)).toBeGreaterThan(0.1);
  });

  it("dá uma volta completa e contínua de oeste para leste a cada período", () => {
    expect(spinAt(0)).toBeCloseTo(0, 9);
    expect(spinAt(VIEW.period / 4)).toBeCloseTo(-90, 9);
    expect(spinAt(VIEW.period / 2)).toBeCloseTo(-180, 9);
    // Ao completar a volta, a vista é a mesma do início.
    const start = viewMatrix(spinAt(0));
    const turn = viewMatrix(spinAt(VIEW.period - 1e-6));
    start.forEach((value, i) => expect(turn[i]).toBeCloseTo(value, 6));
  });

  it("no ângulo estático (movimento reduzido) mostra Recife, Pequim e todo o arco", () => {
    const m = viewMatrix(0);
    expect(apply(m, recife)[2]).toBeGreaterThan(0.15);
    expect(apply(m, beijing)[2]).toBeGreaterThan(0.15);
    for (const point of route) {
      const [x, y, z] = apply(m, point);
      expect(z > 0 || Math.hypot(x, y) > 1).toBe(true);
    }
  });

  it("faz o ponto de luz viajar de vez em quando, devagar e com intervalos variados", () => {
    const draws = [0.1, 0.9];
    const pulse = createPulse(() => draws.shift() ?? 0.5);
    const trips: Array<{ start: number; end: number }> = [];
    let current: { start: number; end: number } | null = null;
    let previous = -1;
    for (let time = 0; time <= 60_000; time += 50) {
      const state = pulse.at(time, true);
      if (state) {
        expect(state.progress).toBeGreaterThanOrEqual(previous);
        expect(state.alpha).toBeGreaterThanOrEqual(0);
        expect(state.alpha).toBeLessThanOrEqual(1);
        previous = state.progress;
        current ??= { start: time, end: time };
        current.end = time;
      } else if (current) {
        trips.push(current);
        current = null;
        previous = -1;
      }
    }
    expect(trips.length).toBeGreaterThanOrEqual(3);
    for (const trip of trips) expect(trip.end - trip.start).toBeGreaterThanOrEqual(PULSE_TRIP - 100);
    const gaps = trips.slice(1).map((trip, i) => trip.start - trips[i]!.end);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(PULSE_GAP[0]);
      expect(gap).toBeLessThanOrEqual(PULSE_GAP[1] + 100);
    }
    expect(gaps[0]).not.toBe(gaps[1]);
  });

  it("só inicia a viagem com Recife na face visível", () => {
    const pulse = createPulse(() => 0);
    expect(pulse.at(0, true)).toBeNull();
    expect(pulse.at(5_000, false)).toBeNull();
    expect(pulse.at(6_000, true)).not.toBeNull();
  });

  it("no ângulo estático (movimento reduzido) Recife fica à esquerda e Pequim à direita", () => {
    const m = viewMatrix(0);
    const [rx] = apply(m, recife);
    const [bx] = apply(m, beijing);
    expect(rx).toBeLessThan(-0.5);
    expect(bx).toBeGreaterThan(0.5);
  });

  describe("recorte dos continentes no horizonte", () => {
    const rings = coastlines();
    const inside = (loops: Array<Array<[number, number]>>, [x, y]: [number, number]) => {
      let count = 0;
      for (const loop of loops) {
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
          const [xi, yi] = loop[i]!;
          const [xj, yj] = loop[j]!;
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) count++;
        }
      }
      return count % 2 === 1;
    };
    const loopsAt = (spin: number) => {
      const m = viewMatrix(spin);
      return { m, loops: clipToFrontHemisphere(rings.map((ring) => ring.points.map((p) => apply(m, p)))) };
    };

    it("mantém tudo dentro do disco visível em qualquer ponto da volta", () => {
      for (let spin = 0; spin > -360; spin -= 15) {
        for (const loop of loopsAt(spin).loops) {
          for (const [x, y] of loop) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    });

    it("não pinta o oceano com continentes que estão atrás do globo", () => {
      // Pacífico de frente: o centro do oceano não pode cair dentro de nenhuma terra.
      for (const spin of [-150, -170, -190, -210]) {
        const { m, loops } = loopsAt(spin);
        for (const [lat, lon] of [[0, -150], [10, -170], [-20, -130], [20, 170]] as const) {
          const v = apply(m, toVec(lat, lon));
          if (v[2] <= 0.2) continue;
          expect(inside(loops, [v[0], v[1]])).toBe(false);
        }
      }
    });

    it("continua preenchendo os continentes visíveis", () => {
      for (let spin = 0; spin > -360; spin -= 30) {
        const { m, loops } = loopsAt(spin);
        for (const [lat, lon] of [[5, 20], [-15, -55], [60, 90], [40, -100], [-25, 135]] as const) {
          const v = apply(m, toVec(lat, lon));
          if (v[2] <= 0.2) continue;
          expect(inside(loops, [v[0], v[1]])).toBe(true);
        }
      }
    });
  });
});
