declare module 'canvas-confetti' {
  export interface ConfettiOptions {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    ticks?: number;
    origin?: { x: number; y: number };
    colors?: string[];
    shapes?: ('circle' | 'square')[];
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
    useWorker?: boolean;
  }

  export default function confetti(options?: ConfettiOptions): Promise<void>;
  export function createConfetti(canvas?: HTMLCanvasElement): (options?: ConfettiOptions) => Promise<void>;
}
