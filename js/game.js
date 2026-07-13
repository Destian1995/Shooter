// ── Main game controller ──

const Game = {
    VERSION: '2.0.0',
    canvas: null, ctx: null,
    W: 0, H: 0,
    state: 'menu', // menu, playing, upgrade, gameover, leaderboard, about
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
    banners: [],    // sliding banner messages
    killStreak: 0,  // kills this level (for streak effects)

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

        // клавиатура не используется (имя генерируется автоматически)

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
        Player.upgrades = { bounces: 0, damage: 0, speed: 0, shots: 0, piercing: 0, predict: 0, crit: 0, magnet: 0, vampire: 0, lucky: 0, ghost: 0 };
        Player.applyUpgrades();
        this.startLevel();
    },

    showBanner(text, color, size) {
        this.banners.push({
            text,
            color: color || '#fff',
            size: size || 22,
            x: this.W + 50, // starts off-screen right
            life: 4.0,
            maxLife: 4.0,
            y: 0.15 + this.banners.length * 0.06, // stack vertically (% of H)
        });
    },

    startLevel() {
        this.zoom = Math.max(0.45, 1.0 - (this.levelNum - 1) * 0.04);

        const vW = Math.floor(this.W / this.zoom);
        const vH = Math.floor(this.H / this.zoom);

        Level.generate(this.levelNum, vW, vH);
        Player.init(Level.playerStart.x, Level.playerStart.y);
        // boss levels: +3 bonus shots to handle the boss
        if (Level.isBossLevel) {
            Player.shotsLeft += 3;
        }
        Particles.clear();
        this.state = 'playing';
        this.targetGridHue = (this.levelNum * 47) % 360;
        this.combo = 0;
        this.comboTimer = 0;
        this.comboTexts = [];
        this.killTexts = [];
        this.banners = [];
        this.killStreak = 0;

        // level-up banner
        if (this.levelNum > 1) {
            // world change banner
            const prevWorld = Math.floor((this.levelNum - 2) / 5);
            const curWorld = Level.world;
            if (curWorld !== prevWorld) {
                const theme = this.getWorldTheme();
                this.showBanner(`МИР: ${theme.name}`, theme.nameColor, 32);
            }

            // boss level banner
            if (Level.isBossLevel) {
                Sound.bossIntro();
                Shake.trigger(12);
                this.showBanner('БОСС!', '#ff2244', 36);
                this.showBanner(`УРОВЕНЬ ${this.levelNum}`, '#ff8844', 24);
            } else {
                this.showBanner(`УРОВЕНЬ ${this.levelNum}`, '#00ddff', 28);
            }

            // modifier banner
            if (Level.modifier) {
                const m = Level.modifier;
                this.showBanner(`${m.icon} ${m.name}: ${m.desc}`, m.color, 18);
            }

            // formation banner (for non-random)
            const formNames = {
                circle: 'КРУГ', vshape: 'КЛИН', grid: 'СТРОЙ',
                diagonal: 'ДИАГОНАЛЬ', cross: 'КРЕСТ'
            };
            if (Level.formation && formNames[Level.formation]) {
                this.showBanner(`Формация: ${formNames[Level.formation]}`, '#88aacc', 14);
            }

            const targetCount = Level.targets.length;
            const types = Level.targets.map(t => t.type).filter(t => t !== 'normal');
            if (types.length > 0) {
                const unique = [...new Set(types)];
                const typeNames = {
                    moving: 'движущиеся', blinking: 'мигающие', armored: 'бронированные',
                    explosive: 'взрывные', healer: 'лекари', shield: 'щитовики',
                    teleporter: 'телепортеры', splitter: 'делящиеся',
                    multiplier: 'множители', powerup: 'бонус', boss: 'БОСС',
                };
                const names = unique.slice(0, 3).map(t => typeNames[t] || t).join(', ');
                this.showBanner(`${targetCount} целей: ${names}`, '#aabbcc', 16);
            }
        }
    },

    completeLevel() {
        // coin multiplier grows every 3 levels
        this.coinMultiplier = 1 + Math.floor((this.levelNum - 1) / 3) * 0.5;

        // base completion reward + shot bonus (kill score already added in onTargetKill)
        this.levelScore = 10 + this.levelNum * 5;
        const shotBonus = Player.shotsLeft * 10;
        this.levelScore += shotBonus;

        let coinBonus = 1;
        if (Level.modifier && Level.modifier.id === 'bounty') coinBonus = 2;
        if (Level.isBossLevel) coinBonus *= 1.5;
        this.levelCoins = Math.floor((10 + this.levelNum * 8 + Player.shotsLeft * 5) * this.coinMultiplier * coinBonus);

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

        // автоматическое сохранение рекорда с именем по дате/времени
        if (Leaderboard.isHighScore(this.score)) {
            const now = new Date();
            const autoName = `Игрок_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}_${now.getDate().toString().padStart(2,'0')}${(now.getMonth()+1).toString().padStart(2,'0')}`;
            Leaderboard.addRecord(autoName, this.score, this.levelNum);
        }
        this.state = 'gameover';
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
        this.killStreak++;
        Sound.kill();

        // streak banners
        if (this.killStreak === 3) this.showBanner('СЕРИЯ УБИЙСТВ!', '#ff8844', 24);
        else if (this.killStreak === 5) this.showBanner('НЕУДЕРЖИМ!', '#ff4444', 28);
        else if (this.killStreak === 8) this.showBanner('РАЗРУШИТЕЛЬ!', '#ff22ff', 32);
        else if (this.killStreak === 12) this.showBanner('ЛЕГЕНДА!!!', '#ffdd00', 36);

        // vampire: kills restore a shot
        if (Player.stats.vampire > 0 && Math.random() < Player.stats.vampire) {
            Player.shotsLeft++;
            this.killTexts.push({
                x: target.x + 20, y: target.y - 30,
                text: '+1🔫', life: 1.0, maxLife: 1.0, color: '#ff4466'
            });
        }

        // boss level: non-boss kills have 50% chance to give +1 shot
        if (Level.isBossLevel && target.type !== 'boss' && Math.random() < 0.5) {
            Player.shotsLeft++;
            this.killTexts.push({
                x: target.x - 15, y: target.y - 15,
                text: '+1🔫', life: 0.8, maxLife: 0.8, color: '#44ffaa'
            });
        }

        // lucky: double coins chance
        if (Player.stats.lucky > 0 && Math.random() < Player.stats.lucky) {
            const bonus = Math.floor(target.score / 4 * this.coinMultiplier);
            this.coins += bonus;
            this.killTexts.push({
                x: target.x - 20, y: target.y - 30,
                text: `+${bonus}$!`, life: 1.0, maxLife: 1.0, color: '#ffdd44'
            });
        }

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

        // ── DOUBLE KILL bonus + extra shot ──
        if (pierceCount >= 2) {
            const dkBonus = target.score * 2;
            totalScore += dkBonus;
            Player.shotsLeft++;
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: `ДВОЙНОЕ! +${dkBonus} +1🔫`,
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
            Sound.bonusShot();
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

        // ── Powerup: apply random bonus for the rest of the level ──
        if (target.type === 'powerup' && target.bonus) {
            const b = target.bonus;
            if (b.id === 'extraShots') Player.shotsLeft += 1;
            else if (b.id === 'extraShots2') Player.shotsLeft += 2;
            else if (b.id === 'dmgBoost') { Player.stats.damage *= 2; }
            else if (b.id === 'maxBounce') { Player.stats.maxBounces += 5; }
            else if (b.id === 'magnetBoost') { Player.stats.magnet = Math.max(Player.stats.magnet, 80); }

            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.25,
                text: b.name + '!',
                life: 2.5, maxLife: 2.5,
                color: b.color,
                size: 32
            });
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: 'БОНУС!',
                life: 1.8, maxLife: 1.8,
                color: b.color
            });
            Particles.burst(target.x, target.y, 25, b.color, 300, 6, 0.6, 15);
            Particles.burst(target.x, target.y, 15, '#fff', 200, 4, 0.4, 10);
            Sound.bonusShot();
        }

        // ── Boss kill: massive celebration ──
        if (target.type === 'boss') {
            Sound.explosion();
            Sound.levelComplete();
            // massive multi-explosion
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    Particles.explosion(
                        target.x + rand(-40, 40), target.y + rand(-40, 40),
                        hsl(rand(0, 360), 100, 60), 2.0);
                }, i * 100);
            }
            Particles.flash('#ffdd00', 0.8);
            Particles.triggerSlowmo(1.0);
            Shake.trigger(25);
            Player.shotsLeft += 3;

            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.2,
                text: 'БОСС ПОВЕРЖЕН!!!',
                life: 3.0, maxLife: 3.0,
                color: '#ffdd00',
                size: 42
            });
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: '+3 ВЫСТРЕЛА!',
                life: 2.0, maxLife: 2.0,
                color: '#ffdd00'
            });
            floatY += 22;
        }

        // ── Multiplier: spawn 3 extra bullets in random directions (no shockwave) ──
        if (target.type === 'multiplier') {
            const tier = Player.getBulletColor();
            for (let i = 0; i < 3; i++) {
                const a = rand(0, TAU);
                Player.bullets.push(new Bullet(
                    target.x, target.y, a,
                    Player.stats.bulletSpeed * 0.8,
                    Player.stats.maxBounces,
                    Player.stats.damage,
                    tier.color,
                    Player.stats.maxPierces,
                    false, // not crit
                    Player.stats.magnet,
                    false  // no shockwave
                ));
            }
            this.comboTexts.push({
                x: this.W / 2, y: this.H * 0.3,
                text: 'МНОЖИТЕЛЬ!',
                life: 1.5, maxLife: 1.5,
                color: '#ffdd33',
                size: 28
            });
            this.killTexts.push({
                x: target.x, y: target.y - floatY,
                text: '+3 СНАРЯДА!',
                life: 1.5, maxLife: 1.5,
                color: '#ffdd33'
            });
            Particles.burst(target.x, target.y, 20, '#ffdd33', 250, 5, 0.5, 12);
            Sound.bonusShot();
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
        Sound.unlock(); // разблокировка аудио на мобильных
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

        // banners
        for (let i = this.banners.length - 1; i >= 0; i--) {
            const b = this.banners[i];
            b.life -= rawDt;
            // slide in from right, pause in center, slide out left
            const progress = 1 - b.life / b.maxLife;
            if (progress < 0.15) {
                b.x = lerp(this.W + 50, this.W * 0.5, progress / 0.15);
            } else if (progress > 0.75) {
                b.x = lerp(this.W * 0.5, -300, (progress - 0.75) / 0.25);
            }
            if (b.life <= 0) this.banners.splice(i, 1);
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
            Level.drawFog(ctx, vW, vH);
            Particles.drawFlash(ctx, vW, vH);
            this.drawFloatingTexts(ctx);
            this.drawAimHint(ctx, vW, vH);
            ctx.restore();
            // HUD поверх без zoom
            UI.drawHUD(ctx, W, H);
            this.drawBanners(ctx, W, H);
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

    drawBanners(ctx, W, H) {
        for (const b of this.banners) {
            const a = clamp(b.life / b.maxLife * 3, 0, 1); // fade at end
            ctx.globalAlpha = a;

            const by = H * b.y;

            // background stripe
            const stripeH = b.size + 14;
            const stripeGrad = ctx.createLinearGradient(b.x - 200, 0, b.x + 200, 0);
            stripeGrad.addColorStop(0, 'rgba(0,0,0,0)');
            stripeGrad.addColorStop(0.3, 'rgba(0,0,0,0.6)');
            stripeGrad.addColorStop(0.7, 'rgba(0,0,0,0.6)');
            stripeGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = stripeGrad;
            ctx.fillRect(b.x - 200, by - stripeH / 2, 400, stripeH);

            // accent line
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = b.color;
            ctx.beginPath();
            ctx.moveTo(b.x - 150, by + stripeH / 2);
            ctx.lineTo(b.x + 150, by + stripeH / 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // text
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = b.color;
            ctx.font = `bold ${b.size}px Arial`;
            ctx.fillText(b.text, b.x, by);
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    },

    // World themes: 0=Космос, 1=Неон, 2=Огонь, 3=Лёд, 4+=Хаос
    worldThemes: [
        { name: 'КОСМОС',  nameColor: '#4488ff', bgHueShift: 0,   sat: 1.0, gridStyle: 'lines',   particleColor: null },
        { name: 'НЕОН',    nameColor: '#ff44ff', bgHueShift: 180, sat: 1.4, gridStyle: 'dots',     particleColor: '#ff44ff' },
        { name: 'ОГОНЬ',   nameColor: '#ff6622', bgHueShift: 15,  sat: 1.2, gridStyle: 'lines',    particleColor: '#ff4400' },
        { name: 'ЛЁД',     nameColor: '#44ddff', bgHueShift: 200, sat: 0.7, gridStyle: 'hex',      particleColor: '#88ddff' },
        { name: 'ХАОС',    nameColor: '#ffdd00', bgHueShift: 0,   sat: 1.6, gridStyle: 'glitch',   particleColor: '#ff00ff' },
    ],

    getWorldTheme() {
        const w = Level.world || 0;
        return this.worldThemes[Math.min(w, this.worldThemes.length - 1)];
    },

    drawBackground(ctx, W, H) {
        const lvl = this.levelNum;
        const intensity = Math.min(lvl / 15, 1);
        const theme = this.getWorldTheme();
        const worldIdx = Level.world || 0;

        const bgSat = (10 + intensity * 25) * theme.sat;
        const bgLight = 5 + intensity * 5;
        const themeHue = (this.gridHue + theme.bgHueShift) % 360;

        // двойной градиент
        const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
        bgGrad.addColorStop(0, hsl(themeHue, bgSat, bgLight));
        bgGrad.addColorStop(0.6, hsl((themeHue + 30) % 360, bgSat * 0.7, bgLight * 0.6));
        bgGrad.addColorStop(1, hsl((themeHue + 60) % 360, 10, 2));
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // анимированная сетка — стиль зависит от мира
        const gridSpeed = 5 + intensity * 15;
        const gridAlpha = 0.15 + intensity * 0.2;
        const gridSize = 40 - intensity * 10;
        const offsetX = (this.time * gridSpeed) % gridSize;
        const offsetY = (this.time * gridSpeed * 0.4) % gridSize;

        if (theme.gridStyle === 'dots') {
            // неон: точечная сетка
            ctx.fillStyle = hsl(themeHue, 60, 40, gridAlpha);
            for (let x = -gridSize + offsetX; x < W + gridSize; x += gridSize) {
                for (let y = -gridSize + offsetY; y < H + gridSize; y += gridSize) {
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, TAU);
                    ctx.fill();
                }
            }
        } else if (theme.gridStyle === 'hex') {
            // лёд: гексагональная сетка
            ctx.strokeStyle = hsl(themeHue, 30, 20, gridAlpha * 0.7);
            ctx.lineWidth = 0.5;
            const hs = gridSize * 1.2;
            for (let row = -1; row < H / (hs * 0.866) + 1; row++) {
                for (let col = -1; col < W / hs + 1; col++) {
                    const hx = col * hs + (row % 2) * hs * 0.5 + offsetX;
                    const hy = row * hs * 0.866 + offsetY;
                    ctx.beginPath();
                    for (let s = 0; s < 6; s++) {
                        const a = s * TAU / 6;
                        const px = hx + Math.cos(a) * gridSize * 0.5;
                        const py = hy + Math.sin(a) * gridSize * 0.5;
                        s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        } else if (theme.gridStyle === 'glitch') {
            // хаос: дрожащая искажённая сетка
            ctx.strokeStyle = hsl((themeHue + this.time * 60) % 360, 50, 20, gridAlpha);
            ctx.lineWidth = 0.5;
            for (let x = -gridSize + offsetX; x < W + gridSize; x += gridSize) {
                const glitch = Math.sin(x * 0.1 + this.time * 10) * 5;
                ctx.beginPath();
                ctx.moveTo(x + glitch, 0);
                ctx.lineTo(x - glitch, H);
                ctx.stroke();
            }
            for (let y = -gridSize + offsetY; y < H + gridSize; y += gridSize) {
                const glitch = Math.cos(y * 0.1 + this.time * 8) * 5;
                ctx.beginPath();
                ctx.moveTo(0, y + glitch);
                ctx.lineTo(W, y - glitch);
                ctx.stroke();
            }
        } else {
            // космос/огонь: обычные линии
            ctx.strokeStyle = hsl(themeHue, 30 + intensity * 20, 12 + intensity * 8, gridAlpha);
            ctx.lineWidth = 0.5;
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
        }

        // туманные пятна
        if (lvl >= 3) {
            const nebulaCount = Math.min(Math.floor(intensity * 5), 4);
            for (let i = 0; i < nebulaCount; i++) {
                const nx = W * (0.2 + Math.sin(this.time * 0.3 + i * 2.1) * 0.3);
                const ny = H * (0.3 + Math.cos(this.time * 0.2 + i * 1.7) * 0.25);
                const nr = W * (0.15 + intensity * 0.1);
                const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
                ng.addColorStop(0, hsl((themeHue + i * 90) % 360, 40 * theme.sat, 15, 0.06 + intensity * 0.04));
                ng.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = ng;
                ctx.fillRect(0, 0, W, H);
            }
        }

        // плавающие звёзды-точки
        if (lvl >= 2) {
            const starCount = Math.floor(5 + intensity * 20);
            for (let i = 0; i < starCount; i++) {
                const seed = i * 7.31;
                const sx = (Math.sin(seed) * 0.5 + 0.5) * W;
                const sy = ((Math.cos(seed * 1.3) * 0.5 + 0.5 + this.time * 0.01 * (1 + (i % 3))) % 1) * H;
                const twinkle = Math.sin(this.time * 3 + seed) * 0.5 + 0.5;
                ctx.globalAlpha = twinkle * (0.1 + intensity * 0.15);
                ctx.fillStyle = theme.particleColor || hsl((themeHue + i * 20) % 360, 60, 70);
                ctx.beginPath();
                ctx.arc(sx, sy, 1 + twinkle, 0, TAU);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // пульсирующие лучи
        if (lvl >= 6) {
            const rayCount = Math.min(3 + Math.floor(intensity * 5), 6);
            ctx.globalAlpha = 0.03 + intensity * 0.03;
            for (let i = 0; i < rayCount; i++) {
                const ra = this.time * 0.2 + i * TAU / rayCount;
                const rLen = W * 0.6;
                ctx.strokeStyle = hsl((themeHue + i * 40) % 360, 50 * theme.sat, 40);
                ctx.lineWidth = 2 + intensity * 4;
                ctx.beginPath();
                ctx.moveTo(W / 2, H / 2);
                ctx.lineTo(W / 2 + Math.cos(ra) * rLen, H / 2 + Math.sin(ra) * rLen);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // мир огня: плавающие угольки
        if (worldIdx === 2) {
            for (let i = 0; i < 12; i++) {
                const seed = i * 3.7;
                const ex = (Math.sin(seed + this.time * 0.5) * 0.5 + 0.5) * W;
                const ey = ((1 - ((this.time * 0.03 * (1 + i % 3) + seed * 0.1) % 1))) * H;
                const flicker = Math.sin(this.time * 8 + seed) * 0.3 + 0.7;
                ctx.globalAlpha = flicker * 0.15;
                ctx.fillStyle = Math.random() > 0.5 ? '#ff4400' : '#ffaa22';
                ctx.beginPath();
                ctx.arc(ex, ey, 2 + Math.sin(seed) * 1, 0, TAU);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // мир льда: плавающие кристаллы
        if (worldIdx === 3) {
            for (let i = 0; i < 8; i++) {
                const seed = i * 5.3;
                const cx = (Math.sin(seed + this.time * 0.2) * 0.5 + 0.5) * W;
                const cy = ((Math.cos(seed * 1.1 + this.time * 0.15) * 0.5 + 0.5)) * H;
                const size = 4 + Math.sin(seed) * 2;
                ctx.globalAlpha = 0.08;
                ctx.strokeStyle = '#88ddff';
                ctx.lineWidth = 1;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(this.time * 0.3 + seed);
                ctx.beginPath();
                for (let s = 0; s < 6; s++) {
                    const a = s * TAU / 6;
                    const px = Math.cos(a) * size;
                    const py = Math.sin(a) * size;
                    s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        }

        // мир хаоса: случайные полосы глитча
        if (worldIdx >= 4) {
            for (let i = 0; i < 3; i++) {
                if (Math.random() > 0.95) {
                    const gy = rand(0, H);
                    const gh = rand(2, 8);
                    ctx.globalAlpha = 0.08;
                    ctx.fillStyle = hsl(rand(0, 360), 100, 60);
                    ctx.fillRect(0, gy, W, gh);
                }
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

        // рамочное свечение краёв
        if (lvl >= 4) {
            const edgeGlow = 0.03 + intensity * 0.06;
            const edgeColor = hsl(themeHue, 60, 50, edgeGlow);
            const gt = ctx.createLinearGradient(0, 0, 0, 60);
            gt.addColorStop(0, edgeColor);
            gt.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gt;
            ctx.fillRect(0, 0, W, 60);
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
