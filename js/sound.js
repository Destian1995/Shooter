// ── Процедурная звуковая система (Web Audio API) ──

const Sound = {
    ctx: null,
    enabled: true,
    volume: 0.4,
    unlocked: false,

    init() {
        // на мобильных не создаём контекст до тача
    },

    // разблокировка аудио на мобильных — вызывается при каждом тач/клик
    unlock() {
        if (this.unlocked && this.ctx && this.ctx.state === 'running') return;

        try {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => { this.unlocked = true; });
            } else {
                this.unlocked = true;
            }
        } catch (e) {
            this.enabled = false;
        }
    },

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    },

    // ── Базовые генераторы ──

    play(fn) {
        if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
        try { fn(this.ctx, this.ctx.currentTime); } catch(e) {}
    },

    makeGain(vol, t, decay) {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol * this.volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + decay);
        g.connect(this.ctx.destination);
        return g;
    },

    osc(type, freq, t, dur, vol) {
        const o = this.ctx.createOscillator();
        const g = this.makeGain(vol || 0.3, t, dur);
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        o.connect(g);
        o.start(t);
        o.stop(t + dur);
    },

    noise(t, dur, vol) {
        const bufSize = this.ctx.sampleRate * dur;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.makeGain(vol || 0.15, t, dur);
        src.connect(g);
        src.start(t);
    },

    // ── Игровые звуки ──

    shoot() {
        this.play((ctx, t) => {
            // щелчок + свист
            this.osc('square', 800, t, 0.05, 0.2);
            this.osc('sawtooth', 400, t, 0.08, 0.15);
            this.noise(t, 0.06, 0.15);
            // нисходящий свист
            const o = ctx.createOscillator();
            const g = this.makeGain(0.15, t, 0.15);
            o.type = 'sine';
            o.frequency.setValueAtTime(1200, t);
            o.frequency.exponentialRampToValueAtTime(200, t + 0.15);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.15);
        });
    },

    ricochet() {
        this.play((ctx, t) => {
            // металлический звон
            this.osc('sine', 1800 + Math.random() * 600, t, 0.08, 0.2);
            this.osc('triangle', 2400 + Math.random() * 400, t + 0.01, 0.06, 0.15);
            this.osc('sine', 3200 + Math.random() * 800, t + 0.02, 0.05, 0.1);
            this.noise(t, 0.03, 0.1);
        });
    },

    hit() {
        this.play((ctx, t) => {
            // удар
            this.osc('sine', 300, t, 0.1, 0.25);
            this.osc('square', 150, t, 0.08, 0.15);
            this.noise(t, 0.05, 0.2);
        });
    },

    kill() {
        this.play((ctx, t) => {
            // взрыв
            this.noise(t, 0.3, 0.35);
            this.osc('sine', 200, t, 0.15, 0.3);
            this.osc('sine', 100, t + 0.05, 0.2, 0.25);
            this.osc('square', 80, t, 0.25, 0.2);
            // нисходящий бум
            const o = ctx.createOscillator();
            const g = this.makeGain(0.3, t, 0.3);
            o.type = 'sine';
            o.frequency.setValueAtTime(400, t);
            o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.3);
        });
    },

    explosion() {
        this.play((ctx, t) => {
            // большой взрыв
            this.noise(t, 0.5, 0.4);
            this.noise(t + 0.05, 0.4, 0.3);
            this.osc('sine', 60, t, 0.4, 0.35);
            this.osc('sine', 40, t + 0.1, 0.3, 0.3);
            const o = ctx.createOscillator();
            const g = this.makeGain(0.35, t, 0.5);
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(300, t);
            o.frequency.exponentialRampToValueAtTime(20, t + 0.5);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.5);
        });
    },

    crit() {
        this.play((ctx, t) => {
            // мощный удар + высокий звон
            this.noise(t, 0.3, 0.3);
            this.osc('sawtooth', 600, t, 0.1, 0.3);
            this.osc('sine', 1500, t + 0.03, 0.15, 0.2);
            this.osc('sine', 2000, t + 0.06, 0.1, 0.15);
            const o = ctx.createOscillator();
            const g = this.makeGain(0.3, t, 0.35);
            o.type = 'sine';
            o.frequency.setValueAtTime(500, t);
            o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.35);
        });
    },

    combo(level) {
        this.play((ctx, t) => {
            // восходящие ноты — выше с каждым комбо
            const base = 400 + level * 80;
            this.osc('sine', base, t, 0.1, 0.2);
            this.osc('sine', base * 1.25, t + 0.07, 0.1, 0.2);
            this.osc('sine', base * 1.5, t + 0.14, 0.12, 0.2);
        });
    },

    coin() {
        this.play((ctx, t) => {
            // монетка — два коротких тона
            this.osc('sine', 1200, t, 0.06, 0.15);
            this.osc('sine', 1600, t + 0.06, 0.08, 0.15);
        });
    },

    bonusShot() {
        this.play((ctx, t) => {
            // перезарядка
            this.osc('sine', 600, t, 0.08, 0.15);
            this.osc('sine', 900, t + 0.06, 0.08, 0.15);
            this.osc('sine', 1200, t + 0.12, 0.1, 0.2);
        });
    },

    levelComplete() {
        this.play((ctx, t) => {
            // победная мелодия
            const notes = [523, 659, 784, 1047]; // C E G C
            notes.forEach((f, i) => {
                this.osc('sine', f, t + i * 0.12, 0.15, 0.2);
                this.osc('triangle', f * 0.5, t + i * 0.12, 0.15, 0.1);
            });
        });
    },

    gameOver() {
        this.play((ctx, t) => {
            // грустная нисходящая последовательность
            const notes = [400, 350, 300, 200];
            notes.forEach((f, i) => {
                this.osc('sine', f, t + i * 0.2, 0.25, 0.2);
                this.osc('triangle', f * 0.5, t + i * 0.2, 0.25, 0.1);
            });
            this.noise(t + 0.6, 0.4, 0.15);
        });
    },

    shockwave() {
        this.play((ctx, t) => {
            // низкий гул волны
            const o = ctx.createOscillator();
            const g = this.makeGain(0.25, t, 0.3);
            o.type = 'sine';
            o.frequency.setValueAtTime(150, t);
            o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.3);
            this.noise(t, 0.15, 0.15);
        });
    },

    bossIntro() {
        this.play((ctx, t) => {
            // ominous low rumble + rising tone
            this.noise(t, 0.6, 0.3);
            this.osc('sine', 60, t, 0.5, 0.3);
            this.osc('sawtooth', 80, t + 0.1, 0.4, 0.25);
            const o = ctx.createOscillator();
            const g = this.makeGain(0.25, t, 0.6);
            o.type = 'sine';
            o.frequency.setValueAtTime(80, t);
            o.frequency.exponentialRampToValueAtTime(400, t + 0.5);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.6);
        });
    },

    click() {
        this.play((ctx, t) => {
            this.osc('sine', 800, t, 0.04, 0.1);
        });
    },
};
