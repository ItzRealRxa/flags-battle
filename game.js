// Country Marble Race Obstacle Course Engine (Vertical 9:16 Canvas)
const canvas = document.getElementById('battleCanvas');
const ctx = canvas.getContext('2d');

const V_WIDTH = 1080;
const V_HEIGHT = 1920;
canvas.width = V_WIDTH;
canvas.height = V_HEIGHT;

const TRACK_HEIGHT = 9450; // Deep multi-stage vertical track
let GRAVITY = 0.28;
const RESTITUTION = 0.65;
const FRICTION = 0.992;
let selectedContinent = "All";
let currentDifficulty = "Normal";

let marbles = [];
let finishedMarbles = [];
let particles = [];
let isRunning = false;
let isPaused = false;
let gateOpen = false;
let isRecording = false;
let mediaRecorder = null;
let winnerMarble = null;
let winnerBannerAnim = 0;

// Dynamic Camera
const camera = {
  y: 0,
  targetY: 0,
  leadMarble: null
};

// Game Mode Configuration
let currentGameMode = 'race'; // 'race' | 'circle_survivor'

// Circle Survivor Arena Constants (Vertical 9:16 Canvas)
const ARENA_CX = 540;
const ARENA_CY = 990;
const ARENA_RADIUS = 450;
let arenaAngle = 0;
let arenaSpeed = 0.015;
const ARENA_NUM_GAPS = 4;
const ARENA_GAP_ARC = 0.58; // radians (~33° escape gap per quadrant)
let centerBladeAngle = 0;
let survivorObstacles = {
  orbitBumpers: []
};

// Concentric Rotating Rings Maze Specs (Multi-Layer Ring Maze)
const CONCENTRIC_RINGS = [
  { radius: 460, numGaps: 4, gapArc: 0.52, speed: -0.012, color: '#38bdf8', glow: '#0284c7', angle: 0, label: 'OUTER RING' },
  { radius: 350, numGaps: 3, gapArc: 0.46, speed: 0.016, color: '#a855f7', glow: '#7e22ce', angle: 0, label: 'TIER 3' },
  { radius: 240, numGaps: 2, gapArc: 0.40, speed: -0.022, color: '#ec4899', glow: '#be185d', angle: 0, label: 'TIER 2' },
  { radius: 130, numGaps: 1, gapArc: 0.36, speed: 0.026, color: '#f59e0b', glow: '#b45309', angle: 0, label: 'CHOKE DOOR' }
];
const CORE_RADIUS = 50;

// Track Obstacles
let walls = [];
let pegs = [];
let bumpers = [];
let spinners = [];
let movingHammers = [];
let springBumpers = [];
let finishLineY = TRACK_HEIGHT - 350;

// Flag image cache
const flagImages = {};

function preloadFlags(onProgress, onComplete) {
  let loaded = 0;
  const total = COUNTRIES_DATA.length;

  COUNTRIES_DATA.forEach(country => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = getFlagUrl(country.code);
    img.onload = () => {
      loaded++;
      flagImages[country.code] = img;
      onProgress(loaded, total);
      if (loaded === total) onComplete();
    };
    img.onerror = () => {
      loaded++;
      flagImages[country.code] = null;
      onProgress(loaded, total);
      if (loaded === total) onComplete();
    };
  });
}

// Marble Class
class Marble {
  constructor(data, x, y) {
    this.code = data.code;
    this.name = data.name;
    this.continent = data.continent;
    this.x = x;
    this.y = y;
    this.radius = 18; // Marble radius
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = 0;
    this.mass = 1;
    this.finished = false;
    this.finishRank = null;
    this.rank = 0;
    this.trail = [];
    this.bouncePulse = 0;
  }

  update() {
    if (this.finished) {
      if (currentGameMode === 'circle_survivor') {
        // Eliminated marbles disappear completely from the arena
        return;
      }
      if (currentGameMode === 'concentric_rings') {
        // Marbles that reach the core settle gently in the winner circle
        this.vx *= 0.88;
        this.vy *= 0.88;
        this.x += this.vx;
        this.y += this.vy;
        return;
      }
      // Downhill Race: Gentle slide in podium area
      this.vx *= 0.92;
      this.vy *= 0.92;
      this.x += this.vx;
      this.y += this.vy;
      return;
    }

    if (this.bouncePulse > 0) this.bouncePulse -= 0.05;

    // Mode-specific Movement & Boundaries
    if (currentGameMode === 'concentric_rings') {
      // Inward funnel pull towards Center Core
      const dx = ARENA_CX - this.x;
      const dy = ARENA_CY - this.y;
      const d = Math.hypot(dx, dy);

      if (d > 15) {
        this.vx += (dx / d) * 0.075;
        this.vy += (dy / d) * 0.075;
      }
      this.vx += (Math.random() - 0.5) * 0.10;
      this.vy += (Math.random() - 0.5) * 0.10;

      this.vx *= 0.993;
      this.vy *= 0.993;

      this.x += this.vx;
      this.y += this.vy;

      // Speed trail for lead marble
      if (this === camera.leadMarble && Math.hypot(this.vx, this.vy) > 3) {
        this.trail.unshift({ x: this.x, y: this.y, alpha: 1 });
        if (this.trail.length > 10) this.trail.pop();
      } else if (this.trail.length > 0) {
        this.trail.pop();
      }

      // Check Core Victory Condition (First marble into Core wins!)
      if (d <= CORE_RADIUS + 12 && !this.finished) {
        this.finished = true;
        finishedMarbles.push(this);
        this.finishRank = finishedMarbles.length;
        sfx.playFinishCross();
        createCelebration(this.x, this.y);

        if (this.finishRank === 1) {
          winnerMarble = this;
          sfx.playVictory();
          showWinnerBanner(this);
          if (typeof updateVideoTitles === 'function') updateVideoTitles(this);

          if (isRecording) {
            setTimeout(() => {
              if (isRecording && typeof stopRecording === 'function') {
                stopRecording();
              }
            }, 3500);
          }
        }
        addFeedItem(this.finishRank === 1 ? `🏆 CORE CHAMPION: ${this.name}` : `🥈 #${this.finishRank} Reached Core: ${this.name}`, this.finishRank === 1 ? '#fbbf24' : '#38bdf8');
        updateLeaderboardUI();
      }
      return;
    }

    if (currentGameMode === 'circle_survivor') {
      // Circle Survivor Physics:
      // Slight chaotic attraction/gravity keeping marbles bouncing dynamically
      const dx = ARENA_CX - this.x;
      const dy = ARENA_CY - this.y;
      const d = Math.hypot(dx, dy);

      if (d > 30) {
        this.vx += (dx / d) * 0.06;
        this.vy += (dy / d) * 0.06;
      }
      // Micro-jitter to prevent stagnant stacking
      this.vx += (Math.random() - 0.5) * 0.12;
      this.vy += (Math.random() - 0.5) * 0.12;

      this.vx *= 0.994;
      this.vy *= 0.994;

      this.x += this.vx;
      this.y += this.vy;

      // Save speed trail for active survivor leaders
      if (this === camera.leadMarble && Math.hypot(this.vx, this.vy) > 3.5) {
        this.trail.unshift({ x: this.x, y: this.y, alpha: 1 });
        if (this.trail.length > 10) this.trail.pop();
      } else if (this.trail.length > 0) {
        this.trail.pop();
      }

      // Check if knocked out of arena through gaps - DISAPPEAR IMMEDIATELY!
      const distFromCenter = Math.hypot(this.x - ARENA_CX, this.y - ARENA_CY);
      if (distFromCenter > ARENA_RADIUS + 18 && !this.finished) {
        this.finished = true;
        finishedMarbles.push(this);
        const aliveSurvivors = marbles.filter(m => !m.finished);
        this.finishRank = aliveSurvivors.length + 1; // e.g., 2nd eliminated, etc.
        sfx.playMarbleClink(0.8);
        createCelebration(this.x, this.y); // Poof sparks

        addFeedItem(`💀 #${this.finishRank} Eliminated: ${this.name}`, '#f43f5e');

        // Check if only 1 country survives in the ring!
        if (aliveSurvivors.length === 1 && !winnerMarble) {
          winnerMarble = aliveSurvivors[0];
          winnerMarble.finishRank = 1;
          sfx.playVictory();
          createCelebration(winnerMarble.x, winnerMarble.y);
          showWinnerBanner(winnerMarble);
          if (typeof updateVideoTitles === 'function') updateVideoTitles(winnerMarble);

          // Auto-stop recording after 3.5s so champion podium is captured
          if (isRecording) {
            setTimeout(() => {
              if (isRecording && typeof stopRecording === 'function') {
                stopRecording();
              }
            }, 3500);
          }
        }
        updateLeaderboardUI();
      }
      return;
    }

    // Standard Downhill Race Physics
    this.vy += GRAVITY;
    this.vx *= FRICTION;
    this.vy *= FRICTION;

    this.x += this.vx;
    this.y += this.vy;

    // Outer track bounds
    const minX = 70 + this.radius;
    const maxX = V_WIDTH - 70 - this.radius;
    if (this.x < minX) {
      this.x = minX;
      this.vx = -this.vx * RESTITUTION;
      sfx.playMarbleClink(0.5);
    } else if (this.x > maxX) {
      this.x = maxX;
      this.vx = -this.vx * RESTITUTION;
      sfx.playMarbleClink(0.5);
    }

    // Check Start Gate
    if (!gateOpen && this.y + this.radius > 360) {
      this.y = 360 - this.radius;
      this.vy = -this.vy * 0.3;
    }

    // Save trail for leader
    if (this === camera.leadMarble && Math.hypot(this.vx, this.vy) > 3) {
      this.trail.unshift({ x: this.x, y: this.y, alpha: 1 });
      if (this.trail.length > 12) this.trail.pop();
    } else if (this.trail.length > 0) {
      this.trail.pop();
    }

    // Check Finish Line
    if (!this.finished && this.y >= finishLineY) {
      this.finished = true;
      finishedMarbles.push(this);
      this.finishRank = finishedMarbles.length;
      sfx.playFinishCross();
      createCelebration(this.x, this.y);

      const medal = this.finishRank === 1 ? '🥇 1st Place (GOLD)' : (this.finishRank === 2 ? '🥈 2nd Place (SILVER)' : (this.finishRank === 3 ? '🥉 3rd Place (BRONZE)' : `#${this.finishRank} Finished`));
      addFeedItem(`${medal}: ${this.name}`, this.finishRank <= 3 ? '#fbbf24' : '#10b981');

      // Check for first place
      if (this.finishRank === 1) {
        winnerMarble = this; // Draw 1st place champion showcase directly onto the canvas!
        sfx.playVictory();
        showWinnerBanner(this);
        if (typeof updateVideoTitles === 'function') updateVideoTitles(this);

        // Keep recording for 3.5 seconds so the 1st place podium is captured in the video!
        if (isRecording) {
          setTimeout(() => {
            if (isRecording && typeof stopRecording === 'function') {
              stopRecording();
            }
          }, 3500); // 3.5s of epic champion celebration in the recorded video!
        }
      }
      updateLeaderboardUI();
    }
  }

  draw(ctx) {
    // In Circle Survivor mode, eliminated marbles disappear completely from the screen
    if (currentGameMode === 'circle_survivor' && this.finished && this !== winnerMarble) {
      return;
    }

    // Draw Speed Trail
    for (let i = 0; i < this.trail.length; i++) {
      const tr = this.trail[i];
      tr.alpha -= 0.05;
      if (tr.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = tr.alpha * 0.5;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, this.radius * (1 - i / this.trail.length * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = '#00f0ff';
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    // Marble Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    // Draw Flag Texture
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.clip();

    const img = flagImages[this.code];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -this.radius, -this.radius, this.radius * 2, this.radius * 2);
    } else {
      ctx.fillStyle = '#334155';
      ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.code.toUpperCase(), 0, 0);
    }

    ctx.restore();

    // Glossy 3D Glass Sphere Overlay
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-this.radius * 0.35, -this.radius * 0.35, 2, 0, 0, this.radius);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Outline
    ctx.lineWidth = (this === camera.leadMarble) ? 3.5 : 2;
    ctx.strokeStyle = (this === camera.leadMarble) ? '#fbbf24' : 'rgba(255, 255, 255, 0.8)';
    ctx.stroke();

    // Crown or Rank Badge on Leader
    if (this === camera.leadMarble && !this.finished) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑 #1', 0, -this.radius - 8);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(this.name, 0, this.radius + 16);
    } else if (this.finishRank) {
      // Medal badge
      ctx.fillStyle = this.finishRank === 1 ? '#fbbf24' : (this.finishRank === 2 ? '#cbd5e1' : '#f97316');
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`#${this.finishRank}`, 0, -this.radius - 6);
    }

    ctx.restore();
  }
}

// Particle System
class Particle {
  constructor(x, y, color, speed = 8) {
    this.x = x;
    this.y = y;
    const a = Math.random() * Math.PI * 2;
    const v = Math.random() * speed + 1;
    this.vx = Math.cos(a) * v;
    this.vy = Math.sin(a) * v;
    this.color = color;
    this.alpha = 1;
    this.size = Math.random() * 4 + 2;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 0.025;
    this.size *= 0.96;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function createCelebration(x, y) {
  const colors = ['#fbbf24', '#f43f5e', '#3b82f6', '#10b981', '#a855f7'];
  for (let i = 0; i < 30; i++) {
    particles.push(new Particle(x, y, colors[i % colors.length], 10));
  }
}

// Build the Massive Vertical Track Obstacles (9 Epic Non-Lethal Stages)
function buildTrack() {
  walls = [];
  pegs = [];
  bumpers = [];
  spinners = [];
  movingHammers = [];
  springBumpers = [];
  finishLineY = TRACK_HEIGHT - 350; // Y: 10050

  // Difficulty Scaling Tuning
  let speedMult = 1.0;
  let springForce = -16;
  if (currentDifficulty === 'Easy') {
    GRAVITY = 0.22;
    speedMult = 0.55;
    springForce = -10;
  } else if (currentDifficulty === 'Hard') {
    GRAVITY = 0.35;
    speedMult = 1.45;
    springForce = -22;
  } else {
    GRAVITY = 0.28;
    speedMult = 1.0;
    springForce = -16;
  }

  // Track Side Walls
  const L = 70;
  const R = V_WIDTH - 70;

  // ==========================================
  // STAGE 1: Dense Plinko Peg Field (Y: 480 - 1350)
  // ==========================================
  const pegRows = 10;
  for (let r = 0; r < pegRows; r++) {
    const y = 490 + r * 85;
    const cols = (r % 2 === 0) ? 10 : 9;
    const spacing = (R - L) / (cols + 1);
    for (let c = 1; c <= cols; c++) {
      const x = L + c * spacing + (r % 2 === 0 ? 0 : spacing * 0.5);
      pegs.push({ x, y, radius: 12 });
    }
  }

  // Heavy central pinball deflectors in Plinko
  bumpers.push({ x: V_WIDTH / 2 - 180, y: 850, radius: 36 });
  bumpers.push({ x: V_WIDTH / 2 + 180, y: 850, radius: 36 });
  bumpers.push({ x: V_WIDTH / 2, y: 1100, radius: 42 });

  // ==========================================
  // STAGE 2: Banked Zig-Zag Slopes with Upward Spring Bumpers (Y: 1400 - 2500)
  // ==========================================
  walls.push({ x1: L, y1: 1420, x2: R - 170, y2: 1620, thickness: 16 }); // Ramp 1
  walls.push({ x1: R, y1: 1780, x2: L + 170, y2: 1980, thickness: 16 }); // Ramp 2
  walls.push({ x1: L, y1: 2140, x2: R - 170, y2: 2340, thickness: 16 }); // Ramp 3

  // Launch bumpers at ramp turns (flings marbles back up & across!)
  bumpers.push({ x: R - 85, y: 1690, radius: 46 });
  bumpers.push({ x: L + 85, y: 2050, radius: 46 });
  bumpers.push({ x: R - 85, y: 2410, radius: 46 });

  // Upward Spring Launchers (bounces downward marbles back UP!)
  springBumpers.push({ x: L + 320, y: 1600, w: 160, h: 24, bounceVy: springForce });
  springBumpers.push({ x: R - 320, y: 1960, w: 160, h: 24, bounceVy: springForce });
  springBumpers.push({ x: L + 320, y: 2320, w: 160, h: 24, bounceVy: springForce });

  // Stage 2 Moving Sweeper Hammer 1
  movingHammers.push({ x: 260, y: 1870, w: 110, h: 28, minX: L + 80, maxX: R - 80, speed: 5.8 * speedMult, dir: 1 });

  // ==========================================
  // STAGE 3: Opposing Quad-Windmill Gauntlet (Y: 2600 - 3700)
  // ==========================================
  spinners.push({ x: V_WIDTH / 2 - 250, y: 2750, length: 190, blades: 4, angle: 0, speed: 0.055 * speedMult });
  spinners.push({ x: V_WIDTH / 2 + 250, y: 2750, length: 190, blades: 4, angle: 0, speed: -0.055 * speedMult });

  spinners.push({ x: V_WIDTH / 2, y: 3100, length: 270, blades: 4, angle: 0, speed: 0.06 * speedMult });

  spinners.push({ x: V_WIDTH / 2 - 250, y: 3500, length: 190, blades: 4, angle: 0, speed: -0.055 * speedMult });
  spinners.push({ x: V_WIDTH / 2 + 250, y: 3500, length: 190, blades: 4, angle: 0, speed: 0.055 * speedMult });

  bumpers.push({ x: V_WIDTH / 2, y: 3320, radius: 52 });
  movingHammers.push({ x: R - 200, y: 3660, w: 120, h: 28, minX: L + 80, maxX: R - 80, speed: 6.5 * speedMult, dir: -1 });

  // ==========================================
  // STAGE 4: The Double Choke Bottleneck (Y: 3800 - 4800)
  // ==========================================
  walls.push({ x1: L, y1: 3800, x2: V_WIDTH / 2 - 120, y2: 4180, thickness: 16 });
  walls.push({ x1: R, y1: 3800, x2: V_WIDTH / 2 + 120, y2: 4180, thickness: 16 });

  walls.push({ x1: V_WIDTH / 2 - 120, y1: 4180, x2: V_WIDTH / 2 - 120, y2: 4600, thickness: 16 });
  walls.push({ x1: V_WIDTH / 2 + 120, y1: 4180, x2: V_WIDTH / 2 + 120, y2: 4600, thickness: 16 });

  pegs.push({ x: V_WIDTH / 2, y: 4280, radius: 14 });
  pegs.push({ x: V_WIDTH / 2, y: 4460, radius: 14 });

  // ==========================================
  // STAGE 5: Pinball Labyrinth (Y: 4850 - 6200)
  // ==========================================
  bumpers.push({ x: V_WIDTH / 2, y: 4920, radius: 56 });
  bumpers.push({ x: V_WIDTH / 2 - 270, y: 5120, radius: 50 });
  bumpers.push({ x: V_WIDTH / 2 + 270, y: 5120, radius: 50 });

  movingHammers.push({ x: 260, y: 5280, w: 130, h: 30, minX: L + 80, maxX: R - 80, speed: 7.8 * speedMult, dir: 1 });

  bumpers.push({ x: V_WIDTH / 2 - 140, y: 5420, radius: 50 });
  bumpers.push({ x: V_WIDTH / 2 + 140, y: 5420, radius: 50 });
  bumpers.push({ x: V_WIDTH / 2, y: 5650, radius: 56 });

  // Slalom funnel
  walls.push({ x1: L, y1: 5820, x2: V_WIDTH / 2 + 80, y2: 5960, thickness: 16 });
  walls.push({ x1: R, y1: 6060, x2: V_WIDTH / 2 - 80, y2: 6200, thickness: 16 });

  // ==========================================
  // STAGE 6: The Gravity Funnel & Twin Cross-Spinners (Y: 6250 - 7450)
  // ==========================================
  walls.push({ x1: L, y1: 6280, x2: V_WIDTH / 2 - 150, y2: 6680, thickness: 16 });
  walls.push({ x1: R, y1: 6280, x2: V_WIDTH / 2 + 150, y2: 6680, thickness: 16 });

  // Vortex Spinners
  spinners.push({ x: V_WIDTH / 2 - 180, y: 6850, length: 170, blades: 4, angle: 0, speed: 0.06 * speedMult });
  spinners.push({ x: V_WIDTH / 2 + 180, y: 6850, length: 170, blades: 4, angle: 0, speed: -0.06 * speedMult });
  bumpers.push({ x: V_WIDTH / 2, y: 7080, radius: 54 });
  springBumpers.push({ x: V_WIDTH / 2 - 100, y: 7220, w: 200, h: 26, bounceVy: springForce });

  // ==========================================
  // STAGE 7: Double Pendulum Sweepers & Quad Matrix (Y: 7500 - 8700)
  // ==========================================
  // Moving Hammer 4 & 5 (high-speed pendulum sweeper gauntlet)
  movingHammers.push({ x: 200, y: 7750, w: 140, h: 32, minX: L + 60, maxX: R - 80, speed: 8.5 * speedMult, dir: 1 });
  movingHammers.push({ x: R - 240, y: 8350, w: 140, h: 32, minX: L + 60, maxX: R - 80, speed: 9.0 * speedMult, dir: -1 });

  bumpers.push({ x: V_WIDTH / 2 - 250, y: 7950, radius: 48 });
  bumpers.push({ x: V_WIDTH / 2, y: 8050, radius: 52 });
  bumpers.push({ x: V_WIDTH / 2 + 250, y: 7950, radius: 48 });
  bumpers.push({ x: V_WIDTH / 2 - 180, y: 8550, radius: 48 });
  bumpers.push({ x: V_WIDTH / 2 + 180, y: 8550, radius: 48 });

  // ==========================================
  // STAGE 8: The Grand Finale Gateway (Y: 8720 - 9350)
  // ==========================================
  // Triple-lane funnel
  walls.push({ x1: L, y1: 8720, x2: V_WIDTH / 2 - 140, y2: 9020, thickness: 16 });
  walls.push({ x1: R, y1: 8720, x2: V_WIDTH / 2 + 140, y2: 9020, thickness: 16 });

  bumpers.push({ x: V_WIDTH / 2, y: 8880, radius: 46 });

  // Final straightaway rails to Finish Line
  walls.push({ x1: V_WIDTH / 2 - 140, y1: 9020, x2: V_WIDTH / 2 - 140, y2: 9350, thickness: 16 });
  walls.push({ x1: V_WIDTH / 2 + 140, y1: 9020, x2: V_WIDTH / 2 + 140, y2: 9350, thickness: 16 });

  // Catch Basin bottom walls
  walls.push({ x1: L, y1: TRACK_HEIGHT - 80, x2: R, y2: TRACK_HEIGHT - 80, thickness: 20 });
}

// Initialize Marbles (Downhill Race or Circle Survivor)
function initRace() {
  marbles = [];
  finishedMarbles = [];
  particles = [];
  raceLog = [];
  renderFeedUI();
  gateOpen = false;
  winnerMarble = null;
  winnerBannerAnim = 0;
  arenaAngle = 0;
  centerBladeAngle = 0;
  document.getElementById('winnerOverlay').classList.remove('active');

  // Filter countries by selected region/continent
  const targetCountries = (selectedContinent === "All")
    ? [...COUNTRIES_DATA]
    : COUNTRIES_DATA.filter(c => c.continent.toLowerCase() === selectedContinent.toLowerCase());

  // Tuning speeds by difficulty
  if (currentDifficulty === 'Easy') {
    arenaSpeed = 0.010;
  } else if (currentDifficulty === 'Hard') {
    arenaSpeed = 0.024;
  } else {
    arenaSpeed = 0.016;
  }

  // Setup mode-specific layout
  if (currentGameMode === 'concentric_rings') {
    // CONCENTRIC RINGS MAZE: Reset rings and spawn in outer orbital band
    const mult = currentDifficulty === 'Easy' ? 0.75 : (currentDifficulty === 'Hard' ? 1.35 : 1.0);
    CONCENTRIC_RINGS[0].speed = -0.012 * mult;
    CONCENTRIC_RINGS[1].speed = 0.016 * mult;
    CONCENTRIC_RINGS[2].speed = -0.022 * mult;
    CONCENTRIC_RINGS[3].speed = 0.026 * mult;

    CONCENTRIC_RINGS.forEach((r, idx) => {
      r.angle = idx * 0.95;
    });

    const total = targetCountries.length;
    const shuffled = [...targetCountries].sort(() => Math.random() - 0.5);

    shuffled.forEach((country, i) => {
      // Spawn in outer track band (between R=375 and R=445)
      const r = 375 + Math.sqrt((i + 0.5) / total) * 70;
      const theta = (i / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
      const x = ARENA_CX + Math.cos(theta) * r;
      const y = ARENA_CY + Math.sin(theta) * r;
      const m = new Marble(country, x, y);
      m.vx = (Math.random() - 0.5) * 4;
      m.vy = (Math.random() - 0.5) * 4;
      marbles.push(m);
    });

    camera.y = 0;
    camera.targetY = 0;
    camera.leadMarble = marbles[0];
  } else if (currentGameMode === 'circle_survivor') {
    // CIRCLE SURVIVOR: Spawn in rotating arena
    const total = targetCountries.length;
    const shuffled = [...targetCountries].sort(() => Math.random() - 0.5);

    shuffled.forEach((country, i) => {
      // Fermat's spiral / golden angle distribution inside arena
      const r = 50 + Math.sqrt((i + 0.5) / total) * (ARENA_RADIUS - 85);
      const theta = i * 2.399963229728653; // golden angle
      const x = ARENA_CX + Math.cos(theta) * r;
      const y = ARENA_CY + Math.sin(theta) * r;
      const m = new Marble(country, x, y);
      m.vx = (Math.random() - 0.5) * 4.5;
      m.vy = (Math.random() - 0.5) * 4.5;
      marbles.push(m);
    });

    // Orbit Pinball Bumpers
    survivorObstacles.orbitBumpers = [
      { angleOffset: 0, dist: 235, radius: 36 },
      { angleOffset: Math.PI * 0.5, dist: 235, radius: 36 },
      { angleOffset: Math.PI, dist: 235, radius: 36 },
      { angleOffset: Math.PI * 1.5, dist: 235, radius: 36 }
    ];

    camera.y = 0;
    camera.targetY = 0;
    camera.leadMarble = marbles[0];
  } else {
    // DOWNHILL RACE: Build track and spawn in start box
    buildTrack();

    const total = targetCountries.length;
    const cols = total > 60 ? 15 : (total > 30 ? 10 : (total > 15 ? 7 : 5));
    const spacingX = Math.min(56, (V_WIDTH - 280) / cols);
    const spacingY = 46;
    const startX = V_WIDTH / 2 - ((cols - 1) * spacingX) / 2;
    const startY = 80;

    const shuffled = [...targetCountries].sort(() => Math.random() - 0.5);

    shuffled.forEach((country, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * spacingX + (Math.random() - 0.5) * 6;
      const y = startY + row * spacingY + (Math.random() - 0.5) * 6;
      marbles.push(new Marble(country, x, y));
    });

    camera.y = 0;
    camera.leadMarble = marbles[0];
  }

  updateLeaderboardUI();
  if (typeof updateVideoTitles === 'function') updateVideoTitles(null);
}

// Circle Survivor Battle Royale Arena Physics
function handleCircleSurvivorPhysics() {
  arenaAngle += arenaSpeed;
  centerBladeAngle -= arenaSpeed * 1.8;

  // Marble-Marble Collisions
  marbles.sort((a, b) => a.y - b.y);
  for (let i = 0; i < marbles.length; i++) {
    const m1 = marbles[i];
    if (m1.finished) continue;

    for (let j = i + 1; j < marbles.length; j++) {
      const m2 = marbles[j];
      if (m2.finished) continue;
      if (m2.y - m1.y > m1.radius + m2.radius) break; // Spatial prune

      const dx = m2.x - m1.x;
      const dy = m2.y - m1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = m1.radius + m2.radius;

      if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        m1.x -= nx * overlap * 0.5;
        m1.y -= ny * overlap * 0.5;
        m2.x += nx * overlap * 0.5;
        m2.y += ny * overlap * 0.5;

        const kx = m1.vx - m2.vx;
        const ky = m1.vy - m2.vy;
        const p = 2 * (nx * kx + ny * ky) / (m1.mass + m2.mass);

        m1.vx -= p * m2.mass * nx;
        m1.vy -= p * m2.mass * ny;
        m2.vx += p * m1.mass * nx;
        m2.vy += p * m1.mass * ny;

        if (Math.hypot(kx, ky) > 3) {
          sfx.playMarbleClink(0.3);
        }
      }
    }

    // Marble vs Central Bumper
    const cdx = m1.x - ARENA_CX;
    const cdy = m1.y - ARENA_CY;
    const cdist = Math.hypot(cdx, cdy);
    const centerBumperRadius = 55;

    if (cdist < m1.radius + centerBumperRadius && cdist > 0) {
      const cnx = cdx / cdist;
      const cny = cdy / cdist;
      m1.x = ARENA_CX + cnx * (m1.radius + centerBumperRadius);
      m1.y = ARENA_CY + cny * (m1.radius + centerBumperRadius);
      m1.vx = cnx * 19 + (Math.random() - 0.5) * 4;
      m1.vy = cny * 19 + (Math.random() - 0.5) * 4;
      sfx.playBumper();
      createCelebration(ARENA_CX, ARENA_CY);
    }

    // Marble vs Center Spinning Cross Blades (4 blades)
    const bladeLength = 150;
    const numBlades = 4;
    for (let b = 0; b < numBlades; b++) {
      const bAngle = centerBladeAngle + (b * Math.PI * 2) / numBlades;
      const bx2 = ARENA_CX + Math.cos(bAngle) * bladeLength;
      const by2 = ARENA_CY + Math.sin(bAngle) * bladeLength;

      const lineLen2 = (bx2 - ARENA_CX) ** 2 + (by2 - ARENA_CY) ** 2;
      let t = ((m1.x - ARENA_CX) * (bx2 - ARENA_CX) + (m1.y - ARENA_CY) * (by2 - ARENA_CY)) / lineLen2;
      t = Math.max(0, Math.min(1, t));
      const projX = ARENA_CX + t * (bx2 - ARENA_CX);
      const projY = ARENA_CY + t * (by2 - ARENA_CY);
      const distToBlade = Math.hypot(m1.x - projX, m1.y - projY);

      if (distToBlade < m1.radius + 8) {
        const bladeVx = -Math.sin(bAngle) * (-arenaSpeed * 1.8) * bladeLength;
        const bladeVy = Math.cos(bAngle) * (-arenaSpeed * 1.8) * bladeLength;
        m1.vx += bladeVx * 2.5 + (Math.random() - 0.5) * 4;
        m1.vy += bladeVy * 2.5 + (Math.random() - 0.5) * 4;
        sfx.playMarbleClink(0.7);
      }
    }

    // Marble vs 4 Orbit Pinball Bumpers
    survivorObstacles.orbitBumpers.forEach(ob => {
      const orbitAng = arenaAngle * 0.75 + ob.angleOffset;
      const ox = ARENA_CX + Math.cos(orbitAng) * ob.dist;
      const oy = ARENA_CY + Math.sin(orbitAng) * ob.dist;

      const odx = m1.x - ox;
      const ody = m1.y - oy;
      const odist = Math.hypot(odx, ody);
      if (odist < m1.radius + ob.radius && odist > 0) {
        const onx = odx / odist;
        const ony = ody / odist;
        m1.x = ox + onx * (m1.radius + ob.radius);
        m1.y = oy + ony * (m1.radius + ob.radius);
        m1.vx = onx * 18 + (Math.random() - 0.5) * 4;
        m1.vy = ony * 18 + (Math.random() - 0.5) * 4;
        sfx.playBumper();
        createCelebration(ox, oy);
      }
    });

    // Marble vs Outer Rotating Ring Boundary
    const wallDist = Math.hypot(m1.x - ARENA_CX, m1.y - ARENA_CY);
    if (wallDist + m1.radius >= ARENA_RADIUS && wallDist <= ARENA_RADIUS + 35) {
      let ang = Math.atan2(m1.y - ARENA_CY, m1.x - ARENA_CX) - arenaAngle;
      ang = (ang % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

      const sectorSize = (Math.PI * 2) / ARENA_NUM_GAPS; // PI / 2
      const posInSector = ang % sectorSize;
      const isGap = posInSector >= (sectorSize - ARENA_GAP_ARC);

      if (!isGap) {
        // Solid wall arc reflection!
        const wnx = (m1.x - ARENA_CX) / wallDist;
        const wny = (m1.y - ARENA_CY) / wallDist;

        m1.x = ARENA_CX + wnx * (ARENA_RADIUS - m1.radius);
        m1.y = ARENA_CY + wny * (ARENA_RADIUS - m1.radius);

        const tanVx = -wny * arenaSpeed * ARENA_RADIUS;
        const tanVy = wnx * arenaSpeed * ARENA_RADIUS;

        const dot = m1.vx * wnx + m1.vy * wny;
        if (dot > 0) {
          m1.vx = (m1.vx - 1.85 * dot * wnx) + tanVx * 0.35;
          m1.vy = (m1.vy - 1.85 * dot * wny) + tanVy * 0.35;
          sfx.playMarbleClink(0.4);
        }
      }
      // If isGap: marble glides through into space and triggers elimination!
    }
  }
// Concentric Rings Maze Physics (Multi-Layer Ring Maze)
function handleConcentricRingsPhysics() {
  // Update rotating ring barrier angles
  CONCENTRIC_RINGS.forEach(r => {
    r.angle += r.speed;
  });

  // Spatial Marble-Marble Collisions
  marbles.sort((a, b) => a.y - b.y);
  for (let i = 0; i < marbles.length; i++) {
    const m1 = marbles[i];
    if (m1.finished) continue;

    for (let j = i + 1; j < marbles.length; j++) {
      const m2 = marbles[j];
      if (m2.finished) continue;
      if (m2.y - m1.y > m1.radius + m2.radius) break;

      const dx = m2.x - m1.x;
      const dy = m2.y - m1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = m1.radius + m2.radius;

      if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        m1.x -= nx * overlap * 0.5;
        m1.y -= ny * overlap * 0.5;
        m2.x += nx * overlap * 0.5;
        m2.y += ny * overlap * 0.5;

        const kx = m1.vx - m2.vx;
        const ky = m1.vy - m2.vy;
        const p = 2 * (nx * kx + ny * ky) / (m1.mass + m2.mass);

        m1.vx -= p * m2.mass * nx;
        m1.vy -= p * m2.mass * ny;
        m2.vx += p * m1.mass * nx;
        m2.vy += p * m1.mass * ny;

        if (Math.hypot(kx, ky) > 3) {
          sfx.playMarbleClink(0.3);
        }
      }
    }

    // Outer perimeter constraint (keeps marbles inside the maze boundaries)
    const distFromCenter = Math.hypot(m1.x - ARENA_CX, m1.y - ARENA_CY);
    const outerBoundary = 472;
    if (distFromCenter + m1.radius > outerBoundary && distFromCenter > 0) {
      const nx = (m1.x - ARENA_CX) / distFromCenter;
      const ny = (m1.y - ARENA_CY) / distFromCenter;
      m1.x = ARENA_CX + nx * (outerBoundary - m1.radius);
      m1.y = ARENA_CY + ny * (outerBoundary - m1.radius);
      const dot = m1.vx * nx + m1.vy * ny;
      if (dot > 0) {
        m1.vx -= 1.8 * dot * nx;
        m1.vy -= 1.8 * dot * ny;
        sfx.playMarbleClink(0.35);
      }
    }

    // Marble vs Concentric Rings Barriers
    CONCENTRIC_RINGS.forEach(ring => {
      const rDist = Math.abs(distFromCenter - ring.radius);
      if (rDist < m1.radius + 6) {
        let ang = Math.atan2(m1.y - ARENA_CY, m1.x - ARENA_CX) - ring.angle;
        ang = (ang % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

        const sector = (Math.PI * 2) / ring.numGaps;
        const pos = ang % sector;
        const isGap = pos >= (sector - ring.gapArc);

        if (!isGap) {
          // Solid ring barrier collision
          const nx = (m1.x - ARENA_CX) / distFromCenter;
          const ny = (m1.y - ARENA_CY) / distFromCenter;

          if (distFromCenter > ring.radius) {
            m1.x = ARENA_CX + nx * (ring.radius + m1.radius + 1);
            m1.y = ARENA_CY + ny * (ring.radius + m1.radius + 1);
          } else {
            m1.x = ARENA_CX + nx * (ring.radius - m1.radius - 1);
            m1.y = ARENA_CY + ny * (ring.radius - m1.radius - 1);
          }

          const tanVx = -ny * ring.speed * ring.radius;
          const tanVy = nx * ring.speed * ring.radius;

          const dot = m1.vx * nx + m1.vy * ny;
          if ((dot > 0 && distFromCenter < ring.radius) || (dot < 0 && distFromCenter > ring.radius)) {
            m1.vx = (m1.vx - 1.85 * dot * nx) + tanVx * 0.35;
            m1.vy = (m1.vy - 1.85 * dot * ny) + tanVy * 0.35;
            sfx.playMarbleClink(0.35);
          }
        }
        // If isGap, marble glides freely through the door into the next tier!
      }
    });
  }
}

// Physics & Collision Handling
function handlePhysics() {
  if (currentGameMode === 'concentric_rings') {
    handleConcentricRingsPhysics();
    return;
  }
  if (currentGameMode === 'circle_survivor') {
    handleCircleSurvivorPhysics();
    return;
  }

  // Update Spinners
  spinners.forEach(sp => {
    sp.angle += sp.speed;
  });

  // Update Moving Sweeper Hammers
  movingHammers.forEach(h => {
    h.x += h.speed * h.dir;
    if (h.x <= h.minX) {
      h.x = h.minX;
      h.dir = 1;
    } else if (h.x >= h.maxX) {
      h.x = h.maxX;
      h.dir = -1;
    }
  });

  // Marble-Marble Collisions (spatial optimization)
  marbles.sort((a, b) => a.y - b.y);

  for (let i = 0; i < marbles.length; i++) {
    const m1 = marbles[i];

    for (let j = i + 1; j < marbles.length; j++) {
      const m2 = marbles[j];
      if (m2.y - m1.y > m1.radius + m2.radius) break; // Spatial prune

      const dx = m2.x - m1.x;
      const dy = m2.y - m1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = m1.radius + m2.radius;

      if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        m1.x -= nx * overlap * 0.5;
        m1.y -= ny * overlap * 0.5;
        m2.x += nx * overlap * 0.5;
        m2.y += ny * overlap * 0.5;

        const kx = m1.vx - m2.vx;
        const ky = m1.vy - m2.vy;
        const p = 2 * (nx * kx + ny * ky) / (m1.mass + m2.mass);

        m1.vx -= p * m2.mass * nx;
        m1.vy -= p * m2.mass * ny;
        m2.vx += p * m1.mass * nx;
        m2.vy += p * m1.mass * ny;

        if (Math.hypot(kx, ky) > 3) {
          sfx.playMarbleClink(0.3);
        }
      }
    }

    // Marble vs Pegs
    pegs.forEach(peg => {
      const dx = m1.x - peg.x;
      const dy = m1.y - peg.y;
      const dist = Math.hypot(dx, dy);
      const minDist = m1.radius + peg.radius;

      if (dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        m1.x = peg.x + nx * minDist;
        const dot = m1.vx * nx + m1.vy * ny;
        m1.vx -= 1.8 * dot * nx;
        m1.vy -= 1.8 * dot * ny;
        sfx.playMarbleClink(0.6);
      }
    });

    // Marble vs Bumpers (Heavy Deflection!)
    bumpers.forEach(bm => {
      const dx = m1.x - bm.x;
      const dy = m1.y - bm.y;
      const dist = Math.hypot(dx, dy);
      const minDist = m1.radius + bm.radius;

      if (dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        m1.x = bm.x + nx * minDist;
        const bounceForce = 20;
        m1.vx = nx * bounceForce;
        m1.vy = ny * bounceForce;
        sfx.playBumper();
        createCelebration(bm.x, bm.y);
      }
    });

    // Marble vs Upward Spring Bumpers (Flings lead marbles back UP!)
    springBumpers.forEach(sb => {
      if (m1.x + m1.radius >= sb.x && m1.x - m1.radius <= sb.x + sb.w &&
          m1.y + m1.radius >= sb.y && m1.y - m1.radius <= sb.y + sb.h && m1.vy > 0) {
        m1.vy = sb.bounceVy; // Bounces back up!
        m1.vx += (Math.random() - 0.5) * 8;
        sfx.playBumper();
        createCelebration(m1.x, m1.y);
      }
    });

    // Marble vs Moving Sweeper Hammers (Knocks back up and sideways!)
    movingHammers.forEach(h => {
      if (m1.x + m1.radius >= h.x && m1.x - m1.radius <= h.x + h.w &&
          m1.y + m1.radius >= h.y && m1.y - m1.radius <= h.y + h.h) {
        m1.vx = h.dir * 20 + (Math.random() - 0.5) * 6;
        m1.vy = -12; // Knocks marble back UP the track!
        sfx.playBumper();
        createCelebration(m1.x, m1.y);
      }
    });

    // Marble vs Sloped Wall Segments
    walls.forEach(w => {
      const lineLen2 = (w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2;
      let t = ((m1.x - w.x1) * (w.x2 - w.x1) + (m1.y - w.y1) * (w.y2 - w.y1)) / lineLen2;
      t = Math.max(0, Math.min(1, t));
      const projX = w.x1 + t * (w.x2 - w.x1);
      const projY = w.y1 + t * (w.y2 - w.y1);
      const dist = Math.hypot(m1.x - projX, m1.y - projY);
      const minDist = m1.radius + w.thickness / 2;

      if (dist < minDist && dist > 0) {
        const nx = (m1.x - projX) / dist;
        const ny = (m1.y - projY) / dist;
        m1.x = projX + nx * minDist;
        const dot = m1.vx * nx + m1.vy * ny;
        if (dot < 0) {
          m1.vx -= (1 + RESTITUTION) * dot * nx;
          m1.vy -= (1 + RESTITUTION) * dot * ny;
          sfx.playMarbleClink(0.4);
        }
      }
    });

    // Marble vs Spinners (Rotates marbles backwards!)
    spinners.forEach(sp => {
      for (let b = 0; b < sp.blades; b++) {
        const a = sp.angle + (b * Math.PI * 2) / sp.blades;
        const x2 = sp.x + Math.cos(a) * sp.length;
        const y2 = sp.y + Math.sin(a) * sp.length;

        const lineLen2 = (x2 - sp.x) ** 2 + (y2 - sp.y) ** 2;
        let t = ((m1.x - sp.x) * (x2 - sp.x) + (m1.y - sp.y) * (y2 - sp.y)) / lineLen2;
        t = Math.max(0, Math.min(1, t));
        const projX = sp.x + t * (x2 - sp.x);
        const projY = sp.y + t * (y2 - sp.y);
        const dist = Math.hypot(m1.x - projX, m1.y - projY);

        if (dist < m1.radius + 6) {
          const bladeVx = -Math.sin(a) * sp.speed * sp.length;
          const bladeVy = Math.cos(a) * sp.speed * sp.length;
          m1.vx += bladeVx * 2.8;
          m1.vy += bladeVy * 2.8;
          sfx.playMarbleClink(0.8);
        }
      }
    });
  }
}

// Track Leader & Update Action Camera
function updateCamera() {
  if (currentGameMode === 'circle_survivor' || currentGameMode === 'concentric_rings') {
    camera.targetY = 0;
    camera.y = 0;

    // In circular arenas, lead is the marble closest to the center core
    const active = marbles.filter(m => !m.finished);
    if (active.length > 0) {
      active.sort((a, b) => {
        const da = Math.hypot(a.x - ARENA_CX, a.y - ARENA_CY);
        const db = Math.hypot(b.x - ARENA_CX, b.y - ARENA_CY);
        return da - db;
      });
      camera.leadMarble = active[0];
    } else {
      camera.leadMarble = finishedMarbles[0] || null;
    }
    return;
  }

  let lead = null;
  let maxY = -1;

  marbles.forEach(m => {
    if (!m.finished && m.y > maxY) {
      maxY = m.y;
      lead = m;
    }
  });

  if (!lead && finishedMarbles.length > 0) {
    lead = finishedMarbles[finishedMarbles.length - 1];
  }

  camera.leadMarble = lead;

  if (lead) {
    camera.targetY = Math.max(0, Math.min(TRACK_HEIGHT - V_HEIGHT, lead.y - V_HEIGHT * 0.45));
  }

  camera.y += (camera.targetY - camera.y) * 0.12;
}

let raceLog = [];

function addFeedItem(text, color = '#38bdf8') {
  raceLog.unshift({ text, color, time: Date.now() });
  if (raceLog.length > 12) raceLog.pop();
  renderFeedUI();
}

function renderFeedUI() {
  const feed = document.getElementById('killFeedList');
  if (raceLog.length === 0) {
    feed.innerHTML = `<div style="font-size: 0.8rem; color: #64748b; text-align: center; padding: 20px;">Race in progress... Watch the photo-finish!</div>`;
  } else {
    feed.innerHTML = raceLog.map(item => `
      <div class="kill-item" style="border-left-color: ${item.color};">
        <span class="killer" style="color: ${item.color};">${escapeHtml(item.text)}</span>
      </div>
    `).join('');
  }
}

// Update Top Leaderboard UI
function updateLeaderboardUI() {
  document.getElementById('aliveCount').innerText = marbles.length - finishedMarbles.length;
  document.getElementById('eliminatedCount').innerText = finishedMarbles.length;

  const mvp = document.getElementById('topKiller');
  if (camera.leadMarble) {
    mvp.innerText = `${camera.leadMarble.name}`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showWinnerBanner(winner) {
  const overlay = document.getElementById('winnerOverlay');
  const flagImg = document.getElementById('winnerFlag');
  const nameElem = document.getElementById('winnerName');
  const statsElem = document.getElementById('winnerStats');

  flagImg.src = getFlagUrl(winner.code);
  nameElem.innerText = winner.name;
  let stats = `🏆 OUTPACED 197 NATIONS & WON 1ST PLACE!`;
  if (currentGameMode === 'circle_survivor') stats = `🏆 OUTLASTED ${marbles.length} NATIONS & BECAME LAST SURVIVOR!`;
  if (currentGameMode === 'concentric_rings') stats = `🏆 FIRST NATION TO PENETRATE ALL 4 RINGS & REACH THE CORE!`;
  statsElem.innerText = stats;
  overlay.classList.add('active');
}

// Render Circle Survivor Spinning Arena
function drawCircleSurvivorArena(ctx) {
  ctx.save();

  // Dark glowing battle arena floor circle
  const floorGrad = ctx.createRadialGradient(ARENA_CX, ARENA_CY, 20, ARENA_CX, ARENA_CY, ARENA_RADIUS);
  floorGrad.addColorStop(0, '#0f172a');
  floorGrad.addColorStop(0.7, '#090d16');
  floorGrad.addColorStop(1, '#020617');
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.arc(ARENA_CX, ARENA_CY, ARENA_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Arena floor grid rings & radial lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 2;
  [120, 240, 360].forEach(r => {
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Danger boundary halo outside ring
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(ARENA_CX, ARENA_CY, ARENA_RADIUS + 30, 0, Math.PI * 2);
  ctx.stroke();

  // Rotating Segmented Outer Wall Arcs (4 segments with escape gaps)
  const sectorSize = (Math.PI * 2) / ARENA_NUM_GAPS;
  for (let i = 0; i < ARENA_NUM_GAPS; i++) {
    const startArc = arenaAngle + i * sectorSize;
    const endArc = startArc + (sectorSize - ARENA_GAP_ARC);

    // Wall Arc
    ctx.save();
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, ARENA_RADIUS, startArc, endArc);
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#38bdf8';
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 24;
    ctx.stroke();

    // Secondary inner glow
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // Flashing Warning Chevron in the Gap
    const gapMidAngle = endArc + ARENA_GAP_ARC * 0.5;
    const gx = ARENA_CX + Math.cos(gapMidAngle) * (ARENA_RADIUS + 8);
    const gy = ARENA_CY + Math.sin(gapMidAngle) * (ARENA_RADIUS + 8);

    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(gapMidAngle + Math.PI / 2);
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#dc2626';
    ctx.shadowBlur = 12;
    ctx.font = 'bold 18px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼ GAP ▼', 0, 0);
    ctx.restore();
  }

  // 4 Orbit Pinball Bumpers
  survivorObstacles.orbitBumpers.forEach(ob => {
    const orbitAng = arenaAngle * 0.75 + ob.angleOffset;
    const ox = ARENA_CX + Math.cos(orbitAng) * ob.dist;
    const oy = ARENA_CY + Math.sin(orbitAng) * ob.dist;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ox, oy, ob.radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, ob.radius);
    grad.addColorStop(0, '#f472b6');
    grad.addColorStop(1, '#db2777');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#f472b6';
    ctx.shadowBlur = 22;
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', ox, oy);
    ctx.restore();
  });

  // Center Spinning Deflector Cross Blades
  ctx.save();
  const bladeLen = 150;
  for (let b = 0; b < 4; b++) {
    const bAngle = centerBladeAngle + (b * Math.PI * 2) / 4;
    ctx.beginPath();
    ctx.moveTo(ARENA_CX, ARENA_CY);
    ctx.lineTo(ARENA_CX + Math.cos(bAngle) * bladeLen, ARENA_CY + Math.sin(bAngle) * bladeLen);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#f59e0b';
    ctx.shadowColor = '#d97706';
    ctx.shadowBlur = 18;
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  ctx.restore();

  // Central Super Bumper
  ctx.save();
  ctx.beginPath();
  ctx.arc(ARENA_CX, ARENA_CY, 55, 0, Math.PI * 2);
  const cGrad = ctx.createRadialGradient(ARENA_CX, ARENA_CY, 4, ARENA_CX, ARENA_CY, 55);
  cGrad.addColorStop(0, '#fbbf24');
  cGrad.addColorStop(1, '#ea580c');
  ctx.fillStyle = cGrad;
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 28;
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 24px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💥', ARENA_CX, ARENA_CY);
  ctx.restore();

  ctx.restore();
}

// Render Concentric Rings Multi-Layer Maze
function drawConcentricRingsMaze(ctx) {
  ctx.save();

  // Dark deep-space arena floor
  const floorGrad = ctx.createRadialGradient(ARENA_CX, ARENA_CY, 20, ARENA_CX, ARENA_CY, 475);
  floorGrad.addColorStop(0, '#0c1222');
  floorGrad.addColorStop(0.7, '#070a14');
  floorGrad.addColorStop(1, '#02040a');
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.arc(ARENA_CX, ARENA_CY, 470, 0, Math.PI * 2);
  ctx.fill();

  // Arena radar grid rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 2;
  [80, 180, 290, 400].forEach(r => {
    ctx.beginPath();
    ctx.arc(ARENA_CX, ARENA_CY, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Cross hair lines
  ctx.beginPath();
  ctx.moveTo(ARENA_CX - 460, ARENA_CY);
  ctx.lineTo(ARENA_CX + 460, ARENA_CY);
  ctx.moveTo(ARENA_CX, ARENA_CY - 460);
  ctx.lineTo(ARENA_CX, ARENA_CY + 460);
  ctx.stroke();

  // Outer rim boundary (contains outer channel)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(ARENA_CX, ARENA_CY, 470, 0, Math.PI * 2);
  ctx.stroke();

  // Concentric Spinning Ring Barriers
  CONCENTRIC_RINGS.forEach(ring => {
    const sector = (Math.PI * 2) / ring.numGaps;

    for (let g = 0; g < ring.numGaps; g++) {
      const startArc = ring.angle + g * sector;
      const endArc = startArc + (sector - ring.gapArc);

      // Glowing Neon Ring Segment
      ctx.save();
      ctx.beginPath();
      ctx.arc(ARENA_CX, ARENA_CY, ring.radius, startArc, endArc);
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.strokeStyle = ring.color;
      ctx.shadowColor = ring.glow;
      ctx.shadowBlur = 22;
      ctx.stroke();

      // Inner Bright Line
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();

      // Gate Indicator in the gap
      const gapMid = endArc + ring.gapArc * 0.5;
      const gx = ARENA_CX + Math.cos(gapMid) * ring.radius;
      const gy = ARENA_CY + Math.sin(gapMid) * ring.radius;

      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(gapMid + Math.PI / 2);
      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#059669';
      ctx.shadowBlur = 10;
      ctx.font = 'bold 15px Montserrat, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▼ DOOR ▼', 0, 0);
      ctx.restore();
    }
  });

  // Center Trophy Core (The Golden Goal!)
  ctx.save();
  ctx.beginPath();
  ctx.arc(ARENA_CX, ARENA_CY, CORE_RADIUS, 0, Math.PI * 2);
  const coreGrad = ctx.createRadialGradient(ARENA_CX, ARENA_CY, 4, ARENA_CX, ARENA_CY, CORE_RADIUS);
  coreGrad.addColorStop(0, '#fde047');
  coreGrad.addColorStop(0.6, '#f59e0b');
  coreGrad.addColorStop(1, '#ea580c');
  ctx.fillStyle = coreGrad;
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 35;
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Floating Trophy icon in Core
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏆', ARENA_CX, ARENA_CY);
  ctx.restore();

  ctx.restore();
}

// Render Track & Environment
function drawTrackEnvironment(ctx) {
  if (currentGameMode === 'concentric_rings') {
    drawConcentricRingsMaze(ctx);
    return;
  }
  if (currentGameMode === 'circle_survivor') {
    drawCircleSurvivorArena(ctx);
    return;
  }

  const L = 70;
  const R = V_WIDTH - 70;

  // Track Boundary Rails
  ctx.save();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#38bdf8';
  ctx.shadowColor = '#0284c7';
  ctx.shadowBlur = 18;

  ctx.beginPath();
  ctx.moveTo(L, 40);
  ctx.lineTo(L, TRACK_HEIGHT - 40);
  ctx.moveTo(R, 40);
  ctx.lineTo(R, TRACK_HEIGHT - 40);
  ctx.stroke();
  ctx.restore();

  // Start Gate
  ctx.save();
  if (!gateOpen) {
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ef4444';
    ctx.shadowColor = '#dc2626';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(L, 360);
    ctx.lineTo(R, 360);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = '900 28px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔒 START GATE LOCKED', V_WIDTH / 2, 345);
  }
  ctx.restore();

  // Draw Walls & Ramps
  ctx.save();
  walls.forEach(w => {
    ctx.lineWidth = w.thickness;
    ctx.strokeStyle = '#818cf8';
    ctx.shadowColor = '#6366f1';
    ctx.shadowBlur = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();
  });
  ctx.restore();

  // Draw Pegs (Plinko)
  ctx.save();
  pegs.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  ctx.restore();

  // Draw Bumpers
  ctx.save();
  bumpers.forEach(bm => {
    ctx.beginPath();
    ctx.arc(bm.x, bm.y, bm.radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(bm.x, bm.y, 4, bm.x, bm.y, bm.radius);
    grad.addColorStop(0, '#f472b6');
    grad.addColorStop(1, '#db2777');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#f472b6';
    ctx.shadowBlur = 20;
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', bm.x, bm.y);
  });
  ctx.restore();

  // Draw Upward Spring Bumpers
  ctx.save();
  springBumpers.forEach(sb => {
    ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#0891b2';
    ctx.shadowBlur = 14;
    ctx.strokeRect(sb.x, sb.y, sb.w, sb.h);

    ctx.fillStyle = '#67e8f9';
    ctx.font = 'bold 13px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲ REBOUND ▲', sb.x + sb.w / 2, sb.y + sb.h / 2);
  });
  ctx.restore();

  // Draw Moving Sweeper Hammers
  ctx.save();
  movingHammers.forEach(h => {
    // Guide Rail Line
    ctx.beginPath();
    ctx.moveTo(h.minX, h.y + h.h / 2);
    ctx.lineTo(h.maxX + h.w, h.y + h.h / 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Hammer Piston Block
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#d97706';
    ctx.shadowBlur = 12;
    ctx.strokeRect(h.x, h.y, h.w, h.h);

    // Hazard text on hammer face
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 13px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ DEFLECTOR ⚡', h.x + h.w / 2, h.y + h.h / 2);
  });
  ctx.restore();

  // Draw Spinners
  ctx.save();
  spinners.forEach(sp => {
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#06b6d4';
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 14;

    for (let b = 0; b < sp.blades; b++) {
      const a = sp.angle + (b * Math.PI * 2) / sp.blades;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x + Math.cos(a) * sp.length, sp.y + Math.sin(a) * sp.length);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  ctx.restore();

  // Draw Checkered Finish Line
  ctx.save();
  const checkSize = 30;
  for (let x = L; x < R; x += checkSize) {
    const isBlack = Math.floor((x - L) / checkSize) % 2 === 0;
    ctx.fillStyle = isBlack ? '#ffffff' : '#000000';
    ctx.fillRect(x, finishLineY, checkSize, 25);
  }
  ctx.font = '900 32px Montserrat, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'center';
  ctx.fillText('🏁 FINISH LINE 🏁', V_WIDTH / 2, finishLineY - 18);
  ctx.restore();
}

// Render Loop
let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (isRunning && !isPaused) {
    handlePhysics();
    marbles.forEach(m => m.update());
    updateCamera();
  }

  // Draw Background
  ctx.save();
  ctx.fillStyle = '#060913';
  ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

  // Apply Camera Translation
  ctx.save();
  ctx.translate(0, -camera.y);

  // Background subtle track line patterns
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 2;
  for (let y = 0; y < TRACK_HEIGHT; y += 120) {
    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(V_WIDTH - 70, y);
    ctx.stroke();
  }

  // Track elements
  drawTrackEnvironment(ctx);

  // Marbles
  marbles.forEach(m => m.draw(ctx));

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw(ctx);
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  ctx.restore(); // End Camera translation

  // YouTube Shorts Header & HUD
  drawShortsHUD();

  // Draw 1st Place Podium Celebration directly onto canvas (recorded into video!)
  drawCanvasWinnerOverlay();

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// 9:16 HUD Overlay
function drawShortsHUD() {
  ctx.save();

  // Top Header Banner
  ctx.fillStyle = 'rgba(11, 15, 25, 0.88)';
  ctx.fillRect(0, 0, V_WIDTH, 140);

  const grad = ctx.createLinearGradient(0, 140, V_WIDTH, 140);
  grad.addColorStop(0, '#f59e0b');
  grad.addColorStop(0.5, '#ef4444');
  grad.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 138, V_WIDTH, 4);

  ctx.font = '900 42px Montserrat, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 15;
  let regionTitle = "COUNTRY MARBLE RACE";
  if (currentGameMode === 'circle_survivor') {
    regionTitle = (selectedContinent === 'All' ? "CIRCLE SURVIVOR: BATTLE ROYALE" : `${selectedContinent.toUpperCase()} CIRCLE SURVIVOR`);
  } else if (currentGameMode === 'concentric_rings') {
    regionTitle = (selectedContinent === 'All' ? "CONCENTRIC RING MAZE" : `${selectedContinent.toUpperCase()} RING MAZE`);
  } else {
    regionTitle = (selectedContinent === 'All' ? "COUNTRY MARBLE RACE" : `${selectedContinent.toUpperCase()} MARBLE RACE`);
  }
  ctx.fillText(regionTitle, V_WIDTH / 2, 65);

  ctx.font = '700 20px Inter, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.shadowBlur = 0;
  const aliveCount = marbles.filter(m => !m.finished).length;
  let countLabel = `${marbles.length} NATIONS`;
  if (currentGameMode === 'circle_survivor') {
    countLabel = `${aliveCount} SURVIVORS REMAINING`;
  } else if (currentGameMode === 'concentric_rings') {
    countLabel = `1ST TO REACH THE CORE WINS`;
  } else {
    countLabel = (selectedContinent === 'All') ? "197 NATIONS" : `${marbles.length} NATIONS`;
  }
  const diffBadge = (currentDifficulty === 'Easy') ? "🟢 EASY" : ((currentDifficulty === 'Hard') ? "🔴 HARD" : "🟡 NORMAL");
  ctx.fillText(`${countLabel} • ${diffBadge}`, V_WIDTH / 2, 105);

  // Leader Indicator at the top
  if (camera.leadMarble) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(V_WIDTH / 2 - 220, 155, 440, 48, 24);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '800 20px Inter, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    let leaderLabel = `🔥 CURRENT LEADER: ${camera.leadMarble.name}`;
    if (currentGameMode === 'circle_survivor') leaderLabel = `🛡️ LAST STAND: ${camera.leadMarble.name}`;
    if (currentGameMode === 'concentric_rings') leaderLabel = `🎯 CLOSEST TO CORE: ${camera.leadMarble.name}`;
    ctx.fillText(leaderLabel, V_WIDTH / 2, 186);
  }

  ctx.restore();
}

// 1st Place Champion Canvas Showcase (Recorded Directly Into The Video!)
function drawCanvasWinnerOverlay() {
  if (!winnerMarble) {
    winnerBannerAnim = 0;
    return;
  }

  winnerBannerAnim = Math.min(1, winnerBannerAnim + 0.05);
  const alpha = winnerBannerAnim;

  ctx.save();

  // Dark dramatic vignette backdrop
  ctx.fillStyle = `rgba(5, 8, 18, ${alpha * 0.88})`;
  ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

  const centerY = V_HEIGHT * 0.48;

  // Podium Card Container
  ctx.save();
  ctx.translate(V_WIDTH / 2, centerY);
  ctx.scale(alpha, alpha);

  // Card background with glowing golden neon border
  const cardW = 860;
  const cardH = 960;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 8;
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 40);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Animated Floating Golden Crown
  const floatOffset = Math.sin(Date.now() * 0.006) * 12;
  ctx.font = '95px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('👑', V_WIDTH / 2, centerY - 330 + floatOffset);

  // 1ST PLACE WINNER Header
  ctx.font = '900 52px Montserrat, sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 25;
  ctx.textAlign = 'center';
  let championTitle = '🏆 1ST PLACE CHAMPION! 🏆';
  if (currentGameMode === 'circle_survivor') championTitle = '🏆 LAST SURVIVOR CHAMPION! 🏆';
  if (currentGameMode === 'concentric_rings') championTitle = '🏆 RING MAZE CHAMPION! 🏆';
  ctx.fillText(championTitle, V_WIDTH / 2, centerY - 230);

  // Giant Flag Texture (280x280 circular flag medal)
  const flagRadius = 145;
  const flagY = centerY - 50;

  // Outer gold ring
  ctx.beginPath();
  ctx.arc(V_WIDTH / 2, flagY, flagRadius + 10, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 30;
  ctx.fill();

  // Flag circle clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(V_WIDTH / 2, flagY, flagRadius, 0, Math.PI * 2);
  ctx.clip();

  const img = flagImages[winnerMarble.code];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, V_WIDTH / 2 - flagRadius, flagY - flagRadius, flagRadius * 2, flagRadius * 2);
  } else {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(V_WIDTH / 2 - flagRadius, flagY - flagRadius, flagRadius * 2, flagRadius * 2);
    ctx.font = '900 50px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(winnerMarble.code.toUpperCase(), V_WIDTH / 2, flagY + 16);
  }
  ctx.restore();

  // Winner Country Name in huge text
  ctx.font = '900 66px Montserrat, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 12;
  ctx.textAlign = 'center';
  ctx.fillText(winnerMarble.name.toUpperCase(), V_WIDTH / 2, centerY + 200);

  // Subtitle / Achievement
  ctx.font = '800 28px Inter, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.shadowBlur = 0;
  let winSubtitle = `🥇 OUTPACED 197 NATIONS & WON GOLD!`;
  if (currentGameMode === 'circle_survivor') winSubtitle = `🥇 OUTLASTED ${marbles.length} NATIONS IN THE RING!`;
  if (currentGameMode === 'concentric_rings') winSubtitle = `🥇 FIRST TO PENETRATE ALL 4 RINGS & REACH THE CORE!`;
  ctx.fillText(winSubtitle, V_WIDTH / 2, centerY + 260);

  // YouTube Shorts Engagement Callout
  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`💬 Comment "${winnerMarble.name}" if you guessed right!`, V_WIDTH / 2, centerY + 320);

  ctx.restore();
}

// Game Mode Selection Buttons (Downhill Race vs Circle Survivor vs Concentric Rings)
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const targetMode = btn.getAttribute('data-mode');
    if (targetMode !== currentGameMode) {
      currentGameMode = targetMode;
      if (isRecording) {
        stopRecording();
      }
      isRunning = false;
      isPaused = false;
      const startBtn = document.getElementById('startBtn');
      if (startBtn) {
        if (currentGameMode === 'concentric_rings') {
          startBtn.innerText = '▶️ Start Ring Maze & Auto-Record';
        } else if (currentGameMode === 'circle_survivor') {
          startBtn.innerText = '▶️ Drop Into Ring & Auto-Record';
        } else {
          startBtn.innerText = '▶️ Drop Start Gate & Auto-Record';
        }
      }
      initRace();
    }
  });
});

// Continent Selection Filter Buttons
document.querySelectorAll('.continent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.continent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedContinent = btn.getAttribute('data-continent');
    initRace();
  });
});

// Difficulty Selection Buttons (Easy / Normal / Hard)
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDifficulty = btn.getAttribute('data-diff');
    initRace();
  });
});

// Controls - 1-Click Drop Gate & Auto-Record
document.getElementById('startBtn').addEventListener('click', () => {
  sfx.init();
  if (!isRunning) {
    isRunning = true;
    isPaused = false;
    gateOpen = true; // Drop start gate!
    document.getElementById('startBtn').innerText = currentGameMode === 'concentric_rings' 
      ? '🔄 Restart Maze & Record' 
      : (currentGameMode === 'circle_survivor' ? '🔄 Restart Battle & Record' : '🔄 Restart Race & Record');
    document.getElementById('pauseBtn').disabled = false;

    // 1-Click Auto-Record
    if (!isRecording) {
      startRecording();
    }
  } else {
    if (isRecording) {
      stopRecording();
    }
    initRace();
    gateOpen = true;
    isRunning = true;
    isPaused = false;
    setTimeout(() => {
      if (!isRecording) startRecording();
    }, 250);
  }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
  isPaused = !isPaused;
  document.getElementById('pauseBtn').innerText = isPaused ? '▶️ Resume' : '⏸️ Pause';
});

document.getElementById('soundBtn').addEventListener('click', () => {
  const on = sfx.toggle();
  document.getElementById('soundBtn').innerText = on ? '🔊 Audio ON' : '🔇 Audio OFF';
});

document.getElementById('restartModalBtn').addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  }
  initRace();
  gateOpen = true;
  isRunning = true;
  setTimeout(() => {
    if (!isRecording) startRecording();
  }, 250);
});

// ==========================================
// 9:16 Shorts Video Recorder Deck
// ==========================================
const recordBtn = document.getElementById('recordBtn');
const recDot = document.getElementById('recDot');
const recStatusText = document.getElementById('recStatusText');
const recTimer = document.getElementById('recTimer');
let recordedChunks = [];
let recTimerInterval = null;
let recSeconds = 0;

function updateRecTimerUI() {
  const mins = String(Math.floor(recSeconds / 60)).padStart(2, '0');
  const secs = String(recSeconds % 60).padStart(2, '0');
  if (recTimer) recTimer.innerText = `${mins}:${secs}`;
}

recordBtn.addEventListener('click', () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

let currentVideoBlob = null;
let currentVideoUrl = null;
let currentVideoFilename = '';

function getSupportedMimeType() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // iOS Safari strictly requires video/mp4 (H.264)
  if (isIOS) {
    const iosTypes = ['video/mp4;codecs=avc1', 'video/mp4', 'video/quicktime'];
    for (const t of iosTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
    }
  }

  const preferredTypes = [
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];

  for (const t of preferredTypes) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function startRecording() {
  try {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 800;
    const fps = isMobile ? 30 : 60; // 30fps ensures mobile GPU encoder doesn't drop frames or fail
    const canvasStream = canvas.captureStream ? canvas.captureStream(fps) : null;
    recordedChunks = [];

    // Capture sound from Web Audio synthesizer!
    sfx.init();
    const audioStream = sfx.getMediaStream();

    // Composite stream containing both 1080x1920 video and synchronized audio!
    const combinedStream = new MediaStream();
    if (canvasStream) {
      canvasStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
    }
    if (audioStream) {
      audioStream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
    }

    const chosenMime = getSupportedMimeType();
    const options = chosenMime ? { mimeType: chosenMime } : {};
    mediaRecorder = new MediaRecorder(combinedStream, options);
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      clearInterval(recTimerInterval);
      if (recDot) recDot.classList.remove('active');
      if (recStatusText) recStatusText.innerText = 'STANDBY • 1080x1920 MP4 60FPS';
      recordBtn.classList.remove('recording');
      recordBtn.innerText = '⏺️ Start Recording Short';

      // Determine container and extension
      const isMp4 = chosenMime.includes('mp4') || chosenMime.includes('quicktime');
      const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
      const ext = isMp4 ? 'mp4' : 'webm';

      currentVideoBlob = new Blob(recordedChunks, { type: mimeType });
      if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = URL.createObjectURL(currentVideoBlob);
      currentVideoFilename = `Country_Marble_Race_${selectedContinent}_${Date.now()}.${ext}`;

      // Update in-page video player with unmuted audio
      const player = document.getElementById('videoPreviewPlayer');
      if (player) {
        player.src = currentVideoUrl;
        player.muted = false;
        player.volume = 1.0;
        player.load();
        player.play().catch(() => {});
      }

      // Show Video Modal
      const modal = document.getElementById('videoModal');
      if (modal) modal.classList.add('active');

      // Trigger mobile share sheet if on mobile (Native iOS "Save Video" to Camera Roll)
      if (isMobile && navigator.canShare) {
        const file = new File([currentVideoBlob], currentVideoFilename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: 'Country Marble Race Short',
            text: '🏆 YouTube Shorts Marble Race'
          }).catch(() => {});
        }
      } else if (!isMobile) {
        // On Desktop, trigger direct download
        triggerDirectDownload();
      }
    };

    mediaRecorder.start(1000); // 1-second chunks ensure buffer flushes reliably on mobile
    isRecording = true;
    recSeconds = 0;
    updateRecTimerUI();
    recTimerInterval = setInterval(() => {
      recSeconds++;
      updateRecTimerUI();
    }, 1000);

    if (recDot) recDot.classList.add('active');
    if (recStatusText) recStatusText.innerText = 'RECORDING 60FPS HD';
    recordBtn.classList.add('recording');
    recordBtn.innerText = '⏹️ Stop & Save Video';
  } catch (err) {
    alert("Recording failed: " + err.message);
  }
}

function triggerDirectDownload() {
  if (!currentVideoUrl) return;
  const a = document.createElement('a');
  a.href = currentVideoUrl;
  a.download = currentVideoFilename || `Country_Marble_Race_${Date.now()}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

document.getElementById('directDownloadBtn')?.addEventListener('click', () => {
  triggerDirectDownload();
});

document.getElementById('shareVideoBtn')?.addEventListener('click', () => {
  if (!currentVideoBlob) return;
  const mimeType = currentVideoBlob.type || 'video/mp4';
  const file = new File([currentVideoBlob], currentVideoFilename, { type: mimeType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({
      files: [file],
      title: 'Country Marble Race Short',
      text: '🏆 YouTube Shorts Marble Race'
    }).catch(() => {
      triggerDirectDownload();
    });
  } else {
    triggerDirectDownload();
  }
});

document.getElementById('closeVideoModalBtn')?.addEventListener('click', () => {
  const modal = document.getElementById('videoModal');
  if (modal) modal.classList.remove('active');
  const player = document.getElementById('videoPreviewPlayer');
  if (player) player.pause();
});

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    isRecording = false;
  }
}

// ==========================================
// AI YouTube Shorts Title & Description Generator
// ==========================================
let currentWinner = null;

const VIRAL_TITLE_TEMPLATES = [
  (ctx) => ctx.mode === 'concentric_rings'
    ? `🌀 ${ctx.flagEmoji} ${ctx.count} Countries In The 4-Ring Maze: Who Penetrates The Golden Core?! 🏆 #shorts #ringmaze`
    : (ctx.mode === 'circle_survivor'
      ? `⭕ ${ctx.flagEmoji} ${ctx.count} Countries In The Spinning Death Circle... ONLY 1 SURVIVES! 🏆 #shorts #battleroyale`
      : `🔥 ${ctx.flagEmoji} ${ctx.count} Countries Downhill Marble Race: Who Takes 1st Place?! 🏆 #shorts #marblerace`),
  (ctx) => ctx.mode === 'concentric_rings'
    ? `😱 ${ctx.winnerHighlight} Found The Secret Gate In The ${ctx.regionName} Ring Maze! 🌀 #flagsbattle`
    : (ctx.mode === 'circle_survivor'
      ? `😱 ${ctx.winnerHighlight} In The ${ctx.regionName} Circle Survivor Ring! 🌪️ #flagsbattle`
      : `😱 ${ctx.winnerHighlight} in the ${ctx.regionName} Flag Battle! 🏁 #flagsbattle`),
  (ctx) => ctx.mode === 'concentric_rings'
    ? `⚡ Extreme ${ctx.diff} Ring Maze: ${ctx.count} Nations Bouncing Through Counter-Rotating Doors! 🚀 #shorts`
    : (ctx.mode === 'circle_survivor'
      ? `⚡ Extreme ${ctx.diff} Battle Royale: ${ctx.count} Nations Bouncing To The Death! 💥 #shorts`
      : `⚡ Extreme ${ctx.diff} Downhill Flag Race: ${ctx.count} Nations Battle to the Finish! 🚀 #shorts`),
  (ctx) => ctx.mode === 'concentric_rings'
    ? `🥇 ${ctx.winnerName} REACHES THE GOLDEN TROPHY CORE! (${ctx.regionName} Edition) 🏆 #marblerace`
    : (ctx.mode === 'circle_survivor'
      ? `🥇 ${ctx.winnerName} BECOMES LAST SURVIVOR! (${ctx.regionName} Ring Battle) 🏆 #marblerace`
      : `🥇 ${ctx.winnerName} TAKES GOLD in Epic Downhill Battle! (${ctx.regionName} Edition) 🏆 #marblerace`),
  (ctx) => `🇮🇩 vs 🇺🇸 vs 🇧🇷: ${ctx.regionName} Flags Chaos Elimination! Who Survived? 💥 #shorts`,
  (ctx) => ctx.mode === 'concentric_rings'
    ? `🌀 CAN YOUR COUNTRY NAVIGATE 4 ROTATING MAZE RINGS?! 🌍 #ringmaze #shorts`
    : (ctx.mode === 'circle_survivor'
      ? `🌪️ CAN YOUR COUNTRY SURVIVE THE SPINNING VOID RING?! 🌍 #survivor #shorts`
      : `🏎️ CAN YOUR COUNTRY WIN THIS CRAZY OBSTACLE COURSE?! 🌍 #flagrace #shorts`),
  (ctx) => ctx.mode === 'concentric_rings'
    ? `🏆 The Most Hypnotic Concentric Ring Marble Maze You've Ever Seen! (${ctx.regionName}) 🌟 #shorts`
    : (ctx.mode === 'circle_survivor'
      ? `🏆 The Most Brutal Circle Survivor Marble Battle You've Ever Seen! (${ctx.regionName}) 🌟 #shorts`
      : `🏆 The Craziest Downhill Marble Race You've Ever Seen! (${ctx.regionName}) 🌟 #shorts`),
  (ctx) => `🤯 Nobody Expected ${ctx.winnerName} To Win The ${ctx.regionName} Marble Battle! 🏁 #shorts`
];

function getFlagEmoji(code) {
  if (!code || code.length !== 2) return '🏁';
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

function generateShortsTitles(winner = null) {
  const targetCountries = (selectedContinent === "All")
    ? COUNTRIES_DATA
    : COUNTRIES_DATA.filter(c => c.continent.toLowerCase() === selectedContinent.toLowerCase());

  const count = targetCountries.length;
  const regionName = selectedContinent === "All" ? "World" : selectedContinent;
  const winnerName = winner ? winner.name : (targetCountries[Math.floor(Math.random() * targetCountries.length)]?.name || "Your Country");
  const flagEmoji = winner ? getFlagEmoji(winner.code) : "🌍";
  const winnerHighlight = winner ? `${winner.name.toUpperCase()} SHOCKED EVERYONE` : `YOU WON'T BELIEVE WHO WON`;

  const context = {
    mode: currentGameMode,
    isCircle: currentGameMode === 'circle_survivor',
    regionName,
    winnerName,
    flagEmoji,
    winnerHighlight,
    count,
    diff: currentDifficulty
  };

  const shuffled = [...VIRAL_TITLE_TEMPLATES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4).map(fn => fn(context));
}

let currentGeneratedTitles = [];

function updateVideoTitles(winner = null) {
  currentWinner = winner;
  currentGeneratedTitles = generateShortsTitles(winner);
  const container = document.getElementById('titleList');
  if (!container) return;

  container.innerHTML = currentGeneratedTitles.map((title, idx) => `
    <div class="title-item" data-idx="${idx}">
      <div class="title-text">${escapeHtml(title)}</div>
      <button class="copy-btn" data-idx="${idx}">📋 Copy</button>
    </div>
  `).join('');

  // Attach touch and click listeners cleanly (prevents inline string quote errors on mobile)
  container.querySelectorAll('.title-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.getAttribute('data-idx'), 10);
      const titleToCopy = currentGeneratedTitles[idx];
      const btn = item.querySelector('.copy-btn');
      if (titleToCopy) {
        copyToClipboardUniversal(titleToCopy).then(() => {
          triggerCopySuccessUI(btn);
        });
      }
    });
  });

  // Update Description & Tags
  const region = selectedContinent === "All" ? "All World (197 Nations)" : `${selectedContinent} (${currentGeneratedTitles.length > 0 ? currentGeneratedTitles[0].match(/(\d+)\s+Countries|\s+(\d+)\s+Nations/)?.[1] || 49 : 49} Flags)`;
  let winText = `Who will reach the finish line?`;
  let modeTitle = "Downhill Marble Race Simulator";

  if (currentGameMode === 'circle_survivor') {
    modeTitle = "Circle Survivor Battle Royale Simulator";
    winText = winner ? `🥇 Last Survivor Champion: ${winner.name} ${getFlagEmoji(winner.code)}` : `Who will survive the spinning ring hazards?`;
  } else if (currentGameMode === 'concentric_rings') {
    modeTitle = "Concentric Rotating Rings Maze Simulator";
    winText = winner ? `🥇 Golden Core Champion: ${winner.name} ${getFlagEmoji(winner.code)}` : `Who will penetrate all 4 spinning barrier doors and claim the Golden Core?`;
  } else {
    modeTitle = "Downhill Marble Race Simulator";
    winText = winner ? `🥇 1st Place Winner: ${winner.name} ${getFlagEmoji(winner.code)}` : `Who will survive the 8 brutal obstacle stages?`;
  }

  const desc = `🏆 ${region} ${modeTitle}!
${winText}
Difficulty: ${currentDifficulty} Preset

Comment your country flag below! 👇

#shorts #marblerace #flagsbattle #ringmaze #circlesurvivor #battleroyale #geography #countryballs #worldflags #gaming #viral`;

  const tagsBox = document.getElementById('videoTagsBox');
  if (tagsBox) tagsBox.value = desc;
}

// Universal Clipboard Copy (iOS Safari, Android, Chrome, HTTP & HTTPS)
function copyToClipboardUniversal(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  return new Promise((resolve) => {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    el.style.fontSize = '16px'; // Prevents iOS zooming on focus
    document.body.appendChild(el);

    const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      el.setSelectionRange(0, 999999);
    } else {
      el.select();
    }

    try {
      document.execCommand('copy');
    } catch (err) {
      console.warn('execCommand copy fallback error:', err);
    }
    document.body.removeChild(el);
    resolve();
  });
}

function triggerCopySuccessUI(btn) {
  if (!btn) return;
  const orig = btn.innerText;
  btn.innerText = '✅ Copied!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.innerText = orig;
    btn.classList.remove('copied');
  }, 1800);
}

document.getElementById('refreshTitlesBtn')?.addEventListener('click', () => {
  updateVideoTitles(currentWinner);
});

document.getElementById('copyTagsBtn')?.addEventListener('click', (e) => {
  const box = document.getElementById('videoTagsBox');
  if (!box) return;
  copyToClipboardUniversal(box.value).then(() => {
    triggerCopySuccessUI(e.target);
  });
});

// Preload & Start
const loader = document.getElementById('loader');
const loadProgress = document.getElementById('loadProgress');

preloadFlags(
  (loaded, total) => {
    loadProgress.style.width = `${(loaded / total) * 100}%`;
  },
  () => {
    loader.classList.add('loaded');
    initRace();
    requestAnimationFrame(gameLoop);
  }
);
