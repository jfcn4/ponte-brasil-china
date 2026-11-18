"use client";

import { useEffect, useRef } from "react";

type Vec = [number, number, number];

const BRAZIL = { lat: -10, lon: -52 };
const CHINA = { lat: 35, lon: 104 };
const DOT_COUNT = 1100;

function toVec(lat: number, lon: number): Vec {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

function angle(a: Vec, b: Vec) {
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

/** Pontos distribuídos uniformemente na esfera (espiral de Fibonacci). */
function fibonacciSphere(n: number): Vec[] {
  const points: Vec[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    points.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }
  return points;
}

/** Arco de grande círculo entre a e b, elevado sobre a superfície. */
function arcPoints(a: Vec, b: Vec, steps: number): Vec[] {
  const omega = angle(a, b);
  const out: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s0 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s1 = Math.sin(t * omega) / Math.sin(omega);
    const lift = 1 + 0.32 * Math.sin(Math.PI * t);
    out.push([(a[0] * s0 + b[0] * s1) * lift, (a[1] * s0 + b[1] * s1) * lift, (a[2] * s0 + b[2] * s1) * lift]);
  }
  return out;
}

function rotate(p: Vec, lon: number, lat: number): Vec {
  // Gira em torno de Y (longitude) e depois de X (inclinação).
  const cy = Math.cos(lon);
  const sy = Math.sin(lon);
  const x1 = p[0] * cy - p[2] * sy;
  const z1 = p[0] * sy + p[2] * cy;
  const cx = Math.cos(lat);
  const sx = Math.sin(lat);
  const y2 = p[1] * cx - z1 * sx;
  const z2 = p[1] * sx + z1 * cx;
  return [x1, y2, z2];
}

/**
 * Globo holográfico vermelho com a rota Brasil–China. Leve (canvas 2D, sem
 * dependências), decorativo, pausa fora da tela e fica estático quando o
 * sistema pede menos movimento. Nunca bloqueia o CTA: renderiza após a página.
 */
export function Globe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const dots = fibonacciSphere(DOT_COUNT);
    const br = toVec(BRAZIL.lat, BRAZIL.lon);
    const cn = toVec(CHINA.lat, CHINA.lon);
    const route = arcPoints(br, cn, 90);
    const glowFor = dots.map((d) => {
      const nearest = Math.min(angle(d, br), angle(d, cn));
      return nearest < 0.22 ? 1 - nearest / 0.22 : 0;
    });

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
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      const radius = Math.min(width, height) * 0.36;
      const cx = width / 2;
      const cy = height / 2;
      const animate = !reduceMotion.matches;
      // Centro da vista entre Brasil e China (≈ 26° L, 10° N), com leve oscilação.
      const lon = (26 + (animate ? 8 * Math.sin(time * 0.00011) : 0)) * (Math.PI / 180);
      const lat = (10 + (animate ? 3 * Math.sin(time * 0.00007) : 0)) * (Math.PI / 180);

      ctx.clearRect(0, 0, width, height);

      const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 1.65);
      halo.addColorStop(0, "rgba(184, 45, 53, 0.30)");
      halo.addColorStop(1, "rgba(184, 45, 53, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      const body = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
      body.addColorStop(0, "rgba(70, 24, 30, 0.85)");
      body.addColorStop(1, "rgba(25, 14, 17, 0.95)");
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255, 133, 135, 0.45)";
      ctx.stroke();

      for (let i = 0; i < dots.length; i++) {
        const p = rotate(dots[i]!, lon, lat);
        if (p[2] <= 0) continue;
        const x = cx + p[0] * radius;
        const y = cy - p[1] * radius;
        const g = glowFor[i]!;
        const alpha = 0.18 + 0.55 * p[2] + g * 0.4;
        ctx.fillStyle = g > 0 ? `rgba(255, 170, 165, ${Math.min(alpha, 1)})` : `rgba(255, 133, 135, ${alpha * 0.75})`;
        const size = (0.7 + 0.9 * p[2]) * (1 + g * 0.9);
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }

      // Rota: só os trechos que não ficam atrás do globo.
      const projected = route.map((pt) => {
        const p = rotate(pt, lon, lat);
        const x = cx + p[0] * radius;
        const y = cy - p[1] * radius;
        const outside = Math.hypot(x - cx, y - cy) > radius;
        return { x, y, show: p[2] > 0 || outside };
      });

      ctx.lineCap = "round";
      for (let i = 1; i < projected.length; i++) {
        const a = projected[i - 1]!;
        const b = projected[i]!;
        if (!a.show || !b.show) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = "rgba(255, 133, 135, 0.85)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(255, 90, 95, 0.9)";
        ctx.shadowBlur = 10;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      if (animate) {
        const t = (time * 0.00018) % 1;
        const pulse = projected[Math.floor(t * (projected.length - 1))]!;
        if (pulse.show) {
          const g = ctx.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, 9);
          g.addColorStop(0, "rgba(255, 235, 230, 1)");
          g.addColorStop(1, "rgba(255, 133, 135, 0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(pulse.x, pulse.y, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const end of [projected[0]!, projected[projected.length - 1]!]) {
        if (!end.show) continue;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd9d6";
        ctx.fill();
        const ring = animate ? 6 + ((time * 0.006) % 10) : 9;
        ctx.beginPath();
        ctx.arc(end.x, end.y, ring, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 133, 135, ${animate ? 1 - (ring - 6) / 10 : 0.6})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    };

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (time - last < 33) return; // ~30 fps é suficiente e poupa bateria
      last = time;
      draw(time);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      resize();
      if (reduceMotion.matches) {
        draw(0);
      } else {
        frame = requestAnimationFrame(loop);
      }
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion.matches) draw(0);
    });
    observer.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(canvas);
    reduceMotion.addEventListener("change", start);
    start();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      reduceMotion.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}
