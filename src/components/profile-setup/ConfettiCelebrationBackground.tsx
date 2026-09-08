'use client';
import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  shape: 'circle' | 'triangle' | 'rect' | 'dot';
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  tiltAngle: number;
  tiltVelocity: number;
  wobblePhase: number;
  wobbleSpeed: number;
  opacity: number;
}

const PALETTE = [
  '#F59E0B', // Amber gold
  '#FBBF24', // Bright yellow
  '#8B5CF6', // Purple / Violet
  '#7C3AED', // Deep Violet
  '#EF4444', // Coral / Red
  '#F43F5E', // Rose / Pinkish Red
  '#0EA5E9', // Sky Blue
  '#38BDF8', // Cyan Blue
  '#10B981', // Emerald Mint
];

export default function ConfettiCelebrationBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const setupCanvas = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      ctx.scale(dpr, dpr);
    };

    setupCanvas();

    const handleResize = () => {
      setupCanvas();
    };

    window.addEventListener('resize', handleResize);

    // Create 120 celebratory confetti pieces matching the exact LottieFiles screenshot
    const particleCount = 115;
    const particles: Particle[] = [];

    const shapes: ('circle' | 'triangle' | 'rect' | 'dot')[] = [
      'circle',
      'circle',
      'triangle',
      'triangle',
      'rect',
      'rect',
      'dot',
    ];

    for (let i = 0; i < particleCount; i++) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const baseSize =
        shape === 'dot'
          ? Math.random() * 3 + 2.5
          : shape === 'circle'
          ? Math.random() * 6 + 5.5
          : shape === 'triangle'
          ? Math.random() * 9 + 8
          : Math.random() * 8 + 6; // rect ribbon

      particles.push({
        x: Math.random() * width,
        y: Math.random() * height, // Pre-distribute across full screen like video
        size: baseSize,
        color,
        shape,
        vx: (Math.random() - 0.5) * 0.7,
        vy: Math.random() * 1.5 + 0.8,
        angle: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 0.035,
        tiltAngle: Math.random() * Math.PI * 2,
        tiltVelocity: Math.random() * 0.045 + 0.02,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.025 + 0.015,
        opacity: Math.random() * 0.3 + 0.7,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Update physics
        p.wobblePhase += p.wobbleSpeed;
        p.angle += p.angularVelocity;
        p.tiltAngle += p.tiltVelocity;

        // Drift & fall
        p.x += p.vx + Math.sin(p.wobblePhase) * 0.65;
        p.y += p.vy;

        // Wrap around bottom
        if (p.y > height + 25) {
          p.y = -20;
          p.x = Math.random() * width;
          p.vy = Math.random() * 1.5 + 0.8;
        }
        if (p.x < -25) p.x = width + 20;
        if (p.x > width + 25) p.x = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        // 3D tilt transformation (flipping effect)
        const scaleY = Math.cos(p.tiltAngle);
        ctx.scale(1, scaleY);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'triangle') {
          ctx.beginPath();
          const h = p.size * 1.35;
          const w = p.size * 1.1;
          ctx.moveTo(0, -h / 2);
          ctx.lineTo(w / 2, h / 2);
          ctx.lineTo(-w / 2, h / 2);
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === 'rect') {
          // Ribbon confetti
          const rw = p.size * 0.8;
          const rh = p.size * 1.8;
          ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
      style={{ willChange: 'transform' }}
    />
  );
}
