// ── Level generation with reachability validation ──

class Target {
    constructor(x, y, radius, hp, color, score, type) {
        this.x = x; this.y = y;
        this.radius = radius;
        this.hp = this.maxHp = hp;
        this.color = color;
        this.score = score;
        this.type = type || 'normal';
        this.alive = true;
        this.pulse = 0;
        // moving
        this.originX = x; this.originY = y;
        this.moveAngle = rand(0, TAU);
        this.moveSpeed = type === 'moving' ? rand(50, 120) : 0;
        this.moveRange = type === 'moving' ? rand(25, 60) : 0;
        this.movePattern = randInt(0, 2);
        this.hitFlash = 0;
        this.spawnAnim = 1.0;
        // blinking
        this.blinkTimer = rand(0, TAU);
        this.blinkSpeed = type === 'blinking' ? rand(1.5, 3.0) : 0;
        this.visible = true;
        this.blinkAlpha = 1;
        // healer
        this.healTimer = 0;
        this.healPulse = 0;
        // teleporter
        this.teleportCooldown = 0;
        // shield
        this.shieldActive = type === 'shield';
        // splitter
        this.hasSplit = false;
        // multiplier
        this.isMultiplier = type === 'multiplier';
    }

    hit(dmg) {
        // shield targets are immune while protecting
        if (this.shielded) return;

        // teleporter: first hit — teleport + 1 damage, second hit — death
        if (this.type === 'teleporter' && this.teleportCooldown <= 0 && this.hp > 1) {
            this.teleportCooldown = 1.5;
            this.hp = 1; // one hit left after teleport
            this.doTeleport();
            this.hitFlash = 0.3;
            return;
        }

        this.hp -= dmg;
        this.hitFlash = 0.2;
        if (this.hp <= 0) {
            this.alive = false;
        }
    }

    doTeleport() {
        const pa = Level.playArea;
        if (!pa) return;
        for (let i = 0; i < 50; i++) {
            const nx = rand(pa.x + 40, pa.x + pa.w - 40);
            const ny = rand(pa.y + 30, pa.y + pa.h - 140);
            let blocked = false;
            for (const w of Level.walls) {
                if (nx + 20 > w.x && nx - 20 < w.x + w.w &&
                    ny + 20 > w.y && ny - 20 < w.y + w.h) { blocked = true; break; }
            }
            if (blocked) continue;
            if (dist(nx, ny, Level.playerStart.x, Level.playerStart.y) < 80) continue;
            // teleport effects
            Particles.explosion(this.x, this.y, '#bb44ff', 0.5);
            Particles.explosion(nx, ny, '#bb44ff', 0.5);
            Sound.ricochet();
            this.x = nx; this.y = ny;
            this.originX = nx; this.originY = ny;
            return;
        }
    }

    // kill by shockwave (instant death, except boss takes damage)
    killByShockwave() {
        if (!this.alive) return;
        if (this.type === 'boss') {
            // boss resists instant kill — takes 2 damage instead
            this.hp -= 2;
            this.hitFlash = 0.3;
            if (this.hp <= 0) { this.alive = false; this.hp = 0; }
            return;
        }
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

        // boss movement: figure-8 pattern, speed increases with phase
        if (this.type === 'boss') {
            const hpRatio = this.hp / this.maxHp;
            this.bossPhase = hpRatio > 0.6 ? 0 : hpRatio > 0.3 ? 1 : 2;
            const speedMult = 1 + this.bossPhase * 0.6;
            this.moveAngle += dt * this.moveSpeed * 0.015 * speedMult;
            const rangeMult = 1 + this.bossPhase * 0.3;
            this.x = this.originX + Math.cos(this.moveAngle) * this.moveRange * rangeMult;
            this.y = this.originY + Math.sin(this.moveAngle * 2) * this.moveRange * 0.5 * rangeMult;
        }

        // blinking
        if (this.type === 'blinking') {
            this.blinkTimer += dt * this.blinkSpeed;
            const sin = Math.sin(this.blinkTimer);
            this.visible = sin > -0.3;
            this.blinkAlpha = this.visible ? clamp(sin + 0.3, 0.2, 1) : 0;
        }

        // teleporter cooldown
        if (this.type === 'teleporter') {
            this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
        }

        // healer: restore 1 HP to a nearby target every 3 seconds
        if (this.type === 'healer' && this.alive) {
            this.healTimer += dt;
            this.healPulse += dt * 4;
            if (this.healTimer >= 3) {
                this.healTimer = 0;
                for (const t of Level.targets) {
                    if (t === this || !t.alive) continue;
                    if (t.hp >= t.maxHp) continue;
                    if (dist(this.x, this.y, t.x, t.y) < 120) {
                        t.hp = Math.min(t.hp + 1, t.maxHp);
                        t.hitFlash = 0.15;
                        Particles.burst(t.x, t.y, 8, '#44ff88', 80, 3, 0.3, 6);
                        break;
                    }
                }
            }
        }

        // shield: mark nearby targets as shielded
        if (this.type === 'shield') {
            for (const t of Level.targets) {
                if (t === this) continue;
                if (!t.alive) { t.shielded = false; continue; }
                t.shielded = this.alive && dist(this.x, this.y, t.x, t.y) < 100;
            }
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

        // healer — green cross + heal aura
        if (this.type === 'healer') {
            ctx.strokeStyle = 'rgba(68,255,136,0.6)';
            ctx.lineWidth = 2.5;
            const cs = drawR * 0.4;
            ctx.beginPath();
            ctx.moveTo(this.x - cs, this.y); ctx.lineTo(this.x + cs, this.y);
            ctx.moveTo(this.x, this.y - cs); ctx.lineTo(this.x, this.y + cs);
            ctx.stroke();
            // heal aura ring
            const healA = 0.15 + Math.sin(this.healPulse) * 0.1;
            ctx.strokeStyle = `rgba(68,255,136,${healA})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, 120, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // shield — blue dome + protection aura
        if (this.type === 'shield') {
            // dome shape
            ctx.strokeStyle = 'rgba(68,180,255,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, drawR + 6, -Math.PI, 0);
            ctx.stroke();
            // protection aura
            const shieldA = 0.1 + Math.sin(this.pulse * 2) * 0.06;
            ctx.strokeStyle = `rgba(68,180,255,${shieldA})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 100, 0, TAU);
            ctx.stroke();
            // hex pattern inside
            ctx.strokeStyle = 'rgba(100,200,255,0.3)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const ha = i * TAU / 6 + this.pulse * 0.5;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x + Math.cos(ha) * drawR * 0.7, this.y + Math.sin(ha) * drawR * 0.7);
                ctx.stroke();
            }
        }

        // shielded indicator on protected targets
        if (this.shielded) {
            ctx.strokeStyle = 'rgba(68,180,255,0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, drawR + 8, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // teleporter — portal rings
        if (this.type === 'teleporter') {
            const tpA = 0.4 + Math.sin(this.pulse * 3) * 0.2;
            ctx.strokeStyle = `rgba(187,68,255,${tpA})`;
            ctx.lineWidth = 1.5;
            const r1 = drawR + 5 + Math.sin(this.pulse * 2) * 3;
            const r2 = drawR + 9 + Math.cos(this.pulse * 2.5) * 3;
            ctx.beginPath(); ctx.arc(this.x, this.y, r1, 0, TAU); ctx.stroke();
            ctx.beginPath(); ctx.arc(this.x, this.y, r2, 0, TAU); ctx.stroke();
            // swirl lines
            ctx.strokeStyle = 'rgba(200,100,255,0.3)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                const sa = this.pulse * 1.5 + i * TAU / 4;
                ctx.beginPath();
                ctx.arc(this.x, this.y, drawR * 0.6, sa, sa + 0.8);
                ctx.stroke();
            }
        }

        // splitter — division symbol
        if (this.type === 'splitter') {
            ctx.strokeStyle = 'rgba(255,100,200,0.7)';
            ctx.lineWidth = 2;
            const ds = drawR * 0.35;
            // horizontal line
            ctx.beginPath();
            ctx.moveTo(this.x - ds, this.y); ctx.lineTo(this.x + ds, this.y);
            ctx.stroke();
            // two dots
            ctx.fillStyle = 'rgba(255,100,200,0.7)';
            ctx.beginPath(); ctx.arc(this.x, this.y - ds * 0.7, 2.5, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(this.x, this.y + ds * 0.7, 2.5, 0, TAU); ctx.fill();
            // pulsing split hint
            const spA = 0.1 + Math.sin(this.pulse * 2) * 0.05;
            ctx.strokeStyle = `rgba(255,100,200,${spA})`;
            ctx.lineWidth = 1;
            // two smaller circles
            ctx.beginPath();
            ctx.arc(this.x - drawR * 0.6, this.y + drawR * 0.6, drawR * 0.4, 0, TAU);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(this.x + drawR * 0.6, this.y + drawR * 0.6, drawR * 0.4, 0, TAU);
            ctx.stroke();
        }

        // powerup — pulsing diamond with rotating sparkles
        if (this.type === 'powerup') {
            const bColor = this.bonus ? this.bonus.color : '#fff';
            // rotating sparkle ring
            const spA = 0.4 + Math.sin(this.pulse * 4) * 0.3;
            ctx.strokeStyle = bColor;
            ctx.globalAlpha = alpha * spA;
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 5; i++) {
                const sa = this.pulse * 2 + i * TAU / 5;
                const sr = drawR + 8 + Math.sin(this.pulse * 3 + i) * 3;
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(sa) * sr, this.y + Math.sin(sa) * sr, 2.5, 0, TAU);
                ctx.stroke();
            }
            ctx.globalAlpha = alpha;
            // diamond shape inside
            ctx.fillStyle = bColor;
            ctx.globalAlpha = alpha * 0.4;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - drawR * 0.6);
            ctx.lineTo(this.x + drawR * 0.4, this.y);
            ctx.lineTo(this.x, this.y + drawR * 0.6);
            ctx.lineTo(this.x - drawR * 0.4, this.y);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = alpha;
            // pulsing outer
            ctx.strokeStyle = bColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, drawR + 12 + Math.sin(this.pulse * 2) * 4, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // multiplier — golden star burst pattern
        if (this.type === 'multiplier') {
            const mPulse = 0.5 + Math.sin(this.pulse * 3) * 0.3;
            ctx.strokeStyle = `rgba(255,220,50,${mPulse})`;
            ctx.lineWidth = 1.5;
            // radiating arrows outward
            for (let i = 0; i < 6; i++) {
                const ma = this.pulse * 0.8 + i * TAU / 6;
                const r1 = drawR * 0.5;
                const r2 = drawR + 6;
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(ma) * r1, this.y + Math.sin(ma) * r1);
                ctx.lineTo(this.x + Math.cos(ma) * r2, this.y + Math.sin(ma) * r2);
                ctx.stroke();
                // arrowhead
                const ax = this.x + Math.cos(ma) * r2;
                const ay = this.y + Math.sin(ma) * r2;
                ctx.beginPath();
                ctx.arc(ax, ay, 2, 0, TAU);
                ctx.fillStyle = `rgba(255,220,50,${mPulse})`;
                ctx.fill();
            }
            // inner multiply symbol
            ctx.strokeStyle = 'rgba(255,240,100,0.7)';
            ctx.lineWidth = 2;
            const ms = drawR * 0.3;
            ctx.beginPath();
            ctx.moveTo(this.x - ms, this.y - ms); ctx.lineTo(this.x + ms, this.y + ms);
            ctx.moveTo(this.x + ms, this.y - ms); ctx.lineTo(this.x - ms, this.y + ms);
            ctx.stroke();
        }

        // boss visual — multi-ring aura, phase-based color shifts
        if (this.type === 'boss') {
            const phase = this.bossPhase || 0;
            const phaseColors = ['#44ddff', '#ffaa22', '#ff2244'];
            const pc = phaseColors[phase];

            // rotating outer rings
            for (let r = 0; r < 3; r++) {
                const ringR = drawR + 10 + r * 8 + Math.sin(this.pulse * (2 + r)) * 3;
                const ringA = 0.3 - r * 0.08;
                ctx.strokeStyle = pc;
                ctx.globalAlpha = alpha * ringA;
                ctx.lineWidth = 2 - r * 0.5;
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringR, this.pulse * (1 + r * 0.3), this.pulse * (1 + r * 0.3) + Math.PI * 1.5);
                ctx.stroke();
            }
            ctx.globalAlpha = alpha;

            // inner cross pattern (rotates)
            ctx.strokeStyle = pc;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = alpha * 0.5;
            for (let i = 0; i < 4; i++) {
                const ca = this.pulse * 0.8 + i * Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(ca) * drawR * 0.3, this.y + Math.sin(ca) * drawR * 0.3);
                ctx.lineTo(this.x + Math.cos(ca) * drawR * 0.8, this.y + Math.sin(ca) * drawR * 0.8);
                ctx.stroke();
            }
            ctx.globalAlpha = alpha;

            // phase indicator dots
            for (let i = 0; i < 3; i++) {
                const dotA = -Math.PI / 2 + i * (Math.PI / 4) - Math.PI / 4;
                const dotR = drawR + 20;
                ctx.fillStyle = i <= phase ? pc : '#333';
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(dotA) * dotR, this.y + Math.sin(dotA) * dotR, 3, 0, TAU);
                ctx.fill();
            }

            // pulsing danger aura in enraged/desperate
            if (phase >= 1) {
                const da = 0.05 + Math.sin(this.pulse * 4) * 0.03;
                ctx.strokeStyle = `rgba(255,${phase >= 2 ? 34 : 170},${phase >= 2 ? 68 : 34},${da})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, drawR + 25 + Math.sin(this.pulse * 3) * 5, 0, TAU);
                ctx.stroke();
            }
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
        if (this.type === 'healer') {
            ctx.fillStyle = '#44ff88';
            ctx.fillText('💚', this.x, this.y - this.radius - 3);
        }
        if (this.type === 'shield') {
            ctx.fillStyle = '#44bbff';
            ctx.fillText('🛡', this.x, this.y - this.radius - 3);
        }
        if (this.type === 'teleporter') {
            ctx.fillStyle = '#bb44ff';
            ctx.fillText('🌀', this.x, this.y - this.radius - 3);
        }
        if (this.type === 'splitter') {
            ctx.fillStyle = '#ff66cc';
            ctx.fillText('÷', this.x, this.y - this.radius - 3);
        }
        if (this.type === 'multiplier') {
            ctx.fillStyle = '#ffdd33';
            ctx.fillText('✦', this.x, this.y - this.radius - 3);
        }
        if (this.type === 'powerup' && this.bonus) {
            ctx.fillStyle = this.bonus.color;
            ctx.fillText(this.bonus.icon, this.x, this.y - this.radius - 3);
        }
        if (this.type === 'boss') {
            const phaseColors = ['#44ddff', '#ffaa22', '#ff2244'];
            ctx.fillStyle = phaseColors[this.bossPhase || 0];
            ctx.fillText('👑', this.x, this.y - this.radius - 3);
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
    modifier: null,    // active level modifier
    isBossLevel: false,
    formation: null,   // target formation type
    world: 0,          // current world theme (0-4)

    // ── Level modifiers ──
    modifiers: [
        { id: 'fog',       name: 'ТУМАН',       icon: '🌫', desc: 'видимость ограничена', color: '#8899bb' },
        { id: 'speed',     name: 'СКОРОСТЬ',    icon: '💨', desc: 'цели двигаются быстрее', color: '#ffaa44' },
        { id: 'maze',      name: 'ЛАБИРИНТ',    icon: '🧱', desc: 'больше стен', color: '#aa8866' },
        { id: 'bounty',    name: 'ЩЕДРОСТЬ',    icon: '💰', desc: 'x2 монеты, +1 HP целей', color: '#ffdd44' },
        { id: 'tiny',      name: 'МЕЛКИЕ',      icon: '🔬', desc: 'маленькие цели', color: '#88ddff' },
        { id: 'giant',     name: 'ГИГАНТЫ',     icon: '🦣', desc: 'большие, но мало', color: '#ff8866' },
        { id: 'swarm',     name: 'РОЙ',         icon: '🐝', desc: 'много целей, мало HP', color: '#aaff44' },
        { id: 'fortress',  name: 'КРЕПОСТЬ',    icon: '🏰', desc: 'все бронированные', color: '#6688cc' },
    ],

    // ── Target formations ──
    formations: ['random', 'circle', 'vshape', 'grid', 'diagonal', 'cross'],

    pickModifier(num) {
        if (num < 3) return null;
        if (num % 5 === 0) return null; // boss levels have no modifier
        if (Math.random() < 0.35) return null; // 35% chance no modifier
        return this.modifiers[randInt(0, this.modifiers.length - 1)];
    },

    pickFormation(num) {
        if (num < 2) return 'random';
        if (num % 5 === 0) return 'circle'; // boss levels always circle
        if (Math.random() < 0.4) return 'random';
        return this.formations[randInt(0, this.formations.length - 1)];
    },

    generate(num, W, H) {
        this.levelNum = num;
        this.walls = [];
        this.borderWalls = [];
        this.innerWalls = [];
        this.targets = [];
        this.coins = [];
        this.shockwaveQueue = [];

        // determine world theme (changes every 5 levels)
        this.world = Math.floor((num - 1) / 5);

        // boss level every 5 levels
        this.isBossLevel = num >= 5 && num % 5 === 0;

        // pick modifier and formation
        this.modifier = this.pickModifier(num);
        this.formation = this.pickFormation(num);

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
        let wallCount = Math.min(1 + Math.floor(num / 2), 10);
        if (this.modifier && this.modifier.id === 'maze') wallCount = Math.min(wallCount + 4, 14);
        if (this.isBossLevel) wallCount = Math.max(1, Math.floor(wallCount * 0.5)); // fewer walls for boss
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
        // modifier adjustments
        const mod = this.modifier;
        let targetCount;
        if (this.isBossLevel) {
            targetCount = Math.min(2 + Math.floor(num * 0.3), 6); // fewer targets + boss
        } else if (mod && mod.id === 'swarm') {
            targetCount = Math.min(4 + Math.floor(num * 1.2), 16);
        } else if (mod && mod.id === 'giant') {
            targetCount = Math.max(2, Math.min(1 + Math.floor(num * 0.5), 6));
        } else {
            targetCount = Math.min(2 + Math.floor(num * 0.8), 12);
        }

        let movingChance = num <= 2 ? 0 : num <= 4 ? 0.3 : num <= 7 ? 0.5 : 0.7;
        if (mod && mod.id === 'speed') movingChance = Math.min(movingChance + 0.4, 0.9);
        const blinkChance = num <= 5 ? 0 : num <= 8 ? 0.2 : 0.35;

        const targetColors = [
            hsl((hueBase + 120) % 360, 90, 60),
            hsl((hueBase + 200) % 360, 90, 60),
            hsl((hueBase + 280) % 360, 90, 60),
            '#ff4466', '#44ff88', '#ffaa22', '#ff44ff'
        ];

        // ── Generate formation positions ──
        const formationPositions = this.generateFormation(this.formation, targetCount, pa);

        for (let i = 0; i < targetCount; i++) {
            let placed = false;
            for (let a = 0; a < 150; a++) {
                let tx, ty;
                // use formation position on first attempts, then fall back to random
                if (a < 3 && formationPositions && i < formationPositions.length) {
                    tx = formationPositions[i].x + rand(-10, 10);
                    ty = formationPositions[i].y + rand(-10, 10);
                } else {
                    tx = rand(pa.x + 40, pa.x + pa.w - 40);
                    ty = rand(pa.y + 30, pa.y + pa.h - 140);
                }
                let tr = rand(15, 20);
                if (mod && mod.id === 'tiny') tr = rand(9, 13);
                if (mod && mod.id === 'giant') tr = rand(22, 30);

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

                if (mod && mod.id === 'fortress') {
                    type = 'armored';
                    hp = 2 + Math.floor(num / 5);
                    baseScore = 20;
                } else {
                    const roll = Math.random();
                    const isMoving = roll < movingChance;
                    const isBlinking = !isMoving && roll < movingChance + blinkChance;
                    const isExplosive = !isMoving && !isBlinking && num >= 3 && Math.random() < 0.12;
                    const isHealer = !isMoving && !isBlinking && !isExplosive && num >= 5 && Math.random() < 0.12;
                    const isTeleporter = !isMoving && !isBlinking && !isExplosive && !isHealer && num >= 4 && Math.random() < 0.15;
                    const isShield = !isMoving && !isBlinking && !isExplosive && !isHealer && !isTeleporter && num >= 7 && Math.random() < 0.12;
                    const isSplitter = !isMoving && !isBlinking && !isExplosive && !isHealer && !isTeleporter && !isShield && num >= 6 && Math.random() < 0.15;
                    const isMultiplier = !isMoving && !isBlinking && !isExplosive && !isHealer && !isTeleporter && !isShield && !isSplitter && num >= 3 && Math.random() < 0.12;

                    if (isExplosive) {
                        type = 'explosive';
                        baseScore = 15;
                    } else if (isHealer) {
                        type = 'healer';
                        hp = 2;
                        baseScore = 25;
                    } else if (isShield) {
                        type = 'shield';
                        hp = 2;
                        baseScore = 30;
                    } else if (isTeleporter) {
                        type = 'teleporter';
                        hp = 2;
                        baseScore = 20;
                    } else if (isSplitter) {
                        type = 'splitter';
                        hp = 1;
                        baseScore = 15;
                    } else if (isMultiplier) {
                        type = 'multiplier';
                        hp = 1;
                        baseScore = 20;
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
                }

                // modifier HP/score adjustments
                if (mod && mod.id === 'bounty') hp = Math.max(hp, 2);
                if (mod && mod.id === 'swarm') { hp = 1; baseScore = Math.floor(baseScore * 0.7); }
                if (mod && mod.id === 'giant') { hp += 1; baseScore = Math.floor(baseScore * 1.5); }

                // speed modifier: force moving on more targets
                if (mod && mod.id === 'speed' && type === 'normal') {
                    type = 'moving';
                    baseScore *= 2;
                }

                const score = baseScore + Math.floor(num / 3) * 5;

                const t = new Target(tx, ty, tr, hp,
                    targetColors[i % targetColors.length], score, type);
                // speed modifier: faster movement
                if (mod && mod.id === 'speed' && t.type === 'moving') {
                    t.moveSpeed *= 1.8;
                    t.moveRange *= 1.3;
                }
                this.targets.push(t);
                placed = true;
                break;
            }

            if (!placed) {
                for (let a = 0; a < 80; a++) {
                    const tx = rand(pa.x + 40, pa.x + pa.w - 40);
                    const ty = rand(pa.y + 30, pa.y + pa.h - 140);
                    const tr = (mod && mod.id === 'tiny') ? 11 : (mod && mod.id === 'giant') ? 26 : 16;
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

        // ── Generate boss target ──
        if (this.isBossLevel) {
            this.generateBoss(num, pa, hueBase, W, H);
        }

        // ── Generate powerup targets ──
        // boss levels: 3 powerups (гарантированно +выстрелы, +урон, +ещё),  обычные: 1
        if (num >= 4) {
            const allBonuses = [
                { id: 'extraShots', name: '+1 СНАРЯД', color: '#44ffaa', icon: '🔫' },
                { id: 'extraShots2', name: '+2 СНАРЯДА', color: '#44ffaa', icon: '🔫🔫' },
                { id: 'dmgBoost', name: 'УРОН x2', color: '#ff4466', icon: '💥' },
                { id: 'maxBounce', name: 'МАКС РИКОШЕТ', color: '#44ccff', icon: '↗' },
                { id: 'magnetBoost', name: 'МАГНИТ', color: '#bb66ff', icon: '🧲' },
            ];

            let powerupList;
            if (this.isBossLevel) {
                // босс: гарантированно +2 снаряда, урон x2 и ещё один случайный
                powerupList = [
                    allBonuses[1], // +2 СНАРЯДА
                    allBonuses[2], // УРОН x2
                    allBonuses[randInt(0, allBonuses.length - 1)],
                ];
            } else {
                powerupList = [allBonuses[randInt(0, allBonuses.length - 1)]];
            }

            for (const bonus of powerupList) {
                for (let a = 0; a < 80; a++) {
                    const px = rand(pa.x + 50, pa.x + pa.w - 50);
                    const py = rand(pa.y + 40, pa.y + pa.h - 150);
                    let blocked = false;
                    for (const w of this.walls) {
                        if (px + 20 > w.x && px - 20 < w.x + w.w &&
                            py + 20 > w.y && py - 20 < w.y + w.h) { blocked = true; break; }
                    }
                    if (blocked) continue;
                    for (const ot of this.targets) {
                        if (dist(px, py, ot.x, ot.y) < 40) { blocked = true; break; }
                    }
                    if (blocked) continue;
                    if (dist(px, py, this.playerStart.x, this.playerStart.y) < 100) continue;

                    const pt = new Target(px, py, 14, 1, bonus.color, 15, 'powerup');
                    pt.bonus = bonus;
                    this.targets.push(pt);
                    break;
                }
            }
        }

        // ── Generate coin pickups ──
        // boss levels: больше монет
        let coinCount = Math.min(2 + Math.floor(num / 2), 6);
        if (this.isBossLevel) coinCount = Math.min(coinCount + 4, 10);
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
                const coinValue = this.isBossLevel
                    ? 10 + num * 3 + randInt(5, 15)
                    : 5 + num * 2 + randInt(0, 5);
                this.coins.push({
                    x: cx, y: cy, radius: 8,
                    value: coinValue,
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

    // ── Formation position generators ──
    generateFormation(type, count, pa) {
        const cx = pa.x + pa.w / 2;
        const cy = pa.y + pa.h * 0.35;
        const positions = [];

        if (type === 'circle') {
            const radius = Math.min(pa.w, pa.h) * 0.25;
            for (let i = 0; i < count; i++) {
                const a = (i / count) * TAU - Math.PI / 2;
                positions.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
            }
        } else if (type === 'vshape') {
            const spread = pa.w * 0.35;
            const depth = pa.h * 0.3;
            for (let i = 0; i < count; i++) {
                const t = i / Math.max(count - 1, 1);
                const side = i % 2 === 0 ? -1 : 1;
                const row = Math.floor(i / 2);
                const rowT = row / Math.max(Math.floor(count / 2), 1);
                positions.push({
                    x: cx + side * rowT * spread,
                    y: pa.y + 40 + rowT * depth
                });
            }
        } else if (type === 'grid') {
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);
            const gw = pa.w * 0.6;
            const gh = pa.h * 0.4;
            for (let i = 0; i < count; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                positions.push({
                    x: cx - gw / 2 + (col + 0.5) * (gw / cols),
                    y: pa.y + 50 + (row + 0.5) * (gh / rows)
                });
            }
        } else if (type === 'diagonal') {
            const startX = pa.x + pa.w * 0.15;
            const startY = pa.y + 40;
            const endX = pa.x + pa.w * 0.85;
            const endY = pa.y + pa.h * 0.55;
            for (let i = 0; i < count; i++) {
                const t = i / Math.max(count - 1, 1);
                positions.push({
                    x: lerp(startX, endX, t),
                    y: lerp(startY, endY, t)
                });
            }
        } else if (type === 'cross') {
            const armLen = Math.min(pa.w, pa.h) * 0.25;
            // center
            positions.push({ x: cx, y: cy });
            // distribute remaining on 4 arms
            for (let i = 1; i < count; i++) {
                const arm = (i - 1) % 4;
                const step = Math.floor((i - 1) / 4) + 1;
                const d = step * (armLen / 3);
                const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
                positions.push({
                    x: cx + Math.cos(angles[arm]) * d,
                    y: cy + Math.sin(angles[arm]) * d
                });
            }
        } else {
            return null; // random placement
        }
        return positions;
    },

    // ── Boss target generator ──
    generateBoss(num, pa, hueBase, W, H) {
        const cx = pa.x + pa.w / 2;
        const cy = pa.y + pa.h * 0.3;
        const bossRadius = 28 + Math.floor(num / 5) * 2;
        // boss HP: 5 → 7 → 9 → 11... (scaled by world, not raw level)
        const bossHP = 5 + Math.floor(num / 5) * 2;
        const bossScore = 50 + num * 10;
        const bossColor = hsl((hueBase + 180) % 360, 100, 55);

        const boss = new Target(cx, cy, bossRadius, bossHP, bossColor, bossScore, 'boss');
        boss.maxHp = bossHP;
        boss.bossPhase = 0; // 0=normal, 1=enraged, 2=desperate
        boss.moveSpeed = 30 + num * 2;
        boss.moveRange = 40 + num * 3;
        boss.moveAngle = 0;
        boss.movePattern = 0;
        // boss moves in figure-8
        boss.originX = cx;
        boss.originY = cy;
        this.targets.push(boss);
    },

    // ── Fog of war drawing ──
    drawFog(ctx, W, H) {
        if (!this.modifier || this.modifier.id !== 'fog') return;
        // dark overlay with holes around player and active bullets
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,10,0.85)';
        ctx.fillRect(0, 0, W, H);

        // cut out visibility circles
        ctx.globalCompositeOperation = 'destination-out';
        // player visibility
        const pr = 140;
        const pg = ctx.createRadialGradient(Player.x, Player.y, 0, Player.x, Player.y, pr);
        pg.addColorStop(0, 'rgba(0,0,0,1)');
        pg.addColorStop(0.7, 'rgba(0,0,0,0.8)');
        pg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(Player.x - pr, Player.y - pr, pr * 2, pr * 2);

        // bullet visibility
        for (const b of Player.bullets) {
            const br = 100;
            const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, br);
            bg.addColorStop(0, 'rgba(0,0,0,1)');
            bg.addColorStop(0.6, 'rgba(0,0,0,0.6)');
            bg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bg;
            ctx.fillRect(b.x - br, b.y - br, br * 2, br * 2);
        }
        ctx.restore();
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
