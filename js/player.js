// ── Player (shooter) ──

const Player = {
    x: 0, y: 0,
    angle: -Math.PI / 2,
    radius: 18,
    bullets: [],
    cooldown: 0,
    shotsLeft: 0,
    maxShots: 3,
    aiming: false,
    hasShot: false,
    chargeTime: 0,
    recoilAnim: 0,

    stats: {
        maxBounces: 2,
        damage: 1,
        bulletSpeed: 500,
        maxShots: 3,
        maxPierces: 2,
        predict: 0,   // 0=basic, 1=longer+brighter, 2=target highlight, 3=full path+crit zone
        crit: 0,       // crit chance %
        magnet: 0,     // bullet attraction to targets
    },

    upgrades: {
        bounces: 0,
        damage: 0,
        speed: 0,
        shots: 0,
        piercing: 0,
        predict: 0,
        crit: 0,
        magnet: 0,
    },

    init(x, y) {
        this.x = x;
        this.y = y;
        this.angle = -Math.PI / 2;
        this.bullets = [];
        this.cooldown = 0;
        this.aiming = false;
        this.hasShot = false;
        this.chargeTime = 0;
        this.recoilAnim = 0;
        this.applyUpgrades();
        this.shotsLeft = this.stats.maxShots;
    },

    // bullet color tiers based on bounces + damage upgrades
    // 0=grey, 1-2=yellow, 3-4=red, 5-7=orange, 8-10=green, 11-14=blue, 15+=purple
    bulletColorTiers: [
        { min: 0,  color: '#888899', glow: '#666677', name: 'grey' },
        { min: 1,  color: '#ffdd44', glow: '#ccaa00', name: 'yellow' },
        { min: 3,  color: '#ff3344', glow: '#cc1122', name: 'red' },
        { min: 5,  color: '#ff8833', glow: '#cc6611', name: 'orange' },
        { min: 8,  color: '#33ff88', glow: '#11cc55', name: 'green' },
        { min: 11, color: '#3388ff', glow: '#1155cc', name: 'blue' },
        { min: 15, color: '#bb44ff', glow: '#8822cc', name: 'purple' },
    ],

    getBulletColor() {
        const power = this.upgrades.bounces + this.upgrades.damage;
        let tier = this.bulletColorTiers[0];
        for (const t of this.bulletColorTiers) {
            if (power >= t.min) tier = t;
        }
        return tier;
    },

    applyUpgrades() {
        this.stats.maxBounces = 2 + this.upgrades.bounces;
        this.stats.damage = 1 + this.upgrades.damage;
        this.stats.bulletSpeed = 500 + this.upgrades.speed * 80;
        this.stats.maxShots = 3 + this.upgrades.shots;
        this.stats.maxPierces = 2 + this.upgrades.piercing;
        this.stats.predict = this.upgrades.predict;
        this.stats.crit = Math.min(this.upgrades.crit * 8, 40);
        this.stats.magnet = this.upgrades.magnet * 30;
    },

    startAim(tx, ty) {
        if (this.shotsLeft <= 0) return;
        this.aiming = true;
        this.chargeTime = 0;
        this.aim(tx, ty);
    },

    aim(tx, ty) {
        this.angle = Math.atan2(ty - this.y, tx - this.x);
    },

    shoot() {
        if (this.shotsLeft <= 0 || this.cooldown > 0 || !this.aiming) return false;
        this.aiming = false;

        const tier = this.getBulletColor();
        const a = this.angle;
        const isCrit = Math.random() * 100 < this.stats.crit;

        // первый выстрел уровня — снаряд с ударной волной, остальные обычные
        const hasShockwave = !this.hasShot;
        this.hasShot = true;

        this.bullets.push(new Bullet(
            this.x + Math.cos(a) * 25,
            this.y + Math.sin(a) * 25,
            a,
            this.stats.bulletSpeed,
            this.stats.maxBounces,
            isCrit ? this.stats.damage * 3 : this.stats.damage,
            isCrit ? '#ff2244' : tier.color,
            this.stats.maxPierces,
            isCrit,
            this.stats.magnet,
            hasShockwave
        ));

        if (isCrit) {
            const mx = this.x + Math.cos(a) * 30;
            const my = this.y + Math.sin(a) * 30;
            Particles.explosion(mx, my, '#ff2244', 0.6);
            Particles.flash('#ff2244', 0.3);
            Game.comboTexts.push({
                x: Game.W / 2, y: Game.H * 0.42,
                text: 'КРИТ!',
                life: 1.2, maxLife: 1.2,
                color: '#ff2244',
                size: 30
            });
        }

        this.shotsLeft--;
        this.cooldown = 0.15;
        this.recoilAnim = 0.2;
        Sound.shoot();

        const mx = this.x + Math.cos(this.angle) * 30;
        const my = this.y + Math.sin(this.angle) * 30;
        Particles.burst(mx, my, 15, '#fff', 200, 5, 0.3, 10);
        Particles.burst(mx, my, 10, tier.color, 150, 4, 0.25, 8);
        Particles.shockwave(mx, my, tier.glow, 15);
        Particles.flash(tier.glow, 0.2);
        Shake.trigger(6);
        return true;
    },

    cancelAim() {
        this.aiming = false;
        this.chargeTime = 0;
    },

    update(dt) {
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.recoilAnim = Math.max(0, this.recoilAnim - dt);

        if (this.aiming) {
            this.chargeTime += dt;
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].update(dt, Level.walls, Level.targets);
            if (!this.bullets[i].alive) this.bullets.splice(i, 1);
        }
    },

    draw(ctx) {
        const recoilOff = this.recoilAnim > 0 ? Math.sin(this.recoilAnim * 50) * 3 : 0;
        const drawX = this.x - Math.cos(this.angle) * recoilOff;
        const drawY = this.y - Math.sin(this.angle) * recoilOff;
        const tier = this.getBulletColor();
        const tc = tier.color;
        const tg = tier.glow;

        // aiming charge ring
        if (this.aiming && this.chargeTime > 0) {
            const chargeA = Math.min(this.chargeTime * 3, 1);
            ctx.strokeStyle = tc;
            ctx.globalAlpha = chargeA * 0.6;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 15;
            ctx.shadowColor = tg;
            ctx.beginPath();
            ctx.arc(drawX, drawY, this.radius + 8 + Math.sin(this.chargeTime * 10) * 3, 0, TAU * chargeA);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        // crit indicator ring
        if (this.stats.crit > 0 && this.aiming) {
            ctx.strokeStyle = `rgba(255,34,68,${0.2 + Math.sin(this.chargeTime * 6) * 0.15})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(drawX, drawY, this.radius + 14, 0, TAU);
            ctx.stroke();
        }

        ctx.shadowBlur = this.aiming ? 30 : 20;
        ctx.shadowColor = this.aiming ? tc : tg;

        ctx.fillStyle = '#101020';
        ctx.strokeStyle = tc;
        ctx.lineWidth = this.aiming ? 3 : 2.5;
        ctx.beginPath();
        ctx.arc(drawX, drawY, this.radius, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        const tipLen = this.aiming ? 18 : 14;
        const cx = drawX + Math.cos(this.angle) * this.radius;
        const cy = drawY + Math.sin(this.angle) * this.radius;
        ctx.strokeStyle = tc;
        ctx.lineWidth = this.aiming ? 6 : 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(drawX, drawY);
        ctx.lineTo(cx + Math.cos(this.angle) * tipLen, cy + Math.sin(this.angle) * tipLen);
        ctx.stroke();

        const coreSize = this.aiming ? 7 + Math.sin(this.chargeTime * 8) * 2 : 6;
        ctx.fillStyle = tc;
        ctx.shadowBlur = this.aiming ? 15 : 0;
        ctx.shadowColor = tg;
        ctx.beginPath();
        ctx.arc(drawX, drawY, coreSize, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (this.aiming) {
            Particles.trail(drawX + rand(-15, 15), drawY + rand(-15, 15), tc, 2, 0.3, 5);
        }

        for (const b of this.bullets) b.draw(ctx);

        if (this.aiming) {
            this.drawAimLine(ctx);
        }
    },

    drawAimLine(ctx) {
        const chargeA = Math.min(this.chargeTime * 3, 1);
        const pred = this.stats.predict;
        const tier = this.getBulletColor();

        const lineAlpha = 0.25 + pred * 0.12;
        const lineWidth = 1.5 + pred * 0.5;
        const maxDist = 1500 + pred * 500;
        const showTargetHit = pred >= 2;
        const showImpactZone = pred >= 3;

        ctx.save();
        ctx.setLineDash([6, 8 - pred]);
        ctx.strokeStyle = tier.color;
        ctx.globalAlpha = lineAlpha * chargeA;
        ctx.lineWidth = lineWidth;

        let lx = this.x + Math.cos(this.angle) * 30;
        let ly = this.y + Math.sin(this.angle) * 30;
        let lvx = Math.cos(this.angle);
        let lvy = Math.sin(this.angle);

        ctx.beginPath();
        ctx.moveTo(lx, ly);

        let bounces = 0;
        let traveled = 0;
        const step = 2;
        const hitTargets = [];

        while (traveled < maxDist && bounces <= this.stats.maxBounces) {
            const nx = lx + lvx * step;
            const ny = ly + lvy * step;

            // check target proximity for highlighting
            if (showTargetHit) {
                for (const t of Level.targets) {
                    if (!t.alive) continue;
                    if (t.type === 'blinking' && !t.visible) continue;
                    if (dist(nx, ny, t.x, t.y) < t.radius + 6 && !hitTargets.includes(t)) {
                        hitTargets.push(t);
                    }
                }
            }

            let bounced = false;
            for (const w of Level.walls) {
                if (nx > w.x && nx < w.x + w.w && ny > w.y && ny < w.y + w.h) {
                    const fromLeft = lx <= w.x;
                    const fromRight = lx >= w.x + w.w;
                    if (fromLeft || fromRight) lvx = -lvx;
                    else lvy = -lvy;

                    bounces++;
                    bounced = true;

                    ctx.lineTo(lx, ly);
                    ctx.stroke();
                    if (bounces <= this.stats.maxBounces) {
                        ctx.globalAlpha = (0.7 - bounces * 0.08) * chargeA;
                        ctx.shadowBlur = 10 + pred * 3;
                        ctx.shadowColor = tier.glow;
                        ctx.fillStyle = tier.color;
                        ctx.beginPath();
                        ctx.arc(lx, ly, 4 + pred, 0, TAU);
                        ctx.fill();
                        // bounce number
                        if (pred >= 1) {
                            ctx.fillStyle = `rgba(255,255,255,${0.5 * chargeA})`;
                            ctx.font = '9px Arial';
                            ctx.textAlign = 'center';
                            ctx.fillText(bounces, lx, ly - 10);
                        }
                        ctx.shadowBlur = 0;
                        ctx.beginPath();
                        ctx.moveTo(lx, ly);
                    }
                    break;
                }
            }

            if (!bounced) {
                lx = nx;
                ly = ny;
                ctx.lineTo(lx, ly);
            }
            traveled += step;
        }
        ctx.stroke();

        // draw target hit highlights
        if (showTargetHit) {
            for (const t of hitTargets) {
                ctx.strokeStyle = `rgba(255,100,100,${0.6 * chargeA})`;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#ff4444';
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(t.x, t.y, t.radius + 8, 0, TAU);
                ctx.stroke();

                // crosshair
                const ch = t.radius + 12;
                ctx.beginPath();
                ctx.moveTo(t.x - ch, t.y); ctx.lineTo(t.x - ch + 8, t.y);
                ctx.moveTo(t.x + ch, t.y); ctx.lineTo(t.x + ch - 8, t.y);
                ctx.moveTo(t.x, t.y - ch); ctx.lineTo(t.x, t.y - ch + 8);
                ctx.moveTo(t.x, t.y + ch); ctx.lineTo(t.x, t.y + ch - 8);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        // impact zone circle at end of line
        if (showImpactZone && traveled >= maxDist * 0.5) {
            const waveR = 50 + this.stats.damage * 25;
            ctx.setLineDash([4, 6]);
            ctx.strokeStyle = `rgba(255,136,68,${0.2 * chargeA})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(lx, ly, waveR, 0, TAU);
            ctx.stroke();
        }

        ctx.restore();
    }
};
