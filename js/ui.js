// ── UI: меню, HUD, экран прокачки ──

const UI = {
    buttons: [],
    // на маленьких экранах (мобильные) x4 стоимость всего кроме выстрелов
    isMobile: Math.min(window.innerWidth, window.innerHeight) < 600,

    upgradeData: [
        { key: 'bounces', name: 'Рикошеты', icon: '↗', desc: '+1 рикошет', maxLvl: 8, baseCost: (l) => 50 + l * 40 },
        { key: 'damage', name: 'Урон+Волна', icon: '💥', desc: '+урон +волна', maxLvl: 10, baseCost: (l) => 60 + l * 50 },
        { key: 'speed', name: 'Скорость', icon: '⚡', desc: '+скорость пули', maxLvl: 6, baseCost: (l) => 40 + l * 35 },
        { key: 'shots', name: 'Выстрелы', icon: '🔫', desc: '+1 выстрел', maxLvl: 7, baseCost: (l) => 80 + l * 60, noMobileMult: true },
        { key: 'multishot', name: 'Мультишот', icon: '🔱', desc: '+1 пуля', maxLvl: 4, baseCost: (l) => 150 + l * 100 },
        { key: 'piercing', name: 'Пробивание', icon: '🎯', desc: '+1 цель сквозь', maxLvl: 5, baseCost: (l) => 200 + l * 120 },
        { key: 'predict', name: 'Прогноз', icon: '🔮', desc: 'улучш. прицел', maxLvl: 3, baseCost: (l) => 60 + l * 50 },
        { key: 'crit', name: 'Крит. удар', icon: '⚔', desc: '+8% шанс x3', maxLvl: 5, baseCost: (l) => 80 + l * 60 },
        { key: 'magnet', name: 'Магнит', icon: '🧲', desc: 'пуля к цели', maxLvl: 4, baseCost: (l) => 100 + l * 80 },
    ],

    getUpgradeCost(u, lvl) {
        const base = u.baseCost(lvl);
        return (this.isMobile && !u.noMobileMult) ? base * 4 : base;
    },

    drawHUD(ctx, W, H) {
        // верхняя панель
        const grad = ctx.createLinearGradient(0, 0, 0, 70);
        grad.addColorStop(0, 'rgba(0,0,0,0.8)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, 70);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // уровень
        ctx.fillStyle = '#00ccff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`УРОВЕНЬ ${Game.levelNum}`, 15, 12);

        // очки
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${Game.score}`, 15, 36);
        ctx.fillStyle = '#aa8800';
        ctx.font = '12px Arial';
        ctx.fillText('очки', 15 + ctx.measureText(`${Game.score}`).width + 5, 39);

        // монеты + множитель
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${Game.coins}`, W - 15, 12);
        ctx.fillStyle = '#aa8800';
        ctx.font = '12px Arial';
        const multText = Game.coinMultiplier > 1 ? `монеты x${Game.coinMultiplier.toFixed(1)}` : 'монеты';
        ctx.fillText(multText, W - 15, 32);

        // выстрелы
        ctx.textAlign = 'center';
        const shotY = H - 35;
        const totalDots = Math.max(Player.stats.maxShots, Player.shotsLeft);
        for (let i = 0; i < totalDots; i++) {
            const sx = W / 2 + (i - totalDots / 2 + 0.5) * 18;
            const isBonus = i >= Player.stats.maxShots;
            const active = i < Player.shotsLeft;
            ctx.fillStyle = active ? (isBonus ? '#88ddff' : '#00ffaa') : '#333';
            ctx.shadowBlur = active ? 6 : 0;
            ctx.shadowColor = isBonus ? '#88ddff' : '#00ffaa';
            ctx.beginPath();
            ctx.arc(sx, shotY, 4.5, 0, TAU);
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // цели
        const alive = Level.targets.filter(t => t.alive).length;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff6688';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`Цели: ${alive}`, W / 2, 14);

        // характеристики
        ctx.fillStyle = '#88aacc';
        ctx.font = '11px Arial';
        let infoText = `↗${Player.stats.maxBounces}  🎯${Player.stats.maxPierces}`;
        if (Player.stats.crit > 0) infoText += `  ⚔${Player.stats.crit}%`;
        if (Player.stats.magnet > 0) infoText += `  🧲`;
        ctx.fillText(infoText, W / 2, 34);

        // кнопка звука
        const sx = W - 30, sy = 52;
        ctx.fillStyle = Sound.enabled ? '#44aa66' : '#664444';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Sound.enabled ? '🔊' : '🔇', sx, sy);
        // запомним позицию для клика
        this._soundBtn = { x: sx - 15, y: sy - 12, w: 30, h: 24 };
    },

    drawMainMenu(ctx, W, H) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, W, H);

        // фоновые частицы
        for (let i = 0; i < 30; i++) {
            const t = Game.time * 0.5 + i * 1.3;
            const px = (Math.sin(t * 0.7 + i) * 0.5 + 0.5) * W;
            const py = (Math.cos(t * 0.5 + i * 2) * 0.5 + 0.5) * H;
            ctx.globalAlpha = 0.1 + Math.sin(t) * 0.05;
            ctx.fillStyle = hsl((i * 30 + Game.time * 20) % 360, 80, 60);
            ctx.beginPath();
            ctx.arc(px, py, rand(2, 6), 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // заголовок
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const titleY = H * 0.25;

        ctx.shadowBlur = 40;
        ctx.shadowColor = '#00aaff';
        ctx.fillStyle = '#00ddff';
        ctx.font = `bold ${Math.min(W * 0.16, 64)}px Arial`;
        ctx.fillText('СТРЕЛОК', W / 2, titleY);
        ctx.shadowBlur = 0;

        // подзаголовок
        ctx.fillStyle = '#667788';
        ctx.font = '14px Arial';
        ctx.fillText('Попади в цель через рикошеты!', W / 2, titleY + 55);

        // кнопки
        this.drawButton(ctx, W / 2 - 90, H * 0.48, 180, 50, 'ИГРАТЬ', '#00cc66', '#004422', 'play');
        this.drawButton(ctx, W / 2 - 90, H * 0.57, 180, 50, 'РЕКОРДЫ', '#4488ff', '#112244', 'leaderboard');
        this.drawButton(ctx, W / 2 - 90, H * 0.66, 180, 42, 'ОБ АВТОРЕ', '#887744', '#221a0a', 'about');

        // статистика
        ctx.fillStyle = '#556677';
        ctx.font = '13px Arial';
        ctx.fillText(`Лучший счёт: ${Game.highScore}`, W / 2, H * 0.78);
        ctx.fillText(`Лучший уровень: ${Game.highLevel}`, W / 2, H * 0.78 + 22);
    },

    drawUpgradeScreen(ctx, W, H) {
        ctx.fillStyle = 'rgba(5,5,20,0.95)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // заголовок
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffaa00';
        ctx.fillStyle = '#ffcc44';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('УРОВЕНЬ ПРОЙДЕН!', W / 2, 40);
        ctx.shadowBlur = 0;

        // заработано
        ctx.fillStyle = '#aabbcc';
        ctx.font = '16px Arial';
        ctx.fillText(`+${Game.levelScore} очков  |  +${Game.levelCoins} монет`, W / 2, 72);

        // множитель монет
        if (Game.coinMultiplier > 1) {
            ctx.fillStyle = '#44ffaa';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`Доход монет x${Game.coinMultiplier.toFixed(1)}`, W / 2, 92);
        }

        // монеты
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`Монеты: ${Game.coins}`, W / 2, 112);

        // кнопки прокачки
        this.buttons = [];
        const startY = 135;
        const bw = Math.min(W - 40, 320);
        const bh = 44;
        const gap = 5;

        for (let i = 0; i < this.upgradeData.length; i++) {
            const u = this.upgradeData[i];
            const by = startY + i * (bh + gap);
            const bx = W / 2 - bw / 2;
            const lvl = Player.upgrades[u.key];
            const maxed = lvl >= u.maxLvl;
            const cost = this.getUpgradeCost(u, lvl);
            const canBuy = !maxed && Game.coins >= cost;

            ctx.fillStyle = maxed ? '#1a2a1a' : canBuy ? '#1a1a3a' : '#1a1a22';
            ctx.strokeStyle = maxed ? '#33aa33' : canBuy ? '#4466cc' : '#333';
            ctx.lineWidth = 1.5;
            this.roundRect(ctx, bx, by, bw, bh, 8);
            ctx.fill();
            ctx.stroke();

            ctx.textAlign = 'left';
            ctx.fillStyle = maxed ? '#66cc66' : '#ddd';
            ctx.font = 'bold 13px Arial';
            ctx.fillText(`${u.icon} ${u.name}`, bx + 10, by + 15);

            for (let d = 0; d < Math.min(u.maxLvl, 10); d++) {
                const dx = bx + 10 + d * 12;
                ctx.fillStyle = d < lvl ? '#ffcc44' : '#333';
                ctx.beginPath();
                ctx.arc(dx + 3, by + 33, 3.5, 0, TAU);
                ctx.fill();
            }

            ctx.textAlign = 'right';
            if (maxed) {
                ctx.fillStyle = '#66cc66';
                ctx.font = 'bold 14px Arial';
                ctx.fillText('МАКС', bx + bw - 12, by + bh / 2);
            } else {
                ctx.fillStyle = canBuy ? '#ffdd44' : '#886644';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(`${cost}`, bx + bw - 12, by + bh / 2);
            }

            if (canBuy) {
                this.buttons.push({ x: bx, y: by, w: bw, h: bh, action: 'upgrade', key: u.key, cost });
            }
        }

        // кнопка далее
        const contY = startY + this.upgradeData.length * (bh + gap) + 15;
        this.drawButton(ctx, W / 2 - 90, contY, 180, 50, 'ДАЛЕЕ ▶', '#00cc66', '#003311', 'next');
    },

    drawGameOver(ctx, W, H) {
        ctx.fillStyle = 'rgba(10,0,0,0.9)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 25;
        ctx.shadowColor = '#ff3333';
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 34px Arial';
        ctx.fillText('КОНЕЦ ИГРЫ', W / 2, H * 0.28);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#aaa';
        ctx.font = '18px Arial';
        ctx.fillText(`Уровень: ${Game.levelNum}`, W / 2, H * 0.40);
        ctx.fillText(`Очки: ${Game.score}`, W / 2, H * 0.46);
        ctx.fillText(`Монеты собрано: ${Game.coins}`, W / 2, H * 0.52);

        if (Game.score >= Game.highScore && Game.highScore > 0) {
            ctx.fillStyle = '#ffcc44';
            ctx.font = 'bold 16px Arial';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffcc44';
            ctx.fillText('НОВЫЙ РЕКОРД!', W / 2, H * 0.59);
            ctx.shadowBlur = 0;
        }

        this.drawButton(ctx, W / 2 - 90, H * 0.66, 180, 48, 'ЗАНОВО', '#cc3333', '#330000', 'restart');
        this.drawButton(ctx, W / 2 - 90, H * 0.76, 180, 42, 'РЕКОРДЫ', '#4488ff', '#112244', 'leaderboard');
    },

    drawAbout(ctx, W, H) {
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, W, H);

        // фоновые частицы
        for (let i = 0; i < 20; i++) {
            const t = Game.time * 0.3 + i * 1.7;
            const px = (Math.sin(t * 0.5 + i) * 0.5 + 0.5) * W;
            const py = (Math.cos(t * 0.4 + i * 2) * 0.5 + 0.5) * H;
            ctx.globalAlpha = 0.06;
            ctx.fillStyle = hsl((i * 40 + Game.time * 15) % 360, 70, 60);
            ctx.beginPath();
            ctx.arc(px, py, rand(2, 5), 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // заголовок
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#887744';
        ctx.fillStyle = '#ccaa66';
        ctx.font = 'bold 26px Arial';
        ctx.fillText('ОБ АВТОРЕ', W / 2, H * 0.12);
        ctx.shadowBlur = 0;

        // аватар-заглушка
        ctx.strokeStyle = '#887744';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.24, 35, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#1a1510';
        ctx.fill();
        ctx.fillStyle = '#ccaa66';
        ctx.font = 'bold 28px Arial';
        ctx.fillText('D', W / 2, H * 0.24);

        // имя
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('Destian', W / 2, H * 0.34);

        // описание
        ctx.fillStyle = '#8899aa';
        ctx.font = '14px Arial';
        ctx.fillText('Разработчик игры «Стрелок»', W / 2, H * 0.40);

        // разделитель
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W * 0.2, H * 0.45);
        ctx.lineTo(W * 0.8, H * 0.45);
        ctx.stroke();

        // соцсети
        this.buttons = [];
        const linkW = Math.min(W - 50, 280);
        const linkX = W / 2 - linkW / 2;

        // VK
        ctx.fillStyle = '#1a1a2a';
        ctx.strokeStyle = '#4477bb';
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, linkX, H * 0.49, linkW, 50, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#4499dd';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ВКонтакте', W / 2, H * 0.49 + 18);
        ctx.fillStyle = '#667788';
        ctx.font = '12px Arial';
        ctx.fillText('vk.com/destianfarbius', W / 2, H * 0.49 + 37);
        this.buttons.push({ x: linkX, y: H * 0.49, w: linkW, h: 50, action: 'openVK' });

        // Telegram
        ctx.fillStyle = '#1a1a2a';
        ctx.strokeStyle = '#2299cc';
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, linkX, H * 0.60, linkW, 50, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#33bbee';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Telegram', W / 2, H * 0.60 + 18);
        ctx.fillStyle = '#667788';
        ctx.font = '12px Arial';
        ctx.fillText('@K_DestianF', W / 2, H * 0.60 + 37);
        this.buttons.push({ x: linkX, y: H * 0.60, w: linkW, h: 50, action: 'openTG' });

        // кнопка назад
        this.drawButton(ctx, W / 2 - 90, H * 0.78, 180, 45, 'НАЗАД', '#887744', '#221a0a', 'back');

        // копирайт
        ctx.fillStyle = '#334';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('© 2025 Destian. Все права защищены.', W / 2, H * 0.90);
    },

    drawButton(ctx, x, y, w, h, text, color, bgColor, action) {
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        this.roundRect(ctx, x, y, w, h, 10);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(text, x + w / 2, y + h / 2);
        ctx.shadowBlur = 0;

        this.buttons.push({ x, y, w, h, action });
    },

    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    },

    drawLeaderboard(ctx, W, H) {
        ctx.fillStyle = 'rgba(5,5,25,0.97)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 20;
        ctx.shadowColor = '#4488ff';
        ctx.fillStyle = '#66aaff';
        ctx.font = 'bold 28px Arial';
        ctx.fillText('ТАБЛИЦА РЕКОРДОВ', W / 2, 40);
        ctx.shadowBlur = 0;

        const records = Leaderboard.getRecords();
        const startY = 80;
        const rowH = 38;
        const tw = Math.min(W - 40, 340);
        const tx = W / 2 - tw / 2;

        // заголовки колонок
        ctx.fillStyle = '#556688';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('#', tx + 5, startY);
        ctx.fillText('Имя', tx + 30, startY);
        ctx.textAlign = 'right';
        ctx.fillText('Очки', tx + tw - 80, startY);
        ctx.fillText('Ур.', tx + tw - 20, startY);

        if (records.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#445566';
            ctx.font = '14px Arial';
            ctx.fillText('Пока нет рекордов', W / 2, startY + 60);
            ctx.fillText('Сыграйте партию!', W / 2, startY + 82);
        }

        for (let i = 0; i < records.length; i++) {
            const r = records[i];
            const ry = startY + 20 + i * rowH;

            // подсветка топ-3
            if (i < 3) {
                const colors = ['#ffcc00', '#bbccdd', '#cc8844'];
                ctx.fillStyle = colors[i];
                ctx.globalAlpha = 0.08;
                this.roundRect(ctx, tx, ry - 12, tw, rowH - 4, 6);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // номер
            ctx.textAlign = 'left';
            const medals = ['🥇', '🥈', '🥉'];
            ctx.fillStyle = i < 3 ? ['#ffcc00', '#bbccdd', '#cc8844'][i] : '#667788';
            ctx.font = i < 3 ? 'bold 14px Arial' : '13px Arial';
            ctx.fillText(i < 3 ? medals[i] : `${i + 1}.`, tx + 5, ry);

            // имя
            ctx.fillStyle = i < 3 ? '#fff' : '#aabbcc';
            ctx.font = i < 3 ? 'bold 14px Arial' : '13px Arial';
            ctx.fillText(r.name, tx + 30, ry);

            // очки
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffcc44';
            ctx.font = 'bold 13px Arial';
            ctx.fillText(r.score, tx + tw - 60, ry);

            // уровень
            ctx.fillStyle = '#88aacc';
            ctx.font = '12px Arial';
            ctx.fillText(r.level, tx + tw - 15, ry);

            // дата
            ctx.fillStyle = '#445566';
            ctx.font = '9px Arial';
            ctx.fillText(r.date, tx + tw - 35, ry + 13);
        }

        this.buttons = [];

        // кнопки
        const btnY = startY + 22 + Math.max(records.length, 3) * rowH + 20;
        this.drawButton(ctx, W / 2 - 90, btnY, 180, 45, 'НАЗАД', '#4488ff', '#112244', 'back');
        this.drawButton(ctx, W / 2 - 90, btnY + 55, 180, 40, 'ОЧИСТИТЬ', '#664444', '#221111', 'clearRecords');
    },

    drawNameInput(ctx, W, H) {
        ctx.fillStyle = 'rgba(5,5,25,0.97)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffaa00';
        ctx.fillStyle = '#ffcc44';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('НОВЫЙ РЕКОРД!', W / 2, H * 0.18);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#aabbcc';
        ctx.font = '18px Arial';
        ctx.fillText(`Очки: ${Game.score}`, W / 2, H * 0.26);
        ctx.fillText(`Уровень: ${Game.levelNum}`, W / 2, H * 0.31);

        // ввод имени
        ctx.fillStyle = '#667788';
        ctx.font = '14px Arial';
        ctx.fillText('Введите имя:', W / 2, H * 0.40);

        // поле ввода
        const iw = 220, ih = 44;
        const ix = W / 2 - iw / 2, iy = H * 0.44;
        ctx.fillStyle = '#0a0a20';
        ctx.strokeStyle = '#4466cc';
        ctx.lineWidth = 2;
        this.roundRect(ctx, ix, iy, iw, ih, 8);
        ctx.fill();
        ctx.stroke();

        // текст в поле
        const name = Game.inputName || '';
        const cursor = Math.sin(Game.time * 5) > 0 ? '|' : '';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(name + cursor, W / 2, iy + ih / 2);

        // клавиатура
        this.buttons = [];
        const keys = [
            'АБВГДЕЖЗ',
            'ИКЛМНОПР',
            'СТУФХЦЧШ',
            'ЩЭЮЯ_←',
            'ABCDEFGH',
            'IJKLMNOP',
            '12345678',
        ];
        const kStartY = H * 0.55;
        const kSize = Math.min(Math.floor((W - 30) / 8), 38);
        const kGap = 3;

        for (let row = 0; row < keys.length; row++) {
            const chars = keys[row];
            const rowWidth = chars.length * (kSize + kGap) - kGap;
            const kx = W / 2 - rowWidth / 2;
            for (let col = 0; col < chars.length; col++) {
                const ch = chars[col];
                const bx = kx + col * (kSize + kGap);
                const by = kStartY + row * (kSize + kGap);

                // кнопка
                const isSpecial = ch === '←' || ch === '_';
                ctx.fillStyle = isSpecial ? '#332222' : '#151525';
                ctx.strokeStyle = isSpecial ? '#884444' : '#334';
                ctx.lineWidth = 1;
                this.roundRect(ctx, bx, by, kSize, kSize, 5);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = isSpecial ? '#ff8888' : '#ccc';
                ctx.font = `bold ${kSize * 0.45}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const display = ch === '_' ? '⎵' : ch === '←' ? '⌫' : ch;
                ctx.fillText(display, bx + kSize / 2, by + kSize / 2);

                this.buttons.push({ x: bx, y: by, w: kSize, h: kSize, action: 'key', key: ch });
            }
        }

        // кнопка сохранить
        const saveY = kStartY + keys.length * (kSize + kGap) + 10;
        this.drawButton(ctx, W / 2 - 90, saveY, 180, 45, 'СОХРАНИТЬ', '#00cc66', '#003311', 'saveName');
    },

    handleClick(x, y) {
        for (const b of this.buttons) {
            if (pointInRect(x, y, b.x, b.y, b.w, b.h)) {
                return b;
            }
        }
        return null;
    }
};

// ── Таблица рекордов ──
const Leaderboard = {
    maxRecords: 10,
    storageKey: 'rs_leaderboard',

    getRecords() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        } catch { return []; }
    },

    isHighScore(score) {
        const records = this.getRecords();
        if (records.length < this.maxRecords) return score > 0;
        return score > records[records.length - 1].score;
    },

    addRecord(name, score, level) {
        const records = this.getRecords();
        const now = new Date();
        const date = `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`;
        records.push({ name: name || 'Игрок', score, level, date });
        records.sort((a, b) => b.score - a.score);
        if (records.length > this.maxRecords) records.length = this.maxRecords;
        localStorage.setItem(this.storageKey, JSON.stringify(records));
    },

    clear() {
        localStorage.removeItem(this.storageKey);
    }
};
