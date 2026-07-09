// ── Utility helpers ──

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rand(lo, hi) { return Math.random() * (hi - lo) + lo; }
function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function hsl(h, s, l, a) {
    if (a !== undefined) return `hsla(${h},${s}%,${l}%,${a})`;
    return `hsl(${h},${s}%,${l}%)`;
}

// line-circle intersection
function lineCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    let disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / (2 * a);
    const t2 = (-b + disc) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// point-rect collision
function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

// reflect vector off wall normal
function reflect(vx, vy, nx, ny) {
    const dot = vx * nx + vy * ny;
    return { x: vx - 2 * dot * nx, y: vy - 2 * dot * ny };
}

// screen shake
const Shake = {
    x: 0, y: 0, intensity: 0, decay: 0.9,
    trigger(power) { this.intensity = power; },
    update() {
        if (this.intensity > 0.5) {
            this.x = rand(-this.intensity, this.intensity);
            this.y = rand(-this.intensity, this.intensity);
            this.intensity *= this.decay;
        } else {
            this.x = this.y = this.intensity = 0;
        }
    }
};
