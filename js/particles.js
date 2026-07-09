// ── Particle system with explosions, shockwaves, screen flash ──

class Particle {
    constructor(x, y, vx, vy, life, size, color, glow, type) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = this.maxLife = life;
        this.size = size;
        this.color = color;
        this.glow = glow || 0;
        this.type = type || 'circle'; // circle, ring, star, smoke
        this.rotation = rand(0, TAU);
        this.rotSpeed = rand(-5, 5);
        this.gravity = 0;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        this.vx *= 0.97;
        this.vy *= 0.97;
        this.rotation += this.rotSpeed * dt;
        this.life -= dt;
    }
    draw(ctx) {
        const a = this.life / this.maxLife;
        const s = this.size * (this.type === 'smoke' ? (2 - a) : a);
        ctx.globalAlpha = this.type === 'smoke' ? a * 0.3 : a;

        if (this.glow > 0) {
            ctx.shadowBlur = this.glow * a;
            ctx.shadowColor = this.color;
        }

        if (this.type === 'ring') {
            const expand = this.size * (1 - a) * 3;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(1, s * 0.5);
            ctx.beginPath();
            ctx.arc(this.x, this.y, expand + 5, 0, TAU);
            ctx.stroke();
        } else if (this.type === 'star') {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            this.drawStar(ctx, 0, 0, 4, s, s * 0.4);
            ctx.restore();
        } else if (this.type === 'smoke') {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, s, 0, TAU);
            ctx.fill();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, s, 0, TAU);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }
    drawStar(ctx, cx, cy, spikes, outerR, innerR) {
        let rot = -Math.PI / 2;
        const step = Math.PI / spikes;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
            rot += step;
        }
        ctx.closePath();
        ctx.fill();
    }
}

const Particles = {
    list: [],
    screenFlash: 0,
    screenFlashColor: '#fff',
    slowmo: 0, // slowmo timer

    add(p) { this.list.push(p); },

    burst(x, y, count, color, speed, size, life, glow) {
        for (let i = 0; i < count; i++) {
            const angle = rand(0, TAU);
            const spd = rand(speed * 0.3, speed);
            this.add(new Particle(
                x, y,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                rand(life * 0.5, life), rand(size * 0.5, size),
                color, glow || 0
            ));
        }
    },

    trail(x, y, color, size, life, glow) {
        this.add(new Particle(
            x + rand(-2, 2), y + rand(-2, 2),
            rand(-10, 10), rand(-10, 10),
            life || 0.3, size || 3,
            color, glow || 0
        ));
    },

    sparks(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const angle = rand(0, TAU);
            const spd = rand(150, 500);
            const p = new Particle(
                x, y,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                rand(0.2, 0.6), rand(1, 4),
                color, 12
            );
            this.add(p);
        }
        // star sparks
        for (let i = 0; i < Math.floor(count / 3); i++) {
            const angle = rand(0, TAU);
            const spd = rand(50, 200);
            const p = new Particle(
                x, y,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                rand(0.3, 0.7), rand(3, 7),
                color, 10, 'star'
            );
            this.add(p);
        }
    },

    // big explosion with shockwave ring + debris + smoke
    explosion(x, y, color, power) {
        power = power || 1;
        const count = Math.floor(25 * power);

        // core burst
        this.burst(x, y, count, color, 350 * power, 6 * power, 0.6, 15);
        this.burst(x, y, Math.floor(count * 0.6), '#fff', 250 * power, 4, 0.3, 20);

        // star debris
        for (let i = 0; i < count * 0.5; i++) {
            const angle = rand(0, TAU);
            const spd = rand(100, 400) * power;
            const p = new Particle(
                x, y,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                rand(0.3, 0.8), rand(4, 10),
                color, 12, 'star'
            );
            p.gravity = rand(100, 300);
            this.add(p);
        }

        // smoke
        for (let i = 0; i < 8 * power; i++) {
            const angle = rand(0, TAU);
            const spd = rand(20, 80);
            const p = new Particle(
                x + rand(-10, 10), y + rand(-10, 10),
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                rand(0.5, 1.2), rand(10, 25),
                '#665544', 0, 'smoke'
            );
            this.add(p);
        }

        // shockwave ring
        this.shockwave(x, y, color, 50 * power);

        // screen flash
        this.flash(color, 0.4 * power);
    },

    shockwave(x, y, color, size) {
        const p = new Particle(x, y, 0, 0, 0.4, size, color, 20, 'ring');
        this.add(p);
        // secondary ring
        const p2 = new Particle(x, y, 0, 0, 0.6, size * 0.6, '#fff', 10, 'ring');
        this.add(p2);
    },

    flash(color, intensity) {
        this.screenFlash = intensity || 0.5;
        this.screenFlashColor = color || '#fff';
    },

    // fire trail for bullets
    fireTrail(x, y, color) {
        for (let i = 0; i < 2; i++) {
            const p = new Particle(
                x + rand(-3, 3), y + rand(-3, 3),
                rand(-30, 30), rand(-30, 30),
                rand(0.1, 0.25), rand(2, 5),
                color, 8
            );
            this.add(p);
        }
        // occasional star
        if (Math.random() < 0.15) {
            const p = new Particle(
                x, y, rand(-20, 20), rand(-20, 20),
                0.3, rand(3, 6),
                '#fff', 6, 'star'
            );
            this.add(p);
        }
    },

    // wall impact burst — directional
    wallImpact(x, y, nx, ny, color) {
        const baseAngle = Math.atan2(ny, nx);
        for (let i = 0; i < 15; i++) {
            const angle = baseAngle + rand(-0.8, 0.8);
            const spd = rand(100, 400);
            const p = new Particle(
                x, y,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                rand(0.15, 0.5), rand(1, 4),
                color, 10
            );
            this.add(p);
        }
        // mini shockwave at impact
        const p = new Particle(x, y, 0, 0, 0.25, 20, color, 15, 'ring');
        this.add(p);
    },

    update(dt) {
        // slowmo
        if (this.slowmo > 0) this.slowmo -= dt;

        // screen flash decay
        if (this.screenFlash > 0) this.screenFlash -= dt * 3;

        for (let i = this.list.length - 1; i >= 0; i--) {
            this.list[i].update(dt);
            if (this.list[i].life <= 0) this.list.splice(i, 1);
        }
    },

    draw(ctx) {
        for (const p of this.list) p.draw(ctx);
    },

    drawFlash(ctx, W, H) {
        if (this.screenFlash > 0) {
            ctx.globalAlpha = clamp(this.screenFlash, 0, 0.6);
            ctx.fillStyle = this.screenFlashColor;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }
    },

    getTimeScale() {
        return this.slowmo > 0 ? 0.3 : 1;
    },

    triggerSlowmo(duration) {
        this.slowmo = duration || 0.3;
    },

    clear() { this.list.length = 0; this.screenFlash = 0; this.slowmo = 0; }
};
