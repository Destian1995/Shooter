// ── Level generation with reachability validation ──

class Target {
    constructor(x, y, radius, hp, color, score, type) {
        this.x = x; this.y = y;
        this.radius = radius;
        this.hp = this.maxHp = hp;
        this.color = color;
        this.score = score;
        this.type = type || 'normal'; // normal, armored, moving, blinking
        this.alive = true;
        this.pulse = 0;
        // for moving targets
        this.originX = x; this.originY = y;
        this.moveAngle = rand(0, TAU);
        this.moveSpeed = type === 'moving' ? rand(50, 120) : 0;
        this.moveRange = type === 'moving' ? rand(25, 60) : 0;
        this.movePattern = randInt(0, 2); // 0=circle, 1=horizontal, 2=vertical
        this.hitFlash = 0;
        this.spawnAnim = 1.0;
        // blinking
        this.blinkTimer = rand(0, TAU);
        this.blinkSpeed = type === 'blinking' ? rand(1.5, 3.0) : 0;
        this.visible = true; // for blinking targets
        this.blinkAlpha = 1;
    }

    hit(dmg) {
        this.hp -= dmg;
        this.hitFlash = 0.2;
        if (this.hp <= 0) {
            this.alive = false;
        }
    }

    // kill by shockwave (instant death)
    killByShockwave() {
        if (!this.alive) return;
        this.alive = false;
        this.hp = 0;
    }

    update(dt) {
        this.pulse += dt * 3;
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        this.spawnAnim = Math.max(0, this.spawnAnim - dt * 2);

        if (this.type === 'moving') {
            this.moveAngle += dt * this.moveSpeed * 0.02;
            if (this.movePattern === 0) {
                this.x = this.originX + Math.cos(this.moveAngle) * this.moveRange;
                this.y = this.originY + Math.sin(this.moveAngle * 0.7) * this.moveRange;
            } else if (this.movePattern === 1) {
                this.x = this.originX + Math.sin(this.moveAngle) * this.moveRange;
                this.y = this.originY;
            } else {
                this.x = this.originX;
                this.y = this.originY + Math.sin(this.moveAngle) * this.moveRange;
            }
        }

        // blinking logic
        if (this.type === 'blinking') {
            this.blinkTimer += dt * this.blinkSpeed;
            const sin = Math.sin(this.blinkTimer);
            this.visible = sin > -0.3; // visible ~75% of the time
            this.blinkAlpha = this.visible ? clamp(sin + 0.3, 0.2, 1) : 0;
        }
    }

    draw(ctx) {
        if (!this.alive) return;
        // blinking targets: skip draw when invisible
        if (this.type === 'blinking' && !this.visible) {
            // ghost outline when invisible
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 2, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            return;
        }

        const pulseR = this.radius + Math.sin(this.pulse) * 2;
        const sa = 1 - this.spawnAnim;
        const drawR = pulseR * sa;
        if (drawR < 1) return;

        const alpha = this.type === 'blinking' ? this.blinkAlpha : 1;

        // moving target trail
        if (this.type === 'moving') {
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.originX, this.originY, this.radius * 0.7, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = alpha;

        // outer glow ring
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, drawR + 5, 0, TAU);
        ctx.stroke();

        // second faint ring
        ctx.shadowBlur = 0;
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = alpha * 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, drawR + 10 + Math.sin(this.pulse * 2) * 3, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = alpha;

        // body gradient
        const grad = ctx.createRadialGradient(this.x - drawR * 0.3, this.y - drawR * 0.3, 0, this.x, this.y, drawR);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, this.hitFlash > 0 ? '#fff' : this.color);
        grad.addColorStop(1, this.hitFlash > 0 ? '#fff' : this.darkenColor(this.color, 0.4));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, drawR, 0, TAU);
        ctx.fill();

        // inner ring for armored
        if (this.type === 'armored') {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, drawR * 0.65, 0, TAU);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(this.x, this.y, drawR * 0.35, 0, TAU);
            ctx.stroke();
            // shield icon
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, drawR * 0.15, 0, TAU);
            ctx.fill();
        }

        // blinking visual effect — electric arcs
        if (this.type === 'blinking') {
            ctx.strokeStyle = 'rgba(255,255,100,0.5)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const a1 = this.pulse * 2 + i * TAU / 3;
                const a2 = a1 + 0.5;
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(a1) * drawR * 0.5, this.y + Math.sin(a1) * drawR * 0.5);
                ctx.lineTo(this.x + Math.cos(a2) * drawR, this.y + Math.sin(a2) * drawR);
                ctx.stroke();
            }
        }

        // explosive visual — pulsing danger ring + hazard lines
        if (this.type === 'explosive') {
            const dangerPulse = 0.4 + Math.sin(this.pulse * 3) * 0.2;
            ctx.strokeStyle = `rgba(255,80,20,${dangerPulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, drawR + 10, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            // inner hazard cross
            ctx.strokeStyle = 'rgba(255,200,50,0.6)';
            ctx.lineWidth = 2;
            const cr = drawR * 0.5;
            ctx.beginPath();
            ctx.moveTo(this.x - cr, this.y - cr);
            ctx.lineTo(this.x + cr, this.y + cr);
            ctx.moveTo(this.x + cr, this.y - cr);
            ctx.lineTo(this.x - cr, this.y + cr);
            ctx.stroke();
        }

        // moving arrows
        if (this.type === 'moving') {
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1.5;
            const arrowA = this.moveAngle;
            for (let i = 0; i < 2; i++) {
                const aa = arrowA + i * Math.PI;
                const ax = this.x + Math.cos(aa) * (drawR + 8);
                const ay = this.y + Math.sin(aa) * (drawR + 8);
                ctx.beginPath();
                ctx.moveTo(ax + Math.cos(aa) * 5, ay + Math.sin(aa) * 5);
                ctx.lineTo(ax - Math.cos(aa + 0.5) * 4, ay - Math.sin(aa + 0.5) * 4);
                ctx.moveTo(ax + Math.cos(aa) * 5, ay + Math.sin(aa) * 5);
                ctx.lineTo(ax - Math.cos(aa - 0.5) * 4, ay - Math.sin(aa - 0.5) * 4);
                ctx.stroke();
            }
        }

        // HP bar
        if (this.hp < this.maxHp && this.maxHp > 1) {
            const bw = this.radius * 2.2;
            const bh = 4;
            const bx = this.x - bw / 2;
            const by = this.y - this.radius - 12;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, bw, bh);
            ctx.fillStyle = this.color;
            ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
        }

        // score indicator
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.floor(this.radius * 0.65)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.score, this.x, this.y);

        // badges
        ctx.font = 'bold 9px Arial';
        if (this.type === 'moving') {
            ctx.fillStyle = '#ffcc00';
            ctx.fillText('x2', this.x, this.y - this.radius - 3);
        }
        if (this.type === 'blinking') {
            ctx.fillStyle = '#ffff44';
            ctx.fillText('⚡', this.x, this.y - this.radius - 3);
        }
        if (this.type === 'armored' && this.maxHp >= 2) {
            ctx.fillStyle = '#88ddff';
            ctx.fillText('+🔫', this.x + this.radius + 5, this.y - this.radius - 3);
        }
        if (this.type === 'explosive') {
            ctx.fillStyle = '#ff6622';
            ctx.fillText('💣', this.x, this.y - this.radius - 3);
        }

        ctx.globalAlpha = 1;
    }

    darkenColor(color, factor) {
        // simple darken for hsl strings
        if (color.startsWith('hsl')) {
            return color.replace(/(\d+)%\)/, (m, l) => `${Math.floor(parseInt(l) * factor)}%)`);
        }
        return color;
    }
}

const Level = {
    walls: [],
    targets: [],
    borderWalls: [],
    innerWalls: [],
    coins: [],   // collectible coins on the field
    levelNum: 1,
    playerStart: { x: 0, y: 0 },
    playArea: null,
    shockwaveQueue: [],

    generate(num, W, H) {
        this.levelNum = num;
        this.walls = [];
        this.borderWalls = [];
        this.innerWalls = [];
        this.targets = [];
        this.coins = [];
        this.shockwaveQueue = [];

        const margin = 60;
        this.playArea = { x: margin, y: margin + 80, w: W - margin * 2, h: H - margin * 2 - 80 };
        const pa = this.playArea;

        const wt = 12;
        this.borderWalls = [
            { x: 0, y: pa.y - wt, w: W, h: wt, color: '#334' },
            { x: 0, y: H - wt, w: W, h: wt, color: '#334' },
            { x: 0, y: pa.y, w: wt, h: H - pa.y, color: '#334' },
            { x: W - wt, y: pa.y, w: wt, h: H - pa.y, color: '#334' },
        ];

        this.playerStart = { x: W / 2, y: H - margin - 30 };

        // ── Inner walls ──
        const wallCount = Math.min(1 + Math.floor(num / 2), 6);
        const hueBase = (num * 47) % 360;

        for (let i = 0; i < wallCount; i++) {
            for (let a = 0; a < 60; a++) {
                const horizontal = Math.random() > 0.5;
                let w, h, x, y;
                if (horizontal) {
                    w = rand(50, 140); h = rand(10, 14);
                } else {
                    w = rand(10, 14); h = rand(50, 140);
                }
                x = rand(pa.x + 30, pa.x + pa.w - w - 30);
                y = rand(pa.y + 30, pa.y + pa.h - h - 100);

                if (dist(x + w / 2, y + h / 2, this.playerStart.x, this.playerStart.y) < 90) continue;

                let overlap = false;
                for (const ow of this.innerWalls) {
                    if (x < ow.x + ow.w + 30 && x + w + 30 > ow.x &&
                        y < ow.y + ow.h + 30 && y + h + 30 > ow.y) {
                        overlap = true; break;
                    }
                }
                if (overlap) continue;
                if (horizontal && w > pa.w * 0.4) continue;
                if (!horizontal && h > pa.h * 0.4) continue;

                const wallHue = (hueBase + i * 60) % 360;
                const wall = { x, y, w, h, color: hsl(wallHue, 60, 40), glow: hsl(wallHue, 80, 60) };
                this.innerWalls.push(wall);
                break;
            }
        }

        this.walls = [...this.borderWalls, ...this.innerWalls];

        // ── Targets ──
        const targetCount = Math.min(2 + Math.floor(num * 0.6), 7);
        const movingChance = num <= 2 ? 0 : num <= 4 ? 0.3 : num <= 7 ? 0.5 : 0.7;
        // blinking targets: appear from level 6+
        const blinkChance = num <= 5 ? 0 : num <= 8 ? 0.2 : 0.35;

        const targetColors = [
            hsl((hueBase + 120) % 360, 90, 60),
            hsl((hueBase + 200) % 360, 90, 60),
            hsl((hueBase + 280) % 360, 90, 60),
            '#ff4466', '#44ff88', '#ffaa22', '#ff44ff'
        ];

        for (let i = 0; i < targetCount; i++) {
            let placed = false;
            for (let a = 0; a < 150; a++) {
                const tx = rand(pa.x + 40, pa.x + pa.w - 40);
                const ty = rand(pa.y + 30, pa.y + pa.h - 140);
                const tr = rand(15, 20);

                let blocked = false;
                const buf = 15;
                for (const w of this.walls) {
                    if (tx + tr + buf > w.x && tx - tr - buf < w.x + w.w &&
                        ty + tr + buf > w.y && ty - tr - buf < w.y + w.h) {
                        blocked = true; break;
                    }
                }
                if (blocked) continue;

                for (const ot of this.targets) {
                    if (dist(tx, ty, ot.x, ot.y) < tr + ot.radius + 30) {
                        blocked = true; break;
                    }
                }
                if (blocked) continue;
                if (dist(tx, ty, this.playerStart.x, this.playerStart.y) < 100) continue;

                const maxBounces = 2 + (Player.upgrades ? Player.upgrades.bounces : 0);
                if (!this.isReachable(this.playerStart.x, this.playerStart.y, tx, ty, tr + 10, maxBounces, W, H)) {
                    continue;
                }

                // determine type
                let type = 'normal';
                let hp = 1;
                let baseScore = 10;

                const roll = Math.random();
                const isMoving = roll < movingChance;
                const isBlinking = !isMoving && roll < movingChance + blinkChance;
                // explosive targets: level 3+, ~15%
                const isExplosive = !isMoving && !isBlinking && num >= 3 && Math.random() < 0.15;

                if (isExplosive) {
                    type = 'explosive';
                    baseScore = 15;
                } else if (num >= 4 && !isMoving && !isBlinking && Math.random() < 0.25) {
                    type = 'armored';
                    hp = 2 + Math.floor(num / 5);
                    baseScore = 20;
                }
                if (isMoving) {
                    type = 'moving';
                    baseScore = baseScore * 2;
                }
                if (isBlinking) {
                    type = 'blinking';
                    baseScore = baseScore * 2;
                }

                const score = baseScore + Math.floor(num / 3) * 5;

                this.targets.push(new Target(tx, ty, tr, hp,
                    targetColors[i % targetColors.length], score, type));
                placed = true;
                break;
            }

            if (!placed) {
                for (let a = 0; a < 80; a++) {
                    const tx = rand(pa.x + 40, pa.x + pa.w - 40);
                    const ty = rand(pa.y + 30, pa.y + pa.h - 140);
                    const tr = 16;
                    let blocked = false;
                    for (const w of this.walls) {
                        if (tx + tr + 5 > w.x && tx - tr - 5 < w.x + w.w &&
                            ty + tr + 5 > w.y && ty - tr - 5 < w.y + w.h) { blocked = true; break; }
                    }
                    if (blocked) continue;
                    for (const ot of this.targets) {
                        if (dist(tx, ty, ot.x, ot.y) < tr + ot.radius + 25) { blocked = true; break; }
                    }
                    if (blocked) continue;
                    if (dist(tx, ty, this.playerStart.x, this.playerStart.y) < 80) continue;

                    const isMoving = Math.random() < movingChance;
                    const type = isMoving ? 'moving' : 'normal';
                    const baseScore = isMoving ? 20 : 10;
                    this.targets.push(new Target(tx, ty, tr, 1,
                        targetColors[i % targetColors.length],
                        baseScore + Math.floor(num / 3) * 5, type));
                    break;
                }
            }
        }

        this.validateAndFix(W, H);

        // ── Generate coin pickups ──
        const coinCount = Math.min(2 + Math.floor(num / 2), 6);
        for (let i = 0; i < coinCount; i++) {
            for (let a = 0; a < 50; a++) {
                const cx = rand(pa.x + 30, pa.x + pa.w - 30);
                const cy = rand(pa.y + 30, pa.y + pa.h - 100);
                let blocked = false;
                for (const w of this.walls) {
                    if (cx + 10 > w.x && cx - 10 < w.x + w.w &&
                        cy + 10 > w.y && cy - 10 < w.y + w.h) { blocked = true; break; }
                }
                if (blocked) continue;
                if (dist(cx, cy, this.playerStart.x, this.playerStart.y) < 60) continue;
                this.coins.push({
                    x: cx, y: cy, radius: 8,
                    value: 5 + num * 2 + randInt(0, 5),
                    pulse: rand(0, TAU),
                    bobSpeed: rand(2, 4),
                    baseY: cy,
                });
                break;
            }
        }
    },

    // ── Shockwave kill: damage-based radius, chain kills ──
    processShockwave(srcX, srcY, srcTarget, damage) {
        const baseRadius = 50;
        const radius = baseRadius + damage * 25; // scales with damage upgrade

        for (const t of this.targets) {
            if (!t.alive || t === srcTarget) continue;
            const d = dist(srcX, srcY, t.x, t.y);
            if (d < radius + t.radius) {
                // queue kill with delay for chain effect
                this.shockwaveQueue.push({
                    target: t,
                    delay: d / 400, // closer = faster
                    srcX, srcY,
                    radius,
                });
            }
        }
        return radius;
    },

    isReachable(px, py, tx, ty, hitRadius, maxBounces, W, H) {
        const angleToTarget = Math.atan2(ty - py, tx - px);
        const angles = [];
        for (let i = -15; i <= 15; i++) angles.push(angleToTarget + i * 0.04);
        for (let i = 0; i < 40; i++) angles.push(-Math.PI + i * (Math.PI / 20));

        const step = 3;
        const maxSteps = 600;

        for (const angle of angles) {
            let x = px, y = py;
            let vx = Math.cos(angle), vy = Math.sin(angle);
            let bounces = 0;

            for (let s = 0; s < maxSteps; s++) {
                const nx = x + vx * step;
                const ny = y + vy * step;
                if (dist(nx, ny, tx, ty) < hitRadius) return true;

                let bounced = false;
                for (const w of this.walls) {
                    if (nx > w.x && nx < w.x + w.w && ny > w.y && ny < w.y + w.h) {
                        if (bounces >= maxBounces) { bounced = true; break; }
                        const fromLeft = x <= w.x;
                        const fromRight = x >= w.x + w.w;
                        if (fromLeft || fromRight) vx = -vx;
                        else vy = -vy;
                        bounces++;
                        bounced = true;
                        break;
                    }
                }
                if (bounced && bounces > maxBounces) break;
                if (!bounced) { x = nx; y = ny; }
            }
        }
        return false;
    },

    validateAndFix(W, H) {
        const maxBounces = 2 + (Player.upgrades ? Player.upgrades.bounces : 0);
        let unreachable = 0;
        for (const t of this.targets) {
            if (!this.isReachable(this.playerStart.x, this.playerStart.y,
                t.originX, t.originY, t.radius + 15, maxBounces, W, H)) unreachable++;
        }

        let attempts = 0;
        while (unreachable > this.targets.length * 0.3 && this.innerWalls.length > 0 && attempts < 5) {
            let worstIdx = -1, worstBlock = 0;
            for (let wi = 0; wi < this.innerWalls.length; wi++) {
                const saved = this.innerWalls[wi];
                const wallIdx = this.walls.indexOf(saved);
                this.walls.splice(wallIdx, 1);
                let nowReachable = 0;
                for (const t of this.targets) {
                    if (this.isReachable(this.playerStart.x, this.playerStart.y,
                        t.originX, t.originY, t.radius + 15, maxBounces, W, H)) nowReachable++;
                }
                this.walls.splice(wallIdx, 0, saved);
                const unblocked = nowReachable - (this.targets.length - unreachable);
                if (unblocked > worstBlock) { worstBlock = unblocked; worstIdx = wi; }
            }
            if (worstIdx >= 0 && worstBlock > 0) {
                const removed = this.innerWalls[worstIdx];
                this.innerWalls.splice(worstIdx, 1);
                this.walls = this.walls.filter(w => w !== removed);
            } else break;

            unreachable = 0;
            for (const t of this.targets) {
                if (!this.isReachable(this.playerStart.x, this.playerStart.y,
                    t.originX, t.originY, t.radius + 15, maxBounces, W, H)) unreachable++;
            }
            attempts++;
        }
    },

    allTargetsDead() {
        return this.targets.every(t => !t.alive);
    },

    drawWalls(ctx) {
        for (const w of this.walls) {
            if (w.glow) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = w.glow;
            }
            // gradient fill for inner walls
            if (w.glow) {
                const g = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
                g.addColorStop(0, w.color);
                g.addColorStop(1, w.glow);
                ctx.fillStyle = g;
            } else {
                ctx.fillStyle = w.color;
            }
            ctx.fillRect(w.x, w.y, w.w, w.h);

            if (w.glow) {
                ctx.strokeStyle = w.glow;
                ctx.lineWidth = 1;
                ctx.strokeRect(w.x, w.y, w.w, w.h);
            }
            ctx.shadowBlur = 0;
        }
    },

    drawTargets(ctx) {
        for (const t of this.targets) t.draw(ctx);
    },

    drawCoins(ctx) {
        for (const c of this.coins) {
            c.pulse += 0.05;
            const bobY = c.baseY + Math.sin(c.pulse * c.bobSpeed) * 4;
            const sparkle = 0.7 + Math.sin(c.pulse * 5) * 0.3;

            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffcc00';
            ctx.globalAlpha = sparkle;

            // outer glow
            ctx.strokeStyle = '#ffdd44';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(c.x, bobY, c.radius + 3, 0, TAU);
            ctx.stroke();

            // coin body
            const cg = ctx.createRadialGradient(c.x - 2, bobY - 2, 0, c.x, bobY, c.radius);
            cg.addColorStop(0, '#ffee88');
            cg.addColorStop(1, '#cc8800');
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(c.x, bobY, c.radius, 0, TAU);
            ctx.fill();

            // $ symbol
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffee00';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', c.x, bobY);

            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }
    },

    updateTargets(dt) {
        for (const t of this.targets) t.update(dt);
    }
};
