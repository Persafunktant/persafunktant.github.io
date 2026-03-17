/**
 * Gravity Grid - Main Game Engine
 */

const CONFIG = {
    TILE_SIZE: 40,
    GRAVITY: 0.4,
    JUMP_FORCE: 11.5,
    SCROLL_SPEED: 3.5,
    CANVAS_W: 1280,
    CANVAS_H: 780,
    STARTING_LEVEL_NAME: "Level 1"
};

// ── Spritesheet Atlas ──────────────────────────────────────────────────────
// 512×512 PNG, 8×8 grid, each cell is 64×64px.
// Lookup: tile ID → { col, row } in the grid.
const SPRITE_CELL = 64;
const SPRITE_MAP = {
    1: { col: 0, row: 0 }, // Platform A (cyan)
    2: { col: 1, row: 0 }, // Platform B (pink)
    3: { col: 2, row: 0 }, // Platform C (yellow)
    4: { col: 3, row: 0 }, // Spike Up
    5: { col: 4, row: 0 }, // Spike Down
    6: { col: 5, row: 0 }, // Crumble Block
    7: { col: 6, row: 0 }, // Gravity Switcher
    8: { col: 7, row: 0 }, // Coin (large)
    9: { col: 0, row: 1 }, // Small Coin
};
// Player sprites are kept separate to allow a dedicated animation sheet later.
const PLAYER_SPRITE = {
    1: { col: 1, row: 1 }, // Normal gravity
    '-1': { col: 2, row: 1 }, // Flipped gravity
};

// Load the shared spritesheet once at startup.
const spritesheet = new Image();
spritesheet.src = 'assets/spritesheet.png';
let spritesheetReady = false;
spritesheet.onload = () => { spritesheetReady = true; };

/**
 * Draw one tile from the spritesheet.
 * Falls back to a coloured rect if the sheet isn't loaded yet.
 */
function drawSpriteCell(ctx, tileId, x, y, size) {
    const cell = SPRITE_MAP[tileId];
    if (spritesheetReady && cell) {
        ctx.drawImage(
            spritesheet,
            cell.col * SPRITE_CELL, cell.row * SPRITE_CELL, SPRITE_CELL, SPRITE_CELL,
            x, y, size, size
        );
    } else {
        // Fallback: coloured rect so the game is never broken without the asset
        const fallbackColors = { 1: '#00f2ff', 2: '#ff007a', 3: '#ffcc00', 4: '#ff3333', 5: '#ff3333', 6: '#888', 7: '#ff00ff', 8: '#ffdf00', 9: '#ffdf00' };
        ctx.fillStyle = fallbackColors[tileId] || '#444';
        ctx.fillRect(x, y, size, size);
    }
}

class Player {
    constructor() {
        this.reset();
    }

    reset(preserveState = false) {
        if (!preserveState) {
            this.x = 300;
            this.y = (GRID_H - 6) * CONFIG.TILE_SIZE; // Grounded on bottom floor
            this.vy = 0;
            this.gravityDir = 1; // 1 = Normal, -1 = Inverted
            this.rotation = 0;
            this.targetRotation = 0;
        }
        this.w = 32;
        this.h = 32;
        this.isGrounded = false;
        this.canAction = true;
        this.dead = false;
        this.jumpTrailTimer = 0;
        this.flipTrailTimer = 0;
    }

    jump() {
        if (this.isGrounded && this.canAction) {
            this.vy = -CONFIG.JUMP_FORCE * this.gravityDir;
            this.isGrounded = false;
            this.canAction = false;
            // CW from floor, CCW from ceiling
            this.targetRotation += (this.gravityDir === 1 ? Math.PI * 2 : -Math.PI * 2);
            audio.playSfx('jump');

            // Set Jump Trail Timer (Doubled to 50)
            this.jumpTrailTimer = 50;
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

            // Set Flip Trail Timer
            this.flipTrailTimer = 30;
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

        // Particle Trails
        if (game && !this.dead) {
            const px = this.x + game.scrollX + this.w / 2;
            const py = this.y + this.h / 2;

            if (this.jumpTrailTimer > 0) {
                for (let i = 0; i < 2; i++) {
                    game.particles.push({
                        x: px + (Math.random() - 0.5) * 10,
                        y: py + (Math.random() - 0.5) * 10,
                        vx: (Math.random() - 0.5) * 1,
                        vy: (Math.random() - 0.5) * 1,
                        size: Math.random() * 6 + 4,
                        color: this.gravityDir === 1 ? '#00f2ff' : '#ff007a',
                        life: 0.8,
                        decay: 0.02
                    });
                }
                this.jumpTrailTimer--;
            }

            if (this.flipTrailTimer > 0) {
                for (let i = 0; i < 3; i++) {
                    game.particles.push({
                        x: px + (Math.random() - 0.5) * 15,
                        y: py + (Math.random() - 0.5) * 15,
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2,
                        size: Math.random() * 4 + 2, // Smaller particles (2-6px)
                        color: Math.random() > 0.5 ? '#00f2ff' : '#ff007a',
                        life: 0.8,
                        decay: 0.025
                    });
                }
                this.flipTrailTimer--;
            }
        }
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

                // Gravity Switcher (Tile 7)
                if (tile === 7) {
                    if (!this.lastSwitcherTile || this.lastSwitcherTile.x !== tx || this.lastSwitcherTile.y !== ty) {
                        this.gravityDir *= -1;
                        this.targetRotation += Math.PI;
                        audio.playSfx('flip');
                        this.lastSwitcherTile = { x: tx, y: ty };
                    }
                } else if (this.lastSwitcherTile && (this.lastSwitcherTile.x === tx && this.lastSwitcherTile.y === ty)) {
                    // Reset switcher contact if we move off it (handled by the loop only hitting current tiles)
                }

                // Coin (Tile 8)
                if (tile === 8) {
                    grid[ty][tx] = 0;
                    if (game) {
                        game.levelCoins += 1000;
                        audio.playSfx('coin');

                        // Create Floating Text
                        game.floatingTexts.push({
                            text: '+1000',
                            x: tileLeft + CONFIG.TILE_SIZE / 2,
                            y: tileTop,
                            life: 1.0,
                            vx: 0,
                            vy: -1.5
                        });

                        // Shine particles
                        for (let i = 0; i < 8; i++) {
                            game.particles.push({
                                x: tileLeft + CONFIG.TILE_SIZE / 2,
                                y: tileTop + CONFIG.TILE_SIZE / 2,
                                vx: (Math.random() - 1.5) * 6,
                                vy: (Math.random() - 1.5) * 6,
                                size: Math.random() * 6 + 2,
                                color: '#fff600',
                                life: 1,
                                decay: 0.03
                            });
                        }
                    }
                }

                // Small Coin (Tile 9)
                if (tile === 9) {
                    grid[ty][tx] = 0;
                    if (game) {
                        game.levelCoins += 100;
                        audio.playSfx('coin');

                        // Create Floating Text
                        game.floatingTexts.push({
                            text: '+100',
                            x: tileLeft + CONFIG.TILE_SIZE / 2,
                            y: tileTop,
                            life: 1.0,
                            vx: 0,
                            vy: -1.5
                        });

                        // Shine particles (fewer for small coin)
                        for (let i = 0; i < 5; i++) {
                            game.particles.push({
                                x: tileLeft + CONFIG.TILE_SIZE / 2,
                                y: tileTop + CONFIG.TILE_SIZE / 2,
                                vx: (Math.random() - 0.5) * 4,
                                vy: (Math.random() - 0.5) * 4,
                                size: Math.random() * 4 + 2,
                                color: '#fff600',
                                life: 1,
                                decay: 0.04
                            });
                        }
                    }
                }
            }
        }
        // Clear switcher contact if not touching any switcher
        let touchingSwitcher = false;
        for (let ty = startTileY; ty <= endTileY; ty++) {
            for (let tx = startTileX; tx <= endTileX; tx++) {
                if (grid[ty] && grid[ty][tx] === 7) touchingSwitcher = true;
            }
        }
        if (!touchingSwitcher) this.lastSwitcherTile = null;
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
        setTimeout(() => game && game.reset(false), 1500);
    }

    draw(ctx) {
        if (this.dead) return;
        ctx.save();
        ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
        ctx.rotate(this.rotation);

        // Glow — applied to drawImage the same as fillRect
        const glowColor = this.gravityDir === 1 ? '#00f2ff' : '#ff007a';
        ctx.shadowBlur = 18;
        ctx.shadowColor = glowColor;

        if (spritesheetReady) {
            // Draw player sprite from sheet (row 1; col 1 = normal, col 2 = flipped)
            const pCell = PLAYER_SPRITE[String(this.gravityDir)];
            ctx.drawImage(
                spritesheet,
                pCell.col * SPRITE_CELL, pCell.row * SPRITE_CELL, SPRITE_CELL, SPRITE_CELL,
                -this.w / 2, -this.h / 2, this.w, this.h
            );
        } else {
            // Fallback while sheet loads
            ctx.fillStyle = glowColor;
            ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(-this.w / 2 + 4, -this.h / 2 + 4, this.w - 8, this.h - 8);
        }

        ctx.restore();
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false; // Global setting for crisp pixel art
        this.player = new Player();
        this.scrollX = 0;
        this.level = JSON.parse(JSON.stringify(LEVELS[CONFIG.STARTING_LEVEL_NAME] || LEVELS["Level 1"]));
        this.state = 'MENU';
        this.keys = { left: false, right: false };
        this.particles = [];
        this.floatingTexts = [];
        this.highScore = parseInt(localStorage.getItem('gravityGridHighScore_v2')) || 0;
        this.checkpointScore = 0;
        this.levelCoins = 0;
        this.score = 0;
        this.currentDistance = 0;
        this.currentLevelNum = parseInt(CONFIG.STARTING_LEVEL_NAME.replace("Level ", "")) || 1;
        this.hasMoreLevels = true;
        this.levelTitleAlpha = 1.0;
        this.levelTitleText = CONFIG.STARTING_LEVEL_NAME;
        this.isTransitioning = false;
        this.transitionBoundaryX = 0;

        // HTML UI Elements
        this.uiMenu = document.getElementById('main-menu');
        this.optionsMenu = document.getElementById('options-menu');
        this.btnRestartGame = document.getElementById('btn-restart-game');
        this.btnRestartLevel = document.getElementById('btn-restart-level');
        this.btnResume = document.getElementById('btn-resume');
        this.btnOptions = document.getElementById('btn-options');
        this.btnOptionsBack = document.getElementById('btn-options-back');
        this.btnPause = document.getElementById('btn-pause');
        this.btnFullscreen = document.getElementById('btn-fullscreen');
        this.sliderVolume = document.getElementById('slider-volume');

        if (this.canvas) this.init();
    }

    init() {
        window.addEventListener('resize', () => this.resize());
        this.resize();

        // Input
        window.onmousedown = (e) => {
            if (this.state === 'PLAYING') {
                if (e.button === 0) this.keys.left = true;
                if (e.button === 2) this.keys.right = true;
            } else if (this.state === 'MENU' && e.target === this.canvas) {
                this.start();
            }
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

        if (this.btnRestartGame) this.btnRestartGame.addEventListener('click', () => this.start(true));
        if (this.btnRestartLevel) this.btnRestartLevel.addEventListener('click', () => this.start(false));
        if (this.btnResume) this.btnResume.addEventListener('click', () => this.resume());
        if (this.btnPause) this.btnPause.addEventListener('click', () => this.pause());
        if (this.btnOptions) this.btnOptions.addEventListener('click', () => this.openOptions());
        if (this.btnOptionsBack) this.btnOptionsBack.addEventListener('click', () => this.closeOptions());

        if (this.sliderVolume) {
            this.sliderVolume.addEventListener('input', (e) => {
                audio.setVolume(parseFloat(e.target.value));
            });
        }

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

    getNextLevelNum(currentNum) {
        const keys = Object.keys(LEVELS);
        const levelNums = keys
            .map(k => parseInt(k.replace("Level ", "")))
            .filter(n => !isNaN(n) && n > currentNum)
            .sort((a, b) => a - b);
        return levelNums.length > 0 ? levelNums[0] : null;
    }

    start(isNewGame = false) {
        if (isNewGame) {
            this.currentLevelNum = parseInt(CONFIG.STARTING_LEVEL_NAME.replace("Level ", "")) || 1;
        }
        this.state = 'PLAYING';
        if (this.uiMenu) this.uiMenu.style.display = 'none';
        if (this.btnPause) this.btnPause.style.display = 'block';
        this.reset();
        audio.start();
    }

    pause() {
        this.state = 'PAUSED';
        if (this.uiMenu) this.uiMenu.style.display = 'flex';
        if (this.optionsMenu) this.optionsMenu.style.display = 'none';
        if (this.btnPause) this.btnPause.style.display = 'none';

        if (this.btnResume) this.btnResume.style.display = 'block';
        if (this.btnRestartLevel) {
            this.btnRestartLevel.style.display = 'block';
            this.btnRestartLevel.textContent = 'RESTART LEVEL ' + this.currentLevelNum;
        }
        if (this.btnRestartGame) this.btnRestartGame.textContent = 'RESTART GAME';
    }

    resume() {
        this.state = 'PLAYING';
        if (this.uiMenu) this.uiMenu.style.display = 'none';
        if (this.optionsMenu) this.optionsMenu.style.display = 'none';
        if (this.btnPause) this.btnPause.style.display = 'block';
    }

    openOptions() {
        if (this.uiMenu) this.uiMenu.style.display = 'none';
        if (this.optionsMenu) this.optionsMenu.style.display = 'flex';
    }

    closeOptions() {
        if (this.optionsMenu) this.optionsMenu.style.display = 'none';
        if (this.uiMenu) this.uiMenu.style.display = 'flex';
    }

    reset(isNewGame = false, preservePlayerState = false) {
        if (isNewGame) {
            this.currentLevelNum = parseInt(CONFIG.STARTING_LEVEL_NAME.replace("Level ", "")) || 1;
            this.checkpointScore = 0;
        }
        this.player.reset(preservePlayerState);
        this.scrollX = 0; // The level array is fresh/re-sliced for the current level
        this.currentDistance = 0;
        this.levelCoins = 0;
        this.hasMoreLevels = true;
        this.levelTitleAlpha = 1.0;
        this.levelTitleText = "Level " + this.currentLevelNum;
        this.isTransitioning = false;
        this.transitionBoundaryX = 0;
        this.nextLevelNumFound = null;

        // Safety check if level name exists
        const levelData = LEVELS["Level " + this.currentLevelNum];
        if (levelData) {
            this.level = JSON.parse(JSON.stringify(levelData));
        } else {
            console.error("Level " + this.currentLevelNum + " not found!");
            this.hasMoreLevels = false;
        }

        this.keys = { left: false, right: false };
        this.particles = [];
        this.floatingTexts = [];

        // Ensure menu resets state if player dies
        if (this.state === 'PLAYING') {
            if (this.uiMenu) this.uiMenu.style.display = 'none';
            if (this.optionsMenu) this.optionsMenu.style.display = 'none';
            if (this.btnPause) this.btnPause.style.display = 'block';
        }
    }

    update() {
        if (this.state !== 'PLAYING') return;

        if (this.keys.left) this.player.jump();
        if (this.keys.right) this.player.toggleGravity();

        if (!this.player.dead) {
            this.scrollX += CONFIG.SCROLL_SPEED;

            // Calculate current total score: checkpoint + distance + coins
            const totalDistance = Math.floor((this.player.x + this.scrollX) / CONFIG.TILE_SIZE);
            this.score = this.checkpointScore + totalDistance + this.levelCoins;

            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('gravityGridHighScore_v2', Math.floor(this.highScore));
            }

            if (this.hasMoreLevels && !this.isTransitioning) {
                const currentLevelWidth = this.level[0].length * CONFIG.TILE_SIZE;
                // If we are getting close to the end, prepare the next level
                if (this.scrollX + this.canvas.width >= currentLevelWidth) {
                    const nextLevelNum = this.getNextLevelNum(this.currentLevelNum);
                    const nextLevelData = nextLevelNum ? LEVELS["Level " + nextLevelNum] : null;

                    if (nextLevelData) {
                        // Append next level data row by row
                        for (let y = 0; y < this.level.length; y++) {
                            this.level[y] = this.level[y].concat(JSON.parse(JSON.stringify(nextLevelData[y])));
                        }
                        this.isTransitioning = true;
                        this.transitionBoundaryX = currentLevelWidth;
                        this.nextLevelNumFound = nextLevelNum; // Store which one we found
                    } else {
                        // No more levels found
                        this.hasMoreLevels = false;
                    }
                }
            }

            // Handle the official level crossing once the camera is fully in the new section
            if (this.isTransitioning && this.scrollX >= this.transitionBoundaryX) {
                // Checkpoint! Add distance & coins from the just-finished level
                const distToSubtract = Math.floor(this.transitionBoundaryX / CONFIG.TILE_SIZE);
                this.checkpointScore += (distToSubtract + this.levelCoins);
                this.levelCoins = 0;

                // Trim the old level data from the array
                const tilesToTrim = distToSubtract;
                for (let y = 0; y < this.level.length; y++) {
                    this.level[y] = this.level[y].slice(tilesToTrim);
                }

                // Shift coordinates
                this.scrollX -= this.transitionBoundaryX;
                this.currentLevelNum = this.nextLevelNumFound || (this.currentLevelNum + 1);
                this.levelTitleText = "Level " + this.currentLevelNum;
                this.levelTitleAlpha = 1.0;
                this.isTransitioning = false;
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

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.x += ft.vx;
            ft.y += ft.vy;
            ft.life -= 0.02;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
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

        // Draw Level Grid
        ctx.save();
        ctx.translate(-Math.floor(this.scrollX), 0);

        const startTileX = Math.floor(this.scrollX / CONFIG.TILE_SIZE);
        const endTileX = startTileX + Math.ceil(this.canvas.width / CONFIG.TILE_SIZE) + 1;

        // Pre-compute coin bob once per frame (avoids calling Date.now() per tile)
        const coinBob = Math.sin(Date.now() / 200) * 4;

        for (let y = 0; y < this.level.length; y++) {
            const row = this.level[y];
            if (!row) continue;
            for (let x = startTileX; x < endTileX; x++) {
                if (x < 0 || x >= row.length) continue;
                const tile = row[x];
                if (!tile) continue;

                const px = x * CONFIG.TILE_SIZE;
                const py = y * CONFIG.TILE_SIZE;
                const ts = CONFIG.TILE_SIZE;

                if (tile === 8 || tile === 9) {
                    // Coins keep their programmatic bob; draw sprite with Y offset
                    ctx.save();
                    ctx.translate(Math.floor(px), Math.floor(py + coinBob));
                    drawSpriteCell(ctx, tile, 0, 0, ts);
                    ctx.restore();
                } else {
                    // All other tiles: single drawImage call
                    drawSpriteCell(ctx, tile, px, py, ts);
                }
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
        // Draw floating texts in translated space
        ctx.save();
        ctx.translate(-Math.floor(this.scrollX), 0);
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px Outfit';
        for (const ft of this.floatingTexts) {
            ctx.fillStyle = `rgba(255, 223, 0, ${ft.life})`;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.restore();

        // Draw HUD
        if (this.state === 'PLAYING') {
            // HUD
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 28px Outfit';
            ctx.textAlign = 'left';
            ctx.fillText(`SCORE: ${Math.floor(this.score)}`, 20, 45);

            ctx.textAlign = 'right';
            ctx.fillText(`BEST: ${Math.floor(this.highScore)}`, CONFIG.CANVAS_W - 20, 45);

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
    // Only auto-instantiate if the main game canvas is present
    if (document.getElementById('game-canvas')) {
        game = new Game();
    }
};
