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

// Dynamic Camera
const camera = {
  y: 0,
  targetY: 0,
  leadMarble: null
};

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
      // Gentle slide in podium area
      this.vx *= 0.92;
      this.vy *= 0.92;
      this.x += this.vx;
      this.y += this.vy;
      return;
    }

    if (this.bouncePulse > 0) this.bouncePulse -= 0.05;

    // Apply gravity
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
        sfx.playVictory();
        showWinnerBanner(this);
        if (typeof updateVideoTitles === 'function') updateVideoTitles(this);

        const autoStop = document.getElementById('autoStopRec');
        if (autoStop && autoStop.checked && isRecording) {
          setTimeout(() => {
            if (isRecording) stopRecording();
          }, 4200); // Capture winner celebration footage
        }
      }
      updateLeaderboardUI();
    }
  }

  draw(ctx) {
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

// Initialize Marbles at the Top Launch Box
function initRace() {
  marbles = [];
  finishedMarbles = [];
  particles = [];
  raceLog = [];
  renderFeedUI();
  gateOpen = false;
  document.getElementById('winnerOverlay').classList.remove('active');

  buildTrack();

  // Filter countries by selected region/continent
  const targetCountries = (selectedContinent === "All")
    ? [...COUNTRIES_DATA]
    : COUNTRIES_DATA.filter(c => c.continent.toLowerCase() === selectedContinent.toLowerCase());

  const total = targetCountries.length;
  const cols = total > 60 ? 15 : (total > 30 ? 10 : (total > 15 ? 7 : 5));
  const spacingX = Math.min(56, (V_WIDTH - 280) / cols);
  const spacingY = 46;
  const startX = V_WIDTH / 2 - ((cols - 1) * spacingX) / 2;
  const startY = 80;

  // Shuffle order for fair start positions
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
  updateLeaderboardUI();
  if (typeof updateVideoTitles === 'function') updateVideoTitles(null);
}

// Physics & Collision Handling
function handlePhysics() {
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
  statsElem.innerText = `🏆 OUTPACED 197 NATIONS & WON 1ST PLACE!`;
  overlay.classList.add('active');
}

// Render Track & Environment
function drawTrackEnvironment(ctx) {
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
  const regionTitle = (selectedContinent === 'All') ? "COUNTRY MARBLE RACE" : `${selectedContinent.toUpperCase()} MARBLE RACE`;
  ctx.fillText(regionTitle, V_WIDTH / 2, 65);

  ctx.font = '700 20px Inter, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.shadowBlur = 0;
  const countLabel = (selectedContinent === 'All') ? "197 NATIONS" : `${marbles.length} NATIONS`;
  const diffBadge = (currentDifficulty === 'Easy') ? "🟢 EASY" : ((currentDifficulty === 'Hard') ? "🔴 HARD" : "🟡 NORMAL");
  ctx.fillText(`${countLabel} • ${diffBadge} • WHO WINS?`, V_WIDTH / 2, 105);

  // Leader Indicator at the top right
  if (camera.leadMarble) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(V_WIDTH / 2 - 200, 155, 400, 48, 24);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '800 20px Inter, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText(`🔥 CURRENT LEADER: ${camera.leadMarble.name}`, V_WIDTH / 2, 186);
  }

  ctx.restore();
}

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
    document.getElementById('startBtn').innerText = '🔄 Restart Race & Record';
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
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
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

function startRecording() {
  try {
    const stream = canvas.captureStream(60);
    recordedChunks = [];

    // Prioritize MP4 formats (H.264 / AVC1) supported by Chromium & Safari
    const preferredTypes = [
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm'
    ];

    let chosenMime = '';
    for (const type of preferredTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        chosenMime = type;
        break;
      }
    }

    const options = chosenMime ? { mimeType: chosenMime } : {};
    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      clearInterval(recTimerInterval);
      if (recDot) recDot.classList.remove('active');
      if (recStatusText) recStatusText.innerText = 'STANDBY • 1080x1920 MP4 60FPS';
      recordBtn.classList.remove('recording');
      recordBtn.innerText = '⏺️ Start Recording Short (.MP4)';

      const blobType = chosenMime.includes('mp4') ? chosenMime : 'video/mp4';
      const blob = new Blob(recordedChunks, { type: blobType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Country_Marble_Race_${selectedContinent}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    isRecording = true;
    recSeconds = 0;
    updateRecTimerUI();
    recTimerInterval = setInterval(() => {
      recSeconds++;
      updateRecTimerUI();
    }, 1000);

    if (recDot) recDot.classList.add('active');
    if (recStatusText) recStatusText.innerText = 'RECORDING MP4 60FPS HD';
    recordBtn.classList.add('recording');
    recordBtn.innerText = '⏹️ Stop & Save .MP4';
  } catch (err) {
    alert("Recording failed: " + err.message);
  }
}

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
  (ctx) => `🔥 ${ctx.flagEmoji} ${ctx.count} Countries Downhill Marble Race: Who Takes 1st Place?! 🏆 #shorts #marblerace`,
  (ctx) => `😱 ${ctx.winnerHighlight} in the ${ctx.regionName} Flag Battle! 🏁 #flagsbattle`,
  (ctx) => `⚡ Extreme ${ctx.diff} Downhill Flag Race: ${ctx.count} Nations Battle to the Finish! 🚀 #shorts`,
  (ctx) => `🥇 ${ctx.winnerName} TAKES GOLD in Epic Downhill Battle! (${ctx.regionName} Edition) 🏆 #marblerace`,
  (ctx) => `🇮🇩 vs 🇺🇸 vs 🇧🇷: ${ctx.regionName} Flags Chaos Elimination! Who Survived? 💥 #shorts`,
  (ctx) => `🏎️ CAN YOUR COUNTRY WIN THIS CRAZY OBSTACLE COURSE?! 🌍 #flagrace #shorts`,
  (ctx) => `🏆 The Craziest Downhill Marble Race You've Ever Seen! (${ctx.regionName}) 🌟 #shorts`,
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

function updateVideoTitles(winner = null) {
  currentWinner = winner;
  const titles = generateShortsTitles(winner);
  const container = document.getElementById('titleList');
  if (!container) return;

  container.innerHTML = titles.map(title => `
    <div class="title-item" onclick="copyTitleText(this, '${escapeHtml(title).replace(/'/g, "\\'")}')">
      <div class="title-text">${escapeHtml(title)}</div>
      <button class="copy-btn" onclick="event.stopPropagation(); copyTitleText(this.parentElement, '${escapeHtml(title).replace(/'/g, "\\'")}')">📋 Copy</button>
    </div>
  `).join('');

  // Update Description & Tags
  const region = selectedContinent === "All" ? "All World (197 Nations)" : `${selectedContinent} (${titles.length > 0 ? titles[0].match(/(\d+)\s+Countries|\s+(\d+)\s+Nations/)?.[1] || 49 : 49} Flags)`;
  const winText = winner ? `🥇 1st Place Winner: ${winner.name} ${getFlagEmoji(winner.code)}` : `Who will survive the 8 brutal obstacle stages?`;
  const desc = `🏆 ${region} Downhill Marble Race Simulator!
${winText}
Difficulty: ${currentDifficulty} Preset

Comment your country flag below! 👇

#shorts #marblerace #flagsbattle #geography #countryballs #worldflags #gaming #viral`;

  const tagsBox = document.getElementById('videoTagsBox');
  if (tagsBox) tagsBox.value = desc;
}

window.copyTitleText = function(itemElem, text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = itemElem.querySelector('.copy-btn');
      if (btn) {
        btn.innerText = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = '📋 Copy';
          btn.classList.remove('copied');
        }, 1800);
      }
    }).catch(() => {
      prompt("Copy title:", text);
    });
  } else {
    prompt("Copy title:", text);
  }
};

document.getElementById('refreshTitlesBtn')?.addEventListener('click', () => {
  updateVideoTitles(currentWinner);
});

document.getElementById('copyTagsBtn')?.addEventListener('click', () => {
  const box = document.getElementById('videoTagsBox');
  if (!box) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(box.value).then(() => {
      const btn = document.getElementById('copyTagsBtn');
      btn.innerText = '✅ Copied!';
      setTimeout(() => {
        btn.innerText = '📋 Copy Description';
      }, 1800);
    });
  } else {
    prompt("Copy tags:", box.value);
  }
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
