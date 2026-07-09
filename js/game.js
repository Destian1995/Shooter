// ── Main game controller ──

const Game = {
    canvas: null, ctx: null,
    W: 0, H: 0,
    state: 'menu', // menu, playing, upgrade, gameover, leaderboard, nameinput
    inputName: '',
    time: 0,
    score: 0,
    coins: 0,
    coinMultiplier: 1, // grows with level
    highScore: 0,
    highLevel: 0,
    levelNum: 1,
    levelScore: 0,
    levelCoins: 0,
    touching: false,
    touchX: 0, touchY: 0,
    gridHue: 0,
    targetGridHue: 0,
    zoom: 1, // масштаб уровня (1 = обычный, меньше = дальше камера)
    combo: 0,
    comboTimer: 0,
    comboTexts: [], // floating combo texts
    killTexts: [],  // floating score texts

    init() {
        this.canvas = document.getElementById('game');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // звук
        Sound.init();

        // load records only (progress resets each run)
        this.highScore = parseInt(localStorage.getItem('rs_highScore') || '0');
        this.highLevel = parseInt(localStorage.getItem('rs_highLevel') || '0');

        // input
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // клавиатура для ввода имени
        window.addEventListener('keydown', (e) => {
            if (this.state !== 'nameinput') return;
            if (e.key === 'Backspace') {
                this.inputName = this.inputName.slice(0, -1);
            } else if (e.key === 'Enter') {
                const name = this.inputName.trim() || 'Игрок';
                Leaderboard.addRecord(name, this.score, this.levelNum);
                this.state = 'gameover';
                UI.buttons = [];
            } else if (e.key.length === 1 && this.inputName.length < 12) {
                this.inputName += e.key.toUpperCase();
            }
        });

        // start loop
        let last = performance.now();
        const loop = (now) => {
            const rawDt = Math.min((now - last) / 1000, 0.05);
            last = now;
            const timeScale = Particles.getTimeScale();
            const dt = rawDt * timeScale;
            this.update(dt, rawDt);
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.W = window.innerWidth;
        this.H = window.innerHeight;
        this.canvas.width = this.W * dpr;
        this.canvas.height = this.H * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    save() {
        localStorage.setItem('rs_highScore', this.highScore);
        localStorage.setItem('rs_highLevel', this.highLevel);
    },

    startGame() {
        this.score = 0;
        this.coins = 0;
        this.coinMultiplier = 1;
        this.levelNum = 1;
        this.combo = 0;
        this.comboTimer = 0;
        this.comboTexts = [];
        this.killTexts = [];
        Player.upgrades = { bounces: 0, damage: 0, speed: 0, shots: 0, piercing: 0, predict: 0, crit: 0, magnet: 0 };
        Player.applyUpgrades();
        this.startLevel();
    },

    startLevel() {
        // масштаб уменьшается с уровнем: 1.0 → 0.85 → 0.72 → ... мин 0.45
        this.zoom = Math.max(0.45, 1.0 - (this.levelNum - 1) * 0.04);

        // виртуальный размер мира (больше экрана при маленьком zoom)
        const vW = Math.floor(this.W / this.zoom);
        const vH = Math.floor(this.H / this.zoom);

        Level.generate(this.levelNum, vW, vH);
        Player.init(Level.playerStart.x, Level.playerStart.y);
        Particles.clear();
        this.state = 'playing';
        this.targetGridHue = (this.levelNum * 47) % 360;
        this.combo = 0;
        this.comboTimer = 0;
        this.comboTexts = [];
        this.killTexts = [];
    },

    completeLevel() {
        // coin multiplier grows every 3 levels
        this.coinMultiplier = 1 + Math.floor((this.levelNum - 1) / 3) * 0.5;

        // base completion reward + shot bonus (kill score already added in onTargetKill)
        this.levelScore = 10 + this.levelNum * 5;
        const shotBonus = Player.shotsLeft * 10;
        this.levelScore += shotBonus;

        this.levelCoins = Math.floor((10 + this.levelNum * 8 + Player.shotsLeft * 5) * this.coinMultiplier);

        this.score += this.levelScore;
        this.coins += this.levelCoins;

        if (this.score > this.highScore) this.highScore = this.score;
        if (this.levelNum > this.highLevel) this.highLevel = this.levelNum;

        Sound.levelComplete();

        // celebration explosion
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const ex = rand(this.W * 0.2, this.W * 0.8);
                const ey = rand(this.H * 0.2, this.H * 0.6);
                Particles.explosion(ex, ey, hsl(rand(0, 360), 100, 65), 0.8);
            }, i * 150);
        }
        Particles.flash('#ffcc00', 0.5);

        this.save();
        this.state = 'upgrade';
        UI.buttons = [];
    },

    gameOver() {
        if (this.score > this.highScore) this.highScore = this.score;
        if (this.levelNum > this.highLevel) this.highLevel = this.levelNum;

        Sound.gameOver();

        // death explosion
        Particles.explosion(Player.x, Player.y, '#ff3333', 1.5);
        Particles.flash('#ff0000', 0.6);
        Shake.trigger(15);

        this.save();

        // если рекорд — экран ввода имени, иначе — конец игры
        if (Leaderboard.isHighScore(this.score)) {
            this.inputName = '';
            this.state = 'nameinput';
        } else {
            this.state = 'gameover';
        }
        UI.buttons = [];
    },

    collectCoin(coin) {
        Sound.coin();
        const value = Math.floor(coin.value * this.coinMultiplier);
        this.coins += value;
        this.killTexts.push({
            x: coin.x, y: coin.baseY - 10,
            text: `+${value}$`,
            life: 0.8, maxLife: 0.8,
            color: '#ffdd44'
        });
        Particles.burst(coin.x, coin.baseY, 8, '#ffdd44', 100, 3, 0.3, 8);
    },

    onTargetKill(target, bounces, pierceCount, isCrit, hasShockwave) {
        this.combo++;
        this.comboTimer = 2;
        Sound.kill();

        const comboMult = Math.min(this.combo, 5);
        let totalScore = target.score * comboMult;
        let floatY = 0;

        // base score text
        this.killTexts.push({
            x: target.x, y: target.y,
            text: `+${totalScore}`,
            life: 1.2, maxLife: 1.2,
            color: target.color
        });
        floatY += 22;

        // ── ARMORED KILL → bonus shot ──
        if (target.maxHp >= 2) {
            Player.shotsLeft++;
            Sound.bonusShot();
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: '+1 ВЫСТРЕЛ!',
                life: 1.8, maxLife: 1.8,
                color: '#88ddff'
            });
            floatY += 22;
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.4,
                text: '+1 ВЫСТРЕЛ!',
                life: 1.5, maxLife: 1.5,
                color: '#88ddff',
                size: 26
            });
        }

        // ── DOUBLE KILL bonus ──
        if (pierceCount >= 2) {
            const dkBonus = target.score * 2;
            totalScore += dkBonus;
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: `ДВОЙНОЕ! +${dkBonus}`,
                life: 1.5, maxLife: 1.5,
                color: '#ff44ff'
            });
            floatY += 22;
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.28,
                text: 'ДВОЙНОЕ УБИЙСТВО!',
                life: 1.8, maxLife: 1.8,
                color: '#ff44ff',
                size: 32
            });
            Particles.explosion(target.x, target.y, '#ff44ff', 1.0);
            Particles.flash('#ff44ff', 0.3);
            Shake.trigger(10);
        }

        // ── RICOCHET BONUS: 4+ bounces ──
        if (bounces >= 4 && bounces < 7) {
            const ricBonus = target.score * 3;
            totalScore += ricBonus;
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: `РИКОШЕТ x${bounces} +${ricBonus}`,
                life: 1.8, maxLife: 1.8,
                color: '#00ffaa'
            });
            floatY += 22;
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.22,
                text: `РИКОШЕТ x${bounces}!`,
                life: 2.0, maxLife: 2.0,
                color: '#00ffaa',
                size: 30
            });
            Particles.explosion(target.x, target.y, '#00ffaa', 1.2);
            Particles.flash('#00ffaa', 0.3);
            Shake.trigger(10);
        }

        // ── SUPER RICOCHET BONUS: 7+ bounces ──
        if (bounces >= 7) {
            const superBonus = target.score * 7;
            totalScore += superBonus;
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: `СУПЕР РИКОШЕТ!! +${superBonus}`,
                life: 2.5, maxLife: 2.5,
                color: '#ffdd00'
            });
            floatY += 22;
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.18,
                text: 'СУПЕР РИКОШЕТ!!!',
                life: 2.5, maxLife: 2.5,
                color: '#ffdd00',
                size: 38
            });
            for (let i = 0; i < 3; i++) {
                Particles.explosion(
                    target.x + rand(-30, 30), target.y + rand(-30, 30),
                    hsl(rand(30, 60), 100, 60), 1.5);
            }
            Particles.flash('#ffdd00', 0.5);
            Particles.triggerSlowmo(0.5);
            Shake.trigger(18);
        }

        // ── Moving / blinking x2 badge ──
        if (target.type === 'moving' || target.type === 'blinking') {
            this.killTexts.push({
                x: target.x + 30, y: target.y - floatY,
                text: 'x2!',
                life: 1.0, maxLife: 1.0,
                color: '#ffcc00'
            });
            Particles.explosion(target.x, target.y, '#ffcc00', 0.6);
        }

        // ── Combo text ──
        if (this.combo >= 2) {
            Sound.combo(this.combo);
            const comboNames = ['', '', 'ДУБЛЬ!', 'ТРИПЛ!', 'УЛЬТРА!', 'МЕГА!!', 'БЕЗУМИЕ!!!'];
            const name = this.combo < comboNames.length ? comboNames[this.combo] : `x${this.combo} КОМБО!!!`;
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.35,
                text: name,
                life: 1.5, maxLife: 1.5,
                color: hsl((this.combo * 60) % 360, 100, 65),
                size: 28 + this.combo * 4
            });
            Particles.explosion(target.x, target.y, '#ffcc00', 0.5 + this.combo * 0.3);
        }

        // ── Crit bonus ──
        if (isCrit) {
            Sound.crit();
            const critBonus = target.score * 2;
            totalScore += critBonus;
            this.killTexts.push({
                x: target.x + rand(-20, 20), y: target.y - floatY,
                text: `КРИТ! +${critBonus}`,
                life: 1.5, maxLife: 1.5,
                color: '#ff2244'
            });
            floatY += 22;
        }

        // ── Explosive target: massive area blast ──
        if (target.type === 'explosive') {
            Sound.explosion();
            const blastRadius = 100 + Player.stats.damage * 15;
            // big custom explosion
            for (let i = 0; i < 4; i++) {
                Particles.explosion(
                    target.x + rand(-15, 15), target.y + rand(-15, 15),
                    '#ff6622', 1.5);
            }
            Particles.shockwave(target.x, target.y, '#ff8833', blastRadius);
            Particles.flash('#ff4400', 0.5);
            Shake.trigger(20);
            Particles.triggerSlowmo(0.4);

            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.25,
                text: 'ВЗРЫВ!!!',
                life: 2.0, maxLife: 2.0,
                color: '#ff6622',
                size: 36
            });

            // kill everything in blast radius
            for (const t of Level.targets) {
                if (!t.alive || t === target) continue;
                if (dist(target.x, target.y, t.x, t.y) < blastRadius + t.radius) {
                    Level.shockwaveQueue.push({
                        target: t,
                        delay: dist(target.x, target.y, t.x, t.y) / 500,
                        srcX: target.x, srcY: target.y,
                        radius: blastRadius,
                    });
                }
            }
        } else if (hasShockwave) {
            // ── Ударная волна (только первый снаряд уровня) ──
            const swRadius = Level.processShockwave(target.x, target.y, target, Player.stats.damage);
            Particles.shockwave(target.x, target.y, target.color, swRadius * 0.8);
        }

        // ── Splitter: spawn 2 smaller targets ──
        if (target.type === 'splitter' && !target.hasSplit) {
            target.hasSplit = true;
            for (let i = 0; i < 2; i++) {
                const off = (i === 0 ? -1 : 1) * 25;
                const st = new Target(
                    target.x + off, target.y + rand(-15, 15),
                    target.radius * 0.6, 1,
                    '#ff88cc', Math.floor(target.score * 0.5), 'normal'
                );
                st.spawnAnim = 0.5;
                Level.targets.push(st);
            }
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: 'ДЕЛЕНИЕ!',
                life: 1.2, maxLife: 1.2,
                color: '#ff66cc'
            });
            Particles.burst(target.x, target.y, 12, '#ff88cc', 150, 4, 0.4, 8);
        }

        // ── Shield death: unshield all ──
        if (target.type === 'shield') {
            for (const t of Level.targets) t.shielded = false;
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.3,
                text: 'ЩИТ СНЯТ!',
                life: 1.5, maxLife: 1.5,
                color: '#44bbff',
                size: 26
            });
        }

        // ── Healer kill bonus ──
        if (target.type === 'healer') {
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.3,
                text: 'ЛЕКАРЬ УБИТ!',
                life: 1.5, maxLife: 1.5,
                color: '#44ff88',
                size: 26
            });
        }

        // add bonus score and coins
        this.score += totalScore;
        this.coins += Math.floor(totalScore / 8 * this.coinMultiplier);
    },

    // called when a target is killed by shockwave chain
    onShockwaveKill(target) {
        Sound.shockwave();
        this.combo++;
        this.comboTimer = 2;

        const totalScore = target.score * 2; // shockwave kills give x2

        Particles.explosion(target.x, target.y, target.color, 1.0);
        Particles.flash(target.color, 0.2);
        Shake.trigger(8);

        this.killTexts.push({
            x: target.x, y: target.y,
            text: `+${totalScore}`,
            life: 1.2, maxLife: 1.2,
            color: target.color
        });
        this.killTexts.push({
            x: target.x, y: target.y - 22,
            text: 'ВОЛНА!',
            life: 1.5, maxLife: 1.5,
            color: '#ff8844'
        });
        this.comboTexts.push({
            x: this.W / 2, y: this.H * 0.3,
            text: 'УДАРНАЯ ВОЛНА!',
            life: 1.5, maxLife: 1.5,
            color: '#ff8844',
            size: 28
        });

        this.score += totalScore;
        this.coins += Math.floor(totalScore / 8 * this.coinMultiplier);

        // chain: this kill also produces a shockwave
        Level.processShockwave(target.x, target.y, target, Player.stats.damage);
        Particles.shockwave(target.x, target.y, '#ff8844', 30 + Player.stats.damage * 15);
    },

    // ── Input ──
    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    },

    onTouchStart(e) {
        e.preventDefault();
        const p = this.getPos(e);
        this.handleInputStart(p.x, p.y);
    },
    onTouchMove(e) {
        e.preventDefault();
        const p = this.getPos(e);
        this.handleInputMove(p.x, p.y);
    },
    onTouchEnd(e) {
        e.preventDefault();
        this.handleInputEnd();
    },
    onMouseDown(e) {
        const p = this.getPos(e);
        this.handleInputStart(p.x, p.y);
    },
    onMouseMove(e) {
        if (this.touching) {
            const p = this.getPos(e);
            this.handleInputMove(p.x, p.y);
        }
    },
    onMouseUp(e) {
        this.handleInputEnd();
    },

    handleInputStart(x, y) {
        this.touching = true;
        this.touchX = x;
        this.touchY = y;
        Sound.unlock();

        if (this.state !== 'playing') {
            const btn = UI.handleClick(x, y);
            if (btn) {
                Sound.click();
                if (btn.action === 'play') this.startGame();
                else if (btn.action === 'next') { this.levelNum++; this.startLevel(); }
                else if (btn.action === 'restart') this.startGame();
                else if (btn.action === 'leaderboard') { this.state = 'leaderboard'; UI.buttons = []; }
                else if (btn.action === 'about') { this.state = 'about'; UI.buttons = []; }
                else if (btn.action === 'back') { this.state = 'menu'; UI.buttons = []; }
                else if (btn.action === 'openVK') { window.open('https://vk.com/destianfarbius', '_blank'); }
                else if (btn.action === 'openTG') { window.open('https://t.me/K_DestianF', '_blank'); }
                else if (btn.action === 'clearRecords') { Leaderboard.clear(); }
                else if (btn.action === 'upgrade') {
                    if (this.coins >= btn.cost) {
                        this.coins -= btn.cost;
                        Player.upgrades[btn.key]++;
                        Player.applyUpgrades();
                    }
                }
                else if (btn.action === 'key') {
                    if (btn.key === '←') {
                        this.inputName = this.inputName.slice(0, -1);
                    } else if (btn.key === '_') {
                        if (this.inputName.length < 12) this.inputName += ' ';
                    } else {
                        if (this.inputName.length < 12) this.inputName += btn.key;
                    }
                }
                else if (btn.action === 'saveName') {
                    const name = this.inputName.trim() || 'Игрок';
                    Leaderboard.addRecord(name, this.score, this.levelNum);
                    this.state = 'gameover';
                    UI.buttons = [];
                }
            }
            return;
        }

        // кнопка звука в HUD
        if (UI._soundBtn && pointInRect(x, y, UI._soundBtn.x, UI._soundBtn.y, UI._soundBtn.w, UI._soundBtn.h)) {
            Sound.toggle();
            return;
        }

        // Start aiming — конвертируем экранные координаты в мировые
        Player.startAim(x / this.zoom, y / this.zoom);
    },

    handleInputMove(x, y) {
        this.touchX = x;
        this.touchY = y;
        if (this.state === 'playing' && Player.aiming) {
            Player.aim(x / this.zoom, y / this.zoom);
        }
    },

    handleInputEnd() {
        if (this.state === 'playing' && this.touching && Player.aiming) {
            // Shoot on release
            Player.shoot();
        }
        this.touching = false;
    },

    // ── Update ──
    update(dt, rawDt) {
        this.time += rawDt;
        Shake.update();

        // плавная смена оттенка фона
        if (this.targetGridHue !== undefined) {
            const diff = this.targetGridHue - this.gridHue;
            if (Math.abs(diff) > 1) {
                // кратчайший путь по кругу
                let d = ((this.targetGridHue - this.gridHue + 540) % 360) - 180;
                this.gridHue = (this.gridHue + d * rawDt * 2 + 360) % 360;
            }
        }

        // combo decay
        if (this.comboTimer > 0) {
            this.comboTimer -= rawDt;
            if (this.comboTimer <= 0) this.combo = 0;
        }

        // floating texts
        for (let i = this.killTexts.length - 1; i >= 0; i--) {
            const t = this.killTexts[i];
            t.life -= rawDt;
            t.y -= 40 * rawDt;
            if (t.life <= 0) this.killTexts.splice(i, 1);
        }
        for (let i = this.comboTexts.length - 1; i >= 0; i--) {
            const t = this.comboTexts[i];
            t.life -= rawDt;
            t.y -= 20 * rawDt;
            if (t.life <= 0) this.comboTexts.splice(i, 1);
        }

        if (this.state === 'playing') {
            Player.update(dt);
            Level.updateTargets(dt);
            Particles.update(rawDt);

            // ── Process shockwave kill queue ──
            for (let i = Level.shockwaveQueue.length - 1; i >= 0; i--) {
                const sw = Level.shockwaveQueue[i];
                sw.delay -= rawDt;
                if (sw.delay <= 0) {
                    Level.shockwaveQueue.splice(i, 1);
                    if (sw.target.alive) {
                        sw.target.killByShockwave();
                        this.onShockwaveKill(sw.target);
                    }
                }
            }

            // check win
            if (Level.allTargetsDead() && Level.shockwaveQueue.length === 0) {
                this.completeLevel();
            }

            // check lose - no shots, no bullets, not aiming, no pending shockwaves
            if (Player.shotsLeft <= 0 && Player.bullets.length === 0 && !Player.aiming
                && Level.shockwaveQueue.length === 0 && !Level.allTargetsDead()) {
                this.gameOver();
            }
        } else {
            Particles.update(rawDt);
        }
    },

    // ── Draw ──
    draw() {
        const ctx = this.ctx;
        const W = this.W, H = this.H;

        ctx.save();
        ctx.translate(Shake.x, Shake.y);

        if (this.state === 'menu') {
            UI.buttons = [];
            UI.drawMainMenu(ctx, W, H);
        } else if (this.state === 'playing') {
            ctx.save();
            ctx.scale(this.zoom, this.zoom);
            const vW = W / this.zoom, vH = H / this.zoom;
            this.drawBackground(ctx, vW, vH);
            Level.drawWalls(ctx);
            Level.drawCoins(ctx);
            Level.drawTargets(ctx);
            Player.draw(ctx);
            Particles.draw(ctx);
            Particles.drawFlash(ctx, vW, vH);
            this.drawFloatingTexts(ctx);
            this.drawAimHint(ctx, vW, vH);
            ctx.restore();
            // HUD поверх без zoom
            UI.drawHUD(ctx, W, H);
        } else if (this.state === 'upgrade') {
            ctx.save();
            ctx.scale(this.zoom, this.zoom);
            const vW2 = W / this.zoom, vH2 = H / this.zoom;
            this.drawBackground(ctx, vW2, vH2);
            Level.drawWalls(ctx);
            Particles.draw(ctx);
            Particles.drawFlash(ctx, vW2, vH2);
            ctx.restore();
            UI.drawUpgradeScreen(ctx, W, H);
        } else if (this.state === 'gameover') {
            ctx.save();
            ctx.scale(this.zoom, this.zoom);
            const vW3 = W / this.zoom, vH3 = H / this.zoom;
            this.drawBackground(ctx, vW3, vH3);
            Level.drawWalls(ctx);
            Particles.draw(ctx);
            Particles.drawFlash(ctx, vW3, vH3);
            ctx.restore();
            UI.drawGameOver(ctx, W, H);
        } else if (this.state === 'leaderboard') {
            UI.drawLeaderboard(ctx, W, H);
        } else if (this.state === 'about') {
            UI.drawAbout(ctx, W, H);
        } else if (this.state === 'nameinput') {
            this.drawBackground(ctx, W, H);
            Particles.draw(ctx);
            Particles.drawFlash(ctx, W, H);
            UI.drawNameInput(ctx, W, H);
        }

        ctx.restore();
    },

    drawAimHint(ctx, W, H) {
        // show "hold to aim, release to shoot" hint before first shot
        if (Player.hasShot || Player.aiming) return;

        const pulse = Math.sin(this.time * 4) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const hintColor = Player.getBulletColor().color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = hintColor;
        ctx.fillStyle = hintColor;
        ctx.font = 'bold 20px Arial';
        ctx.fillText('ЗАЖМИ ДЛЯ ПРИЦЕЛА', W / 2, H * 0.45);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#9999aa';
        ctx.fillText('отпусти чтобы выстрелить', W / 2, H * 0.45 + 28);
        ctx.shadowBlur = 0;

        // animated arrow pointing to player
        const arrowY = Player.y - 50 + Math.sin(this.time * 5) * 8;
        ctx.fillStyle = hintColor;
        ctx.beginPath();
        ctx.moveTo(Player.x, arrowY + 15);
        ctx.lineTo(Player.x - 8, arrowY);
        ctx.lineTo(Player.x + 8, arrowY);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 1;
    },

    drawFloatingTexts(ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // kill score texts
        for (const t of this.killTexts) {
            const a = t.life / t.maxLife;
            ctx.globalAlpha = a;
            ctx.shadowBlur = 10;
            ctx.shadowColor = t.color;
            ctx.fillStyle = t.color;
            ctx.font = 'bold 18px Arial';
            ctx.fillText(t.text, t.x, t.y);
        }

        // combo texts
        for (const t of this.comboTexts) {
            const a = t.life / t.maxLife;
            const scale = 1 + (1 - a) * 0.5;
            ctx.globalAlpha = a;
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.scale(scale, scale);
            ctx.shadowBlur = 20;
            ctx.shadowColor = t.color;
            ctx.fillStyle = t.color;
            ctx.font = `bold ${t.size}px Arial`;
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    },

    drawBackground(ctx, W, H) {
        // фон плавно меняется с уровнем
        // уровень влияет на: насыщенность, яркость, скорость сетки, кол-во эффектов
        const lvl = this.levelNum;
        const intensity = Math.min(lvl / 15, 1); // 0..1 от спокойного к интенсивному
        const bgSat = 10 + intensity * 25;
        const bgLight = 5 + intensity * 5;

        // двойной градиент — центр + углы разного цвета
        const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
        bgGrad.addColorStop(0, hsl(this.gridHue, bgSat, bgLight));
        bgGrad.addColorStop(0.6, hsl((this.gridHue + 30) % 360, bgSat * 0.7, bgLight * 0.6));
        bgGrad.addColorStop(1, hsl((this.gridHue + 60) % 360, 10, 2));
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // анимированная сетка — ускоряется с уровнем
        const gridSpeed = 5 + intensity * 15;
        const gridAlpha = 0.15 + intensity * 0.2;
        ctx.strokeStyle = hsl(this.gridHue, 30 + intensity * 20, 12 + intensity * 8, gridAlpha);
        ctx.lineWidth = 0.5;
        const gridSize = 40 - intensity * 10; // мельче с уровнем
        const offsetX = (this.time * gridSpeed) % gridSize;
        const offsetY = (this.time * gridSpeed * 0.4) % gridSize;
        for (let x = -gridSize + offsetX; x < W + gridSize; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = -gridSize + offsetY; y < H + gridSize; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // туманные пятна — появляются с 3 уровня, больше с прогрессом
        if (lvl >= 3) {
            const nebulaCount = Math.min(Math.floor(intensity * 5), 4);
            for (let i = 0; i < nebulaCount; i++) {
                const nx = W * (0.2 + Math.sin(this.time * 0.3 + i * 2.1) * 0.3);
                const ny = H * (0.3 + Math.cos(this.time * 0.2 + i * 1.7) * 0.25);
                const nr = W * (0.15 + intensity * 0.1);
                const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
                ng.addColorStop(0, hsl((this.gridHue + i * 90) % 360, 40, 15, 0.06 + intensity * 0.04));
                ng.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = ng;
                ctx.fillRect(0, 0, W, H);
            }
        }

        // плавающие звёзды-точки — больше с уровнем
        if (lvl >= 2) {
            const starCount = Math.floor(5 + intensity * 20);
            for (let i = 0; i < starCount; i++) {
                const seed = i * 7.31;
                const sx = (Math.sin(seed) * 0.5 + 0.5) * W;
                const sy = ((Math.cos(seed * 1.3) * 0.5 + 0.5 + this.time * 0.01 * (1 + (i % 3))) % 1) * H;
                const twinkle = Math.sin(this.time * 3 + seed) * 0.5 + 0.5;
                ctx.globalAlpha = twinkle * (0.1 + intensity * 0.15);
                ctx.fillStyle = hsl((this.gridHue + i * 20) % 360, 60, 70);
                ctx.beginPath();
                ctx.arc(sx, sy, 1 + twinkle, 0, TAU);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // пульсирующие лучи из центра — с 6 уровня
        if (lvl >= 6) {
            const rayCount = Math.min(3 + Math.floor(intensity * 5), 6);
            ctx.globalAlpha = 0.03 + intensity * 0.03;
            for (let i = 0; i < rayCount; i++) {
                const ra = this.time * 0.2 + i * TAU / rayCount;
                const rLen = W * 0.6;
                ctx.strokeStyle = hsl((this.gridHue + i * 40) % 360, 50, 40);
                ctx.lineWidth = 2 + intensity * 4;
                ctx.beginPath();
                ctx.moveTo(W / 2, H / 2);
                ctx.lineTo(W / 2 + Math.cos(ra) * rLen, H / 2 + Math.sin(ra) * rLen);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // виньетка при слоумо
        if (Particles.slowmo > 0) {
            const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.15, W / 2, H / 2, W * 0.7);
            vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
            vigGrad.addColorStop(1, `rgba(${30 + intensity * 40},20,${60 + intensity * 40},0.4)`);
            ctx.fillStyle = vigGrad;
            ctx.fillRect(0, 0, W, H);
        }

        // рамочное свечение краёв — интенсивнее с уровнем
        if (lvl >= 4) {
            const edgeGlow = 0.03 + intensity * 0.06;
            const edgeColor = hsl(this.gridHue, 60, 50, edgeGlow);
            // top
            const gt = ctx.createLinearGradient(0, 0, 0, 60);
            gt.addColorStop(0, edgeColor);
            gt.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gt;
            ctx.fillRect(0, 0, W, 60);
            // bottom
            const gb = ctx.createLinearGradient(0, H, 0, H - 60);
            gb.addColorStop(0, edgeColor);
            gb.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gb;
            ctx.fillRect(0, H - 60, W, 60);
        }
    }
};

// boot
window.addEventListener('load', () => Game.init());
