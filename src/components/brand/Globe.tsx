"use client";

import { useEffect, useRef } from "react";
import {
  BEIJING,
  RECIFE,
  apply,
  borders,
  clipToFrontHemisphere,
  coastlines,
  graticule,
  landLattice,
  routeArc,
  createPulse,
  spinAt,
  toVec,
  viewMatrix,
  type Vec3,
} from "./globe-geometry";

/** Raio da esfera em relação ao lado menor do canvas: sobra margem para o halo sumir antes da borda. */
const RADIUS_RATIO = 0.33;
/** Até onde o halo vai, em raios. Precisa caber em 0,5 / RADIUS_RATIO. */
const HALO_EXTENT = 1.5;

/** `visible`: na frente do globo ou, atrás dele, fora do disco (a esfera não cobre). */
type Point = { x: number; y: number; z: number; front: boolean; visible: boolean; rim: number };

/**
 * Globo holográfico vermelho com a rota Recife–Pequim. Canvas 2D, sem
 * dependências: oceano quase negro com grade de 5°, continentes de vidro
 * avermelhado com malha de pontos, fronteiras finas, costa luminosa e borda
 * dupla acesa. Dá voltas completas e lentas em torno do eixo inclinado; com
 * movimento reduzido fica parado no melhor ângulo da rota. Decorativo:
 * pausa fora da tela e nunca bloqueia o CTA.
 */
export function Globe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coasts = coastlines();
    const frontiers = borders();
    const lattice = landLattice(1.25);
    // Alguns pontos mais acesos, espalhados de forma fixa, como luzes de cidades.
    const sparks = lattice.filter((_, i) => (i * 7919) % 97 === 0);
    const grid = graticule(5, 2.5);
    const recife = toVec(RECIFE.lat, RECIFE.lon);
    const beijing = toVec(BEIJING.lat, BEIJING.lon);
    const route = routeArc(recife, beijing, 480);
    const pulse = createPulse();

    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number, animate: boolean) => {
      const radius = Math.min(width, height) * RADIUS_RATIO;
      const cx = width / 2;
      const cy = height / 2;
      const unit = Math.max(0.8, radius / 300);
      const m = viewMatrix(animate ? spinAt(time) : 0);
      const project = (p: Vec3): Point => {
        const v = apply(m, p);
        return {
          x: cx + v[0] * radius,
          y: cy - v[1] * radius,
          z: v[2],
          front: v[2] > 0,
          visible: v[2] > 0 || Math.hypot(v[0], v[1]) > 1,
          rim: Math.hypot(v[0], v[1]),
        };
      };
      const disc = (r = radius) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      };
      /** Polilinhas só com os trechos da face da frente. */
      const frontPath = (lines: Vec3[][]) => {
        const path = new Path2D();
        for (const line of lines) {
          let open = false;
          for (const p of line) {
            const v = apply(m, p);
            if (v[2] <= 0) {
              open = false;
              continue;
            }
            const x = cx + v[0] * radius;
            const y = cy - v[1] * radius;
            if (open) path.lineTo(x, y);
            else path.moveTo(x, y);
            open = true;
          }
        }
        return path;
      };

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Atmosfera: brilho vermelho que nasce na borda e se dissolve no fundo.
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * HALO_EXTENT);
      halo.addColorStop(0, "rgba(200, 0, 32, 0.5)");
      halo.addColorStop(0.14, "rgba(150, 0, 24, 0.26)");
      halo.addColorStop(0.4, "rgba(110, 0, 18, 0.12)");
      halo.addColorStop(0.7, "rgba(80, 0, 12, 0.04)");
      halo.addColorStop(1, "rgba(60, 0, 10, 0)");
      ctx.fillStyle = halo;
      disc(radius * HALO_EXTENT);
      ctx.fill();

      // Oceano: quase negro, com leve tom vinho.
      const ocean = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      ocean.addColorStop(0, "rgb(27, 4, 8)");
      ocean.addColorStop(0.7, "rgb(32, 5, 10)");
      ocean.addColorStop(1, "rgb(44, 6, 12)");
      disc();
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.save();
      disc();
      ctx.clip();

      // Continentes: vidro avermelhado, recortados no horizonte (nada atrás do globo pinta a frente).
      const projectedRings = coasts.map((ring) => ring.points.map((p) => apply(m, p)));
      const landPath = new Path2D();
      for (const loop of clipToFrontHemisphere(projectedRings)) {
        loop.forEach(([x, y], i) => {
          if (i === 0) landPath.moveTo(cx + x * radius, cy - y * radius);
          else landPath.lineTo(cx + x * radius, cy - y * radius);
        });
        landPath.closePath();
      }
      const coastPath = new Path2D();
      coasts.forEach((ring, r) => {
        const projected = projectedRings[r]!;
        let open = false;
        for (let i = 0; i < projected.length; i++) {
          const a = projected[i]!;
          const b = projected[(i + 1) % projected.length]!;
          if (ring.seam[i] || a[2] <= 0 || b[2] <= 0) {
            open = false;
            continue;
          }
          if (!open) coastPath.moveTo(cx + a[0] * radius, cy - a[1] * radius);
          coastPath.lineTo(cx + b[0] * radius, cy - b[1] * radius);
          open = true;
        }
      });
      const land = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      land.addColorStop(0, "rgb(44, 11, 17)");
      land.addColorStop(0.75, "rgb(52, 13, 19)");
      land.addColorStop(1, "rgb(64, 14, 22)");
      ctx.fillStyle = land;
      ctx.fill(landPath, "evenodd");

      ctx.globalCompositeOperation = "lighter";

      // Grade de 5°, sobre oceano e continentes.
      ctx.lineWidth = 0.6 * unit;
      ctx.strokeStyle = "rgba(170, 15, 35, 0.2)";
      ctx.stroke(frontPath(grid));

      // Malha de pontos nos continentes e algumas luzes mais fortes.
      const dot = Math.max(0.9, 1.1 * unit);
      ctx.fillStyle = "rgba(200, 25, 45, 0.3)";
      for (const p of lattice) {
        const v = apply(m, p);
        if (v[2] <= 0.04) continue;
        ctx.fillRect(cx + v[0] * radius - dot / 2, cy - v[1] * radius - dot / 2, dot, dot);
      }
      ctx.fillStyle = "rgba(255, 50, 60, 0.6)";
      const spark = dot * 1.6;
      for (const p of sparks) {
        const v = apply(m, p);
        if (v[2] <= 0.08) continue;
        ctx.fillRect(cx + v[0] * radius - spark / 2, cy - v[1] * radius - spark / 2, spark, spark);
      }

      // Fronteiras entre países: linhas finas e discretas.
      ctx.lineWidth = 0.7 * unit;
      ctx.strokeStyle = "rgba(190, 22, 42, 0.42)";
      ctx.stroke(frontPath(frontiers));

      // Costa: brilho largo e linha viva.
      ctx.lineWidth = 4.5 * unit;
      ctx.strokeStyle = "rgba(210, 10, 35, 0.22)";
      ctx.stroke(coastPath);
      ctx.lineWidth = 1.4 * unit;
      ctx.strokeStyle = "rgba(232, 26, 38, 0.82)";
      ctx.stroke(coastPath);

      // Brilho interno junto à borda (Fresnel).
      const fresnel = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
      fresnel.addColorStop(0, "rgba(160, 8, 30, 0)");
      fresnel.addColorStop(0.55, "rgba(160, 8, 30, 0.1)");
      fresnel.addColorStop(0.85, "rgba(170, 10, 32, 0.3)");
      fresnel.addColorStop(1, "rgba(200, 12, 32, 0.45)");
      ctx.fillStyle = fresnel;
      disc();
      ctx.fill();

      // Reflexo de vidro no alto à esquerda.
      const glass = ctx.createRadialGradient(
        cx - radius * 0.55,
        cy - radius * 0.6,
        0,
        cx - radius * 0.55,
        cy - radius * 0.6,
        radius * 0.7,
      );
      glass.addColorStop(0, "rgba(200, 20, 45, 0.1)");
      glass.addColorStop(1, "rgba(200, 20, 45, 0)");
      ctx.fillStyle = glass;
      disc();
      ctx.fill();
      ctx.restore();

      // Borda dupla: casca interna fina e contorno externo aceso.
      ctx.globalCompositeOperation = "lighter";
      disc(radius * 0.975);
      ctx.lineWidth = 1 * unit;
      ctx.strokeStyle = "rgba(220, 30, 45, 0.3)";
      ctx.stroke();
      disc();
      ctx.lineWidth = 14 * unit;
      ctx.strokeStyle = "rgba(200, 8, 28, 0.18)";
      ctx.stroke();
      ctx.lineWidth = 4 * unit;
      ctx.strokeStyle = "rgba(215, 15, 35, 0.32)";
      ctx.stroke();
      ctx.lineWidth = 1.6 * unit;
      ctx.strokeStyle = "rgba(240, 45, 52, 0.75)";
      ctx.stroke();

      // Conexão: linha fina vermelha que contorna o globo. Só some onde a esfera a cobre:
      // ao passar para trás, continua visível fora do disco e desaparece na borda.
      const path = route.map(project);
      // Uma cor só em todo o trajeto, na frente ou atrás do globo.
      const strokeRoute = (lineWidth: number, color: string) => {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color;
        ctx.beginPath();
        let open = false;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!;
          const b = path[i]!;
          if (!a.visible || !b.visible) {
            open = false;
            continue;
          }
          if (!open) ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          open = true;
        }
        ctx.stroke();
      };
      strokeRoute(7 * unit, "rgba(210, 10, 35, 0.12)");
      strokeRoute(3 * unit, "rgba(220, 20, 45, 0.28)");
      strokeRoute(1.3 * unit, "rgba(245, 40, 52, 0.95)");
      /** Pontos na superfície somem suavemente ao cruzar o horizonte. */
      const fade = (p: Point) => Math.min(1, Math.max(0, p.z / 0.06));

      const glowDot = (p: Point, core: number, glow: number, strength: number, coreAlpha: number) => {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
        g.addColorStop(0, `rgba(255, 40, 60, ${strength})`);
        g.addColorStop(0.3, `rgba(230, 15, 40, ${strength * 0.35})`);
        g.addColorStop(1, "rgba(200, 10, 35, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, core, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 240, 238, ${coreAlpha})`;
        ctx.fill();
      };

      // Pontas fixas em Recife e Pequim: ficam ocultas enquanto estão atrás do globo.
      for (const p of [path[0]!, path[path.length - 1]!]) {
        const alpha = fade(p);
        if (alpha > 0) glowDot(p, 2.2 * unit, 12 * unit, 0.7 * alpha, alpha);
      }

      // Ponto de luz que viaja de Recife a Pequim de vez em quando (parado no meio do arco sem movimento).
      const trip = animate ? pulse.at(time, path[0]!.front) : { progress: 0.5, alpha: 1 };
      if (trip) {
        const head = path[Math.round(trip.progress * (path.length - 1))]!;
        // Atrás do globo, o brilho se apaga aos poucos ao se aproximar da borda, em vez de sumir de uma vez.
        const edge = head.front ? 1 : Math.min(1, Math.max(0, (head.rim - 1) / 0.2));
        const seen = trip.alpha * edge * edge * (3 - 2 * edge);
        if (seen > 0) glowDot(head, 3.2 * unit, 26 * unit, 0.85 * seen, seen);
      }

      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (time - last < 33) return; // ~30 fps é suficiente e poupa bateria
      last = time;
      draw(time, true);
    };

    const render = () => {
      cancelAnimationFrame(frame);
      resize();
      if (reduceMotion.matches) draw(0, false);
      else frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(() => {
      resize();
      draw(reduceMotion.matches ? 0 : last, !reduceMotion.matches);
    });
    observer.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(canvas);
    reduceMotion.addEventListener("change", render);
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      reduceMotion.removeEventListener("change", render);
    };
  }, []);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}
