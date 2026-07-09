// ── Bullet with ricochet logic ──

class Bullet {
    constructor(x, y, angle, speed, maxBounces, damage, color, maxPierces, isCrit, magnetStr) {
        this.x = x; this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.speed = speed;
        this.maxBounces = maxBounces;
        this.bounces = 0;
        this.damage = damage;
        this.color = color || '#aa44ff';
        this.maxPierces = maxPierces;
        this.pierceCount = 0;
        this.alive = true;
        this.radius = isCrit ? 7 : 5;
        this.trail = [];
        this.trailTimer = 0;
        this.age = 0;
        this.hitTargets = new Set();
        this.isCrit = isCrit || false;
        this.magnetStr = magnetStr || 0;
    }

    update(dt, walls, targets) {
        if (!this.alive) return;
        this.age += dt;

        // magnet: attract toward nearest alive target
        if (this.magnetStr > 0) {
            let nearest = null, nearDist = 999999;
            for (const t of targets) {
                if (!t.alive) continue;
                if (this.hitTargets.has(t)) continue;
                if (t.type === 'blinking' && !t.visible) continue;
                const d = dist(this.x, this.y, t.x, t.y);
                if (d < nearDist && d < 200) { nearDist = d; nearest = t; }
            }
            if (nearest) {
                const ax = nearest.x - this.x;
                const ay = nearest.y - this.y;
                const len = Math.hypot(ax, ay);
                if (len > 0) {
                    this.vx += (ax / len) * this.magnetStr * dt;
                    this.vy += (ay / len) * this.magnetStr * dt;
                }
            }
        }

        const nx = this.x + this.vx * dt;
        const ny = this.y + this.vy * dt;

        this.trailTimer += dt;
        if (this.trailTimer > 0.008) {
            this.trail.push({ x: this.x, y: this.y, a: 1 });
            if (this.trail.length > 30) this.trail.shift();
            this.trailTimer = 0;
        }

        // wall collisions
        for (const w of walls) {
            const hit = this.checkWall(nx, ny, w);
            if (hit) {
                if (this.bounces >= this.maxBounces) {
                    this.die();
                    return;
                }
                this.bounces++;
                Sound.ricochet();
                Particles.wallImpact(this.x, this.y, hit.nx, hit.ny, this.color);
                Shake.trigger(5);
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // check targets
        for (let i = targets.length - 1; i >= 0; i--) {
            const t = targets[i];
            if (!t.alive) continue;
            if (this.hitTargets.has(t)) continue;
            if (t.type === 'blinking' && !t.visible) continue;
            if (t.shielded) continue; // protected by shield
            if (dist(this.x, this.y, t.x, t.y) < this.radius + t.radius) {
                this.hitTargets.add(t);
                t.hit(this.damage);
                this.pierceCount++;
                if (!t.alive) {
                    Particles.explosion(t.x, t.y, t.color, this.isCrit ? 1.8 : 1.2);
                    Particles.triggerSlowmo(this.isCrit ? 0.35 : 0.25);
                    Shake.trigger(this.isCrit ? 16 : 12);
                    Game.onTargetKill(t, this.bounces, this.pierceCount, this.isCrit);
                } else {
                    Sound.hit();
                    Particles.burst(t.x, t.y, 20, t.color, 250, 6, 0.5, 12);
                    Particles.sparks(t.x, t.y, 12, '#fff');
                    Shake.trigger(6);
                }
                if (this.pierceCount >= this.maxPierces) { this.die(); return; }
            }
        }

        // coin pickups
        if (Level.coins) {
            for (let i = Level.coins.length - 1; i >= 0; i--) {
                const c = Level.coins[i];
                if (dist(this.x, this.y, c.x, c.y) < this.radius + c.radius) {
                    Game.collectCoin(c);
                    Level.coins.splice(i, 1);
                }
            }
        }

        // clamp inside play area — never fly past borders
        const pa = Level.playArea;
        if (pa) {
            const bw = 12; // border wall thickness
            const minX = bw + this.radius;
            const maxX = Game.W - bw - this.radius;
            const minY = pa.y;
            const maxY = Game.H - bw - this.radius;
            if (this.x < minX) { this.x = minX; this.vx = Math.abs(this.vx); }
            if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx); }
            if (this.y < minY) { this.y = minY; this.vy = Math.abs(this.vy); }
            if (this.y > maxY) { this.y = maxY; this.vy = -Math.abs(this.vy); }
        }
    }

    checkWall(nx, ny, w) {
        const r = this.radius;
        if (nx + r > w.x && nx - r < w.x + w.w && ny + r > w.y && ny - r < w.y + w.h) {
            const overlapL = (nx + r) - w.x;
            const overlapR = (w.x + w.w) - (nx - r);
            const overlapT = (ny + r) - w.y;
            const overlapB = (w.y + w.h) - (ny - r);
            const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);

            let normalX = 0, normalY = 0;
            if (minOverlap === overlapL) { this.vx = -Math.abs(this.vx); normalX = -1; }
            else if (minOverlap === overlapR) { this.vx = Math.abs(this.vx); normalX = 1; }
            else if (minOverlap === overlapT) { this.vy = -Math.abs(this.vy); normalY = -1; }
            else { this.vy = Math.abs(this.vy); normalY = 1; }

            return { nx: normalX, ny: normalY };
        }
        return null;
    }

    die() {
        this.alive = false;
        Particles.explosion(this.x, this.y, this.color, this.isCrit ? 0.8 : 0.5);
        Shake.trigger(4);
    }

    draw(ctx) {
        if (!this.alive) return;

        // trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const a = i / this.trail.length;
            ctx.globalAlpha = a * 0.6;
            ctx.fillStyle = this.color;
            const s = this.radius * a;
            ctx.shadowBlur = 8 * a;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(t.x, t.y, s, 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // crit: extra outer ring
        if (this.isCrit) {
            ctx.shadowBlur = 35;
            ctx.shadowColor = '#ff2244';
            ctx.strokeStyle = '#ff4466';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6 + Math.sin(this.age * 25) * 3, 0, TAU);
            ctx.stroke();
        }

        // outer glow ring
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 3 + Math.sin(this.age * 20) * 2, 0, TAU);
        ctx.stroke();

        // main body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, TAU);
        ctx.fill();

        // white core
        ctx.shadowBlur = 0;
        ctx.fillStyle = this.isCrit ? '#ffcccc' : '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.45, 0, TAU);
        ctx.fill();

        Particles.fireTrail(this.x, this.y, this.color);
    }
}
