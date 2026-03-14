/**
 * Gravity Grid - Main Game Engine
 */

const CONFIG = {
    TILE_SIZE: 40,
    GRAVITY: 0.4,
    JUMP_FORCE: 12,
    SCROLL_SPEED: 3.5,
    CANVAS_W: 1280,
    CANVAS_H: 780
};

class Player {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 300;
        this.y = (GRID_H - 6) * CONFIG.TILE_SIZE; // Grounded on bottom floor
        this.w = 32;
        this.h = 32;
        this.vy = 0;
        this.gravityDir = 1; // 1 = Normal, -1 = Inverted
        this.isGrounded = false;
        this.rotation = 0;
        this.targetRotation = 0;
        this.canAction = true;
        this.dead = false;
    }

    jump() {
        if (this.isGrounded && this.canAction) {
            this.vy = -CONFIG.JUMP_FORCE * this.gravityDir;
            this.isGrounded = false;
            this.canAction = false;
            // CW from floor, CCW from ceiling
            this.targetRotation += (this.gravityDir === 1 ? Math.PI / 2 : -Math.PI / 2);
            audio.playSfx('jump');
        }
    }

    toggleGravity() {
        if (this.isGrounded && this.canAction) {
            this.gravityDir *= -1;
            this.isGrounded = false;
            this.canAction = false;
            // Add a half rotation flip when toggling gravity
            this.targetRotation += Math.PI;
            audio.playSfx('flip');
        }
    }

    update(grid, scrollX) {
        if (this.dead) return;

        // Apply Physics
        this.vy += CONFIG.GRAVITY * this.gravityDir;
        this.y += this.vy;

        // Check Grounding/Collision
        this.isGrounded = false;
        const checkPoints = [
            { x: this.x, y: this.y },
            { x: this.x + this.w, y: this.y },
            { x: this.x, y: this.y + this.h },
            { x: this.x + this.w, y: this.y + this.h }
        ];

        // Simple Grid Detection
        const gridX = Math.floor((this.x + scrollX) / CONFIG.TILE_SIZE);
        const gridY = Math.floor(this.y / CONFIG.TILE_SIZE);

        // Detailed tile collision
        this.checkCollisions(grid, scrollX);

        // Rotation Smoothing - slowed down to take the arc length
        this.rotation += (this.targetRotation - this.rotation) * 0.06;

        // Bounds Check
        if (this.y < -100 || this.y > CONFIG.CANVAS_H + 100) this.die();
    }

    checkCollisions(grid, scrollX) {
        const left = this.x + scrollX;
        const right = left + this.w;
        const top = this.y;
        const bottom = top + this.h;

        const startTileX = Math.floor(left / CONFIG.TILE_SIZE);
        const endTileX = Math.floor(right / CONFIG.TILE_SIZE);
        const startTileY = Math.floor(top / CONFIG.TILE_SIZE);
        const endTileY = Math.floor(bottom / CONFIG.TILE_SIZE);

        for (let ty = startTileY; ty <= endTileY; ty++) {
            for (let tx = startTileX; tx <= endTileX; tx++) {
                if (!grid[ty] || grid[ty][tx] === undefined) continue;
                const tile = grid[ty][tx];
                if (tile === 0) continue;

                const tileLeft = tx * CONFIG.TILE_SIZE;
                const tileRight = tileLeft + CONFIG.TILE_SIZE;
                const tileTop = ty * CONFIG.TILE_SIZE;
                const tileBottom = tileTop + CONFIG.TILE_SIZE;

                // Collision detected
                if (tile >= 1 && tile <= 3 || tile === 6) { // Solid or Crumble
                    let hitSolid = false;
                    // Floor collision (moving down into a floor)
                    if (this.gravityDir === 1 && this.vy >= 0 && bottom >= tileTop && top < tileTop) {
                        this.y = tileTop - this.h;
                        this.vy = 0;
                        this.isGrounded = true;
                        this.canAction = true;
                        this.rotation = Math.round(this.rotation / (Math.PI / 2)) * (Math.PI / 2);
                        this.targetRotation = this.rotation;
                        hitSolid = true;
                    }
                    // Ceiling collision (moving up into a ceiling)
                    else if (this.gravityDir === -1 && this.vy <= 0 && top <= tileBottom && bottom > tileBottom) {
                        this.y = tileBottom;
                        this.vy = 0;
                        this.isGrounded = true;
                        this.canAction = true;
                        this.rotation = Math.round(this.rotation / (Math.PI / 2)) * (Math.PI / 2);
                        this.targetRotation = this.rotation;
                        hitSolid = true;
                    }
                    // Side collision = Death (simplified autoscroller)
                    else if (right > tileLeft + 5 && left < tileLeft && bottom > tileTop + 5 && top < tileBottom - 5) {
                        this.die();
                    }

                    if (hitSolid && tile === 6) {
                        grid[ty][tx] = 0;
                        if (game) {
                            for (let i = 0; i < 6; i++) {
                                game.particles.push({
                                    x: tileLeft + Math.random() * CONFIG.TILE_SIZE,
                                    y: tileTop + Math.random() * CONFIG.TILE_SIZE,
                                    vx: (Math.random() - 0.5) * 4,
                                    vy: this.gravityDir * (Math.random() * 3 + 2),
                                    size: Math.random() * 8 + 4,
                                    color: '#888',
                                    life: 1,
                                    decay: 0.02 + Math.random() * 0.03
                                });
                            }
                        }
                    }
                }

                // Spike Collision
                if (tile === 4 || tile === 5) {
                    this.die();
                }
            }
        }
    }

    die() {
        if (this.dead) return;
        this.dead = true;
        audio.playSfx('death');
        if (game) {
            const finalDist = Math.floor((this.x + game.scrollX) / CONFIG.TILE_SIZE);
            if (finalDist > game.highScore) {
                game.highScore = finalDist;
                localStorage.setItem('gravityGridHighScore_v2', game.highScore);
            }
            for (let i = 0; i < 30; i++) {
                game.particles.push({
                    x: this.x + game.scrollX + this.w / 2,
                    y: this.y + this.h / 2,
                    vx: (Math.random() - 0.5) * 15,
                    vy: (Math.random() - 0.5) * 15,
                    size: Math.random() * 10 + 5,
                    color: this.gravityDir === 1 ? '#00f2ff' : '#ff007a',
                    life: 1,
                    decay: 0.01 + Math.random() * 0.02
                });
            }
        }
        setTimeout(() => game && game.reset(), 1500);
    }

    draw(ctx) {
        if (this.dead) return;
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        ctx.rotate(this.rotation);

        // Draw Core
        ctx.fillStyle = this.gravityDir === 1 ? '#00f2ff' : '#ff007a';
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);

        // Detail
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.w / 2 + 4, -this.h / 2 + 4, this.w - 8, this.h - 8);

        ctx.restore();
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.player = new Player();
        this.scrollX = 0;
        this.level = JSON.parse(JSON.stringify(LEVELS["Level 1"]));
        this.state = 'MENU';
        this.keys = { left: false, right: false };
        this.particles = [];
        this.highScore = parseInt(localStorage.getItem('gravityGridHighScore_v2')) || 0;
        this.currentDistance = 0;
        this.currentLevelNum = 1;
        this.hasMoreLevels = true;
        this.levelTitleAlpha = 1.0;
        this.levelTitleText = "Level 1";

        // HTML UI Elements
        this.uiMenu = document.getElementById('main-menu');
        this.btnStart = document.getElementById('btn-start');
        this.btnResume = document.getElementById('btn-resume');
        this.btnPause = document.getElementById('btn-pause');
        this.btnFullscreen = document.getElementById('btn-fullscreen');

        this.init();
    }

    init() {
        window.addEventListener('resize', () => this.resize());
        this.resize();

        // Input
        window.onmousedown = (e) => {
            if (this.state !== 'PLAYING') {
                this.start();
                return;
            }
            if (e.button === 0) this.keys.left = true;
            if (e.button === 2) this.keys.right = true;
        };
        window.onmouseup = (e) => {
            if (e.button === 0) this.keys.left = false;
            if (e.button === 2) this.keys.right = false;
        };
        // Disable context menu for right click
        window.oncontextmenu = (e) => e.preventDefault();

        window.onkeydown = (e) => {
            if (e.code === 'Space') this.keys.left = true;
            if (e.code === 'Escape') {
                if (this.state === 'PLAYING') this.pause();
                else if (this.state === 'PAUSED') this.resume();
            }
        };
        window.onkeyup = (e) => {
            if (e.code === 'Space') this.keys.left = false;
        };

        // HTML Button Events
        this.btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });

        this.btnStart.addEventListener('click', () => this.start(true));
        this.btnResume.addEventListener('click', () => this.resume());
        this.btnPause.addEventListener('click', () => this.pause());

        // Mobile Touch Controls
        window.addEventListener('touchstart', (e) => {
            if (e.target === this.canvas || e.target === document.body) e.preventDefault();
            if (this.state !== 'PLAYING') return;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].clientX < window.innerWidth / 2) {
                    this.keys.left = true;
                } else {
                    this.keys.right = true;
                }
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            if (e.target === this.canvas) e.preventDefault();
            this.keys.left = false;
            this.keys.right = false;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].clientX < window.innerWidth / 2) {
                    this.keys.left = true;
                } else {
                    this.keys.right = true;
                }
            }
        }, { passive: false });

        this.loop();
    }

    resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const targetRatio = CONFIG.CANVAS_W / CONFIG.CANVAS_H;
        const currentRatio = width / height;

        let displayW, displayH;
        if (currentRatio > targetRatio) {
            displayH = height;
            displayW = height * targetRatio;
        } else {
            displayW = width;
            displayH = width / targetRatio;
        }

        this.canvas.style.width = displayW + 'px';
        this.canvas.style.height = displayH + 'px';
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = (width - displayW) / 2 + 'px';
        this.canvas.style.top = (height - displayH) / 2 + 'px';

        // Internal resolution remains fixed
        this.canvas.width = CONFIG.CANVAS_W;
        this.canvas.height = CONFIG.CANVAS_H;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    start(isNewGame = false) {
        if (isNewGame) {
            this.currentLevelNum = 1;
        }
        this.state = 'PLAYING';
        this.uiMenu.style.display = 'none';
        this.btnPause.style.display = 'block';
        this.reset();
        audio.start();
    }

    pause() {
        this.state = 'PAUSED';
        this.uiMenu.style.display = 'flex';
        this.btnPause.style.display = 'none';
        this.btnResume.style.display = 'block';
        this.btnStart.textContent = 'RESTART LEVEL 1';
    }

    resume() {
        this.state = 'PLAYING';
        this.uiMenu.style.display = 'none';
        this.btnPause.style.display = 'block';
    }

    reset() {
        this.player.reset();
        this.scrollX = 0;
        this.currentDistance = 0;
        this.hasMoreLevels = true;
        this.levelTitleAlpha = 1.0;
        this.levelTitleText = "Level " + this.currentLevelNum;
        this.level = JSON.parse(JSON.stringify(LEVELS["Level " + this.currentLevelNum]));
        this.keys = { left: false, right: false };
        this.particles = [];

        // Ensure menu resets state if player dies
        if (this.state === 'PLAYING') {
            this.uiMenu.style.display = 'none';
            this.btnPause.style.display = 'block';
        }
    }

    update() {
        if (this.state !== 'PLAYING') return;

        if (this.keys.left) this.player.jump();
        if (this.keys.right) this.player.toggleGravity();

        if (!this.player.dead) {
            this.scrollX += CONFIG.SCROLL_SPEED;
            this.currentDistance = Math.floor((this.player.x + this.scrollX) / CONFIG.TILE_SIZE);
            if (this.currentDistance > this.highScore) {
                this.highScore = this.currentDistance; // Update high score dynamically while playing
            }

            if (this.hasMoreLevels) {
                const levelEndX = this.level[0].length * CONFIG.TILE_SIZE;
                // If within 800 pixels of the end of the loaded level array, stitch the next one!
                if (this.scrollX + this.canvas.width + 800 >= levelEndX) {
                    this.currentLevelNum++;
                    this.levelTitleAlpha = 1.0;
                    this.levelTitleText = "Level " + this.currentLevelNum;
                    const nextLevelData = LEVELS["Level " + this.currentLevelNum];
                    if (nextLevelData && nextLevelData.length > 0) {
                        for (let y = 0; y < this.level.length; y++) {
                            const rowToAdd = nextLevelData[y] ? nextLevelData[y] : Array(nextLevelData[0].length).fill(0);
                            this.level[y] = this.level[y].concat(JSON.parse(JSON.stringify(rowToAdd)));
                        }
                    } else {
                        this.hasMoreLevels = false; // No more levels defined, game continues into the void
                    }
                }
            }
        }
        this.player.update(this.level, this.scrollX);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        if (this.levelTitleAlpha > 0) {
            this.levelTitleAlpha -= 0.005;
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Parallax Grids
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.2)';
        ctx.lineWidth = 1;
        const pSize1 = 100;
        const offsetX1 = (this.scrollX * 0.2) % pSize1;
        for (let x = -offsetX1; x < this.canvas.width; x += pSize1) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += pSize1) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255, 0, 122, 0.15)';
        const pSize2 = 160;
        const offsetX2 = (this.scrollX * 0.4) % pSize2;
        for (let x = -offsetX2; x < this.canvas.width; x += pSize2) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += pSize2) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
        }
        ctx.restore();

        // Push game area down for header
        const headerH = 60;
        ctx.save();
        ctx.translate(0, headerH);

        ctx.save();
        ctx.translate(-Math.floor(this.scrollX), 0);

        // Draw Level Grid
        const startTileX = Math.floor(this.scrollX / CONFIG.TILE_SIZE);
        const endTileX = startTileX + Math.ceil(this.canvas.width / CONFIG.TILE_SIZE) + 1;

        for (let y = 0; y < this.level.length; y++) {
            for (let x = startTileX; x < endTileX; x++) {
                const tile = this.level[y][x];
                if (!tile) continue;

                ctx.save();
                ctx.translate(x * CONFIG.TILE_SIZE, y * CONFIG.TILE_SIZE);

                if (tile === 1 || tile === 2 || tile === 3 || tile === 6) {
                    let baseColor = '#666';
                    if (tile === 1) baseColor = '#00f2ff';
                    if (tile === 2) baseColor = '#ff007a';
                    if (tile === 3) baseColor = '#ffcc00';

                    ctx.fillStyle = baseColor;
                    ctx.fillRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

                    const ts = CONFIG.TILE_SIZE;
                    const b = 6; // border width

                    // Highlight top/left
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.beginPath();
                    ctx.moveTo(0, 0); ctx.lineTo(ts, 0); ctx.lineTo(ts - b, b); ctx.lineTo(b, b); ctx.lineTo(b, ts - b); ctx.lineTo(0, ts); ctx.fill();

                    // Shadow bottom/right
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.beginPath();
                    ctx.moveTo(ts, ts); ctx.lineTo(0, ts); ctx.lineTo(b, ts - b); ctx.lineTo(ts - b, ts - b); ctx.lineTo(ts - b, b); ctx.lineTo(ts, 0); ctx.fill();

                    // Inner highlight
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.fillRect(b, b, ts - b * 2, ts - b * 2);

                    if (tile === 6) {
                        // Add some cracks for crumbling block
                        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(b + 5, b + 5); ctx.lineTo(ts / 2, ts / 2); ctx.lineTo(ts - 10, ts / 2 + 5);
                        ctx.stroke();
                    }
                }

                if (tile === 4) { // Spike Up
                    const ts = CONFIG.TILE_SIZE;
                    ctx.fillStyle = '#ff6666'; // Light side
                    ctx.beginPath(); ctx.moveTo(ts / 2, 5); ctx.lineTo(5, ts - 5); ctx.lineTo(ts / 2, ts - 5); ctx.fill();
                    ctx.fillStyle = '#cc0000'; // Dark side
                    ctx.beginPath(); ctx.moveTo(ts / 2, 5); ctx.lineTo(ts / 2, ts - 5); ctx.lineTo(ts - 5, ts - 5); ctx.fill();
                }
                if (tile === 5) { // Spike Down
                    const ts = CONFIG.TILE_SIZE;
                    ctx.fillStyle = '#ff6666'; // Light side
                    ctx.beginPath(); ctx.moveTo(ts / 2, ts - 5); ctx.lineTo(5, 5); ctx.lineTo(ts / 2, 5); ctx.fill();
                    ctx.fillStyle = '#cc0000'; // Dark side
                    ctx.beginPath(); ctx.moveTo(ts / 2, ts - 5); ctx.lineTo(ts / 2, 5); ctx.lineTo(ts - 5, 5); ctx.fill();
                }

                ctx.restore();
            }
        }
        ctx.restore();

        this.player.draw(ctx);

        ctx.save();
        ctx.translate(-Math.floor(this.scrollX), 0);
        for (let p of this.particles) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.restore();

        // End Game Area Translation
        ctx.restore();

        // Draw HUD Header Bg
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, this.canvas.width, 60);
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(this.canvas.width, 60); ctx.stroke();

        // Draw HUD
        if (this.state === 'PLAYING') {
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.font = '24px Outfit';
            ctx.fillText(`DISTANCE: ${this.currentDistance}`, 20, 38);

            ctx.textAlign = 'right';
            ctx.fillText(`HIGH SCORE: ${this.highScore}`, this.canvas.width - 20, 38);

            // Draw Level Title
            if (this.levelTitleAlpha > 0) {
                ctx.save();
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, this.levelTitleAlpha)})`;
                ctx.textAlign = 'center';
                ctx.font = 'bold 64px Outfit';
                ctx.fillText(this.levelTitleText, this.canvas.width / 2, 140);
                ctx.restore();
            }
        }

        // Removed old canvas menu drawing, now handled by DOM elements
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

const audio = new ChiptuneEngine();
let game;
window.onload = () => {
    game = new Game();
};
