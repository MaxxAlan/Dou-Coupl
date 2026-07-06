import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, Heart, RotateCcw, Play, Volume2, VolumeX } from 'lucide-react';

const PIXEL = 4;
const W = 120;
const H = 80;
const GROUND = 68;
const GRAVITY = 0.6;
const JUMP = -6.5;

const CHAR = {
  w: 7,
  h: 11,
  pixels: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [0,1,0,0,0,0,1,0],
    [0,1,1,1,1,1,1,0],
    [0,1,0,0,0,0,1,0],
    [0,1,1,1,1,1,1,0],
    [0,1,0,1,1,0,1,0],
    [0,1,0,1,1,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  color: '#c5a059',
};

function drawChar(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const offset = frame % 2 === 0 ? 0 : 1;
  for (let row = 0; row < CHAR.pixels.length; row++) {
    for (let col = 0; col < CHAR.pixels[row].length; col++) {
      if (CHAR.pixels[row][col]) {
        ctx.fillStyle = CHAR.color;
        ctx.fillRect((x + col) * PIXEL, (y + row) * PIXEL, PIXEL, PIXEL);
      }
    }
  }
  ctx.fillStyle = '#f97316';
  ctx.fillRect((x + 3) * PIXEL, (y + 3) * PIXEL, PIXEL, PIXEL);
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1) {
  const s = size * PIXEL;
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x * PIXEL, (y + 1) * PIXEL, s, s);
  ctx.fillRect((x + 1) * PIXEL, y * PIXEL, s, s);
  ctx.fillRect((x + 2) * PIXEL, y * PIXEL, s, s);
  ctx.fillRect((x + 3) * PIXEL, (y + 1) * PIXEL, s, s);
  ctx.fillRect((x + 1) * PIXEL, (y + 2) * PIXEL, s, s);
  ctx.fillRect((x + 2) * PIXEL, (y + 2) * PIXEL, s, s);
}

interface Obstacle {
  x: number;
  w: number;
  h: number;
  passed: boolean;
}

interface HeartObj {
  x: number;
  y: number;
  collected: boolean;
}

export default function OfflineScreen({ onRetry, musicPlaying, onToggleMusic }: { onRetry?: () => void; musicPlaying?: boolean; onToggleMusic?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const animRef = useRef(0);
  const gameState = useRef<'waiting' | 'playing' | 'over'>('waiting');
  const scoreRef = useRef(0);
  const highScoreRef = useRef(0);
  const charY = useRef(GROUND - CHAR.h);
  const velY = useRef(0);
  const obstacles = useRef<Obstacle[]>([]);
  const hearts = useRef<HeartObj[]>([]);
  const speed = useRef(3);
  const timer = useRef(0);
  const groundOffset = useRef(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [muted, setMuted] = useState(false);

  const drawPixelBg = (ctx: CanvasRenderingContext2D) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const val = (x * 7 + y * 13) % 80;
        if (val < 2) {
          ctx.fillStyle = 'rgba(197, 160, 89, 0.03)';
          ctx.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        }
      }
    }
  };

  const drawStars = (ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < 12; i++) {
      const sx = ((i * 37 + 13) % W);
      const sy = ((i * 23 + 7) % (GROUND - 10));
      const bright = (i * 3 + frameRef.current * 2 + 100) % 255;
      ctx.fillStyle = `rgba(255,255,255,${bright > 200 ? 0.8 : 0.3})`;
      ctx.fillRect(sx * PIXEL, sy * PIXEL, PIXEL, PIXEL);
    }
  };

  const drawGround = (ctx: CanvasRenderingContext2D) => {
    groundOffset.current = (groundOffset.current + speed.current * 0.5) % 8;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, GROUND * PIXEL, W * PIXEL, PIXEL);
    for (let x = -Math.floor(groundOffset.current / PIXEL); x < W; x += 4) {
      ctx.fillStyle = '#c5a059';
      ctx.fillRect(x * PIXEL, GROUND * PIXEL, PIXEL, PIXEL);
    }
    for (let x = 0; x < W; x += 2) {
      const gv = (x * 5 + 3) % 7;
      if (gv < 2) {
        ctx.fillStyle = 'rgba(197, 160, 89, 0.15)';
        ctx.fillRect(x * PIXEL, (GROUND + 1) * PIXEL, PIXEL, PIXEL);
      }
    }
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, obs: Obstacle) => {
    ctx.fillStyle = '#4a7c59';
    ctx.fillRect(obs.x * PIXEL, (GROUND - obs.h) * PIXEL, obs.w * PIXEL, obs.h * PIXEL);
    ctx.fillStyle = '#5c9f6e';
    ctx.fillRect(obs.x * PIXEL, (GROUND - obs.h) * PIXEL, obs.w * PIXEL, PIXEL * 2);
  };

  const drawHeartPowerup = (ctx: CanvasRenderingContext2D, h: HeartObj) => {
    drawHeart(ctx, h.x, h.y);
  };

  const jump = () => {
    if (gameState.current === 'waiting') {
      gameState.current = 'playing';
      setShowOverlay(false);
      return;
    }
    if (gameState.current === 'over') {
      resetGame();
      return;
    }
    if (charY.current >= GROUND - CHAR.h - 1) {
      velY.current = JUMP;
    }
  };

  const resetGame = () => {
    scoreRef.current = 0;
    charY.current = GROUND - CHAR.h;
    velY.current = 0;
    obstacles.current = [];
    hearts.current = [];
    speed.current = 3;
    timer.current = 0;
    gameState.current = 'playing';
    setShowOverlay(false);
  };

  const update = () => {
    const state = gameState.current;
    if (state !== 'playing') return;

    const ch = CHAR.h;
    velY.current += GRAVITY;
    charY.current += velY.current;
    if (charY.current > GROUND - ch) {
      charY.current = GROUND - ch;
      velY.current = 0;
    }

    timer.current++;
    if (timer.current % 60 === 0) {
      speed.current = Math.min(speed.current + 0.1, 7);
      scoreRef.current++;
    }

    if (timer.current % Math.max(40, 80 - Math.floor(speed.current * 5)) === 0) {
      const oh = Math.floor(Math.random() * 8) + 8;
      obstacles.current.push({
        x: W - 2,
        w: Math.floor(Math.random() * 3) + 3,
        h: Math.min(oh, 20),
        passed: false,
      });
    }

    if (timer.current % 120 === 0) {
      hearts.current.push({
        x: W - 2,
        y: GROUND - 8 - Math.floor(Math.random() * 10),
        collected: false,
      });
    }

    obstacles.current = obstacles.current.filter(o => o.x + o.w > 0);
    hearts.current = hearts.current.filter(h => h.x > -4 && !h.collected);

    for (const obs of obstacles.current) {
      obs.x -= speed.current;
    }
    for (const h of hearts.current) {
      h.x -= speed.current;
    }

    const cx = 15;
    const cy = charY.current;
    const cw = CHAR.w;
    const cHeight = CHAR.h;

    for (const obs of obstacles.current) {
      if (
        cx < obs.x + obs.w &&
        cx + cw > obs.x &&
        cy < GROUND - obs.h + obs.h &&
        cy + cHeight > GROUND - obs.h
      ) {
        gameState.current = 'over';
        if (scoreRef.current > highScoreRef.current) {
          highScoreRef.current = scoreRef.current;
        }
        setShowOverlay(true);
        return;
      }
    }

    for (const h of hearts.current) {
      const hx = h.x;
      const hy = h.y;
      if (
        cx < hx + 4 &&
        cx + cw > hx &&
        cy < hy + 4 &&
        cy + cHeight > hy
      ) {
        h.collected = true;
        scoreRef.current += 3;
      }
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W * PIXEL, H * PIXEL);

    drawPixelBg(ctx);
    drawStars(ctx);
    drawGround(ctx);

    for (const obs of obstacles.current) {
      drawObstacle(ctx, obs);
    }
    for (const h of hearts.current) {
      if (!h.collected) drawHeartPowerup(ctx, h);
    }

    frameRef.current++;
    drawChar(ctx, 15, charY.current, frameRef.current);

    if (gameState.current === 'playing') {
      ctx.fillStyle = '#c5a059';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`SCORE: ${scoreRef.current}`, (W - 2) * PIXEL, 10 * PIXEL);
    }
  };

  const loop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    update();
    draw(ctx);
    animRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKey);
    animRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKey);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9998] bg-[#08080e] flex flex-col items-center justify-center select-none">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W * PIXEL}
          height={H * PIXEL}
          onClick={jump}
          className="cursor-pointer rounded-2xl border border-[#c5a059]/10 max-w-[92vw]"
          style={{ imageRendering: 'pixelated', width: 'min(480px, 92vw)' }}
        />

        <div className="absolute -top-1 -right-1 flex gap-1">
          {onToggleMusic && (
            <button
              onClick={onToggleMusic}
              className={`p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer ${musicPlaying ? 'text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
              title={musicPlaying ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
            >
              {musicPlaying ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-2 text-[#c5a059]/60">
              <WifiOff className="w-4 h-4" />
              <span className="text-[10px] font-mono tracking-widest uppercase">Đang mất kết nối</span>
            </div>

            <div className="flex gap-3">
              {gameState.current === 'over' ? (
                <>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={resetGame}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 border border-[#c5a059]/30 rounded-xl text-[#c5a059] text-[10px] font-semibold transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Chơi lại</span>
                  </motion.button>
                </>
              ) : gameState.current === 'waiting' ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={jump}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 border border-[#c5a059]/30 rounded-xl text-[#c5a059] text-[10px] font-semibold transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Bắt đầu</span>
                </motion.button>
              ) : null}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/60 hover:text-white/80 text-[10px] font-semibold transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Thử lại</span>
                </button>
              )}
            </div>

            {gameState.current === 'over' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-3 text-xs"
              >
                <div className="text-slate-500 font-mono">
                  Điểm: <span className="text-[#c5a059]">{scoreRef.current}</span>
                </div>
                {highScoreRef.current > 0 && (
                  <div className="text-slate-500 font-mono">
                    Cao nhất: <span className="text-emerald-400">{highScoreRef.current}</span>
                  </div>
                )}
              </motion.div>
            )}

            <div className="flex items-center gap-3 text-[10px] text-slate-600 font-mono mt-2">
              <Heart className="w-3 h-3 text-red-400/50" />
              <span>Nhấn Space / Click để nhảy</span>
              <Heart className="w-3 h-3 text-red-400/50" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
