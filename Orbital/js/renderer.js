// renderer.js - Camera Matrices and Drawing Loops

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width, height;
let cameraTargetMode = 'earth-pos'; // Options: earth-pos, earth-rot, moon-pos, moon-rot, ship-pos, ship-rot

let camera = { x: 0, y: 0, zoom: 0.8 };
let renderTimeWarp = 1;

function resizeCanvas() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // initial

// Variables managed by game.js
let currentSimStep = 0;
let isPaused = true;
let burnNodesRef = [];

function drawScene() {
    ctx.clearRect(0, 0, width, height);
    
    if (pathData.length === 0) return;
    
    // Clamp step
    if (currentSimStep >= pathData.length) currentSimStep = pathData.length - 1;
    const state = pathData[currentSimStep];
    const simTime = state.t;
    
    // Link planet spins deterministicly to mission time
    const earthRotAngle = simTime * CONSTANTS.EARTH_ROT_SPEED;
    const moonRotAngle = simTime * CONSTANTS.MOON_ROT_SPEED;

    // Check if we are in a burn window right now (for visual exhaust)
    let isBurning = false;
    burnNodesRef.forEach(bn => {
        // Simple logic: if within 1 frame of burn time
        if (Math.abs(simTime - bn.time) < CONSTANTS.STEP_SIZE * 5) {
            isBurning = true;
        }
    });

    ctx.save();
    
    // 1. Move to center of screen
    ctx.translate(width / 2, height / 2);
    
    // 2. Apply user mouse dragging translation (offset) and zoom
    // Wait, if camera is locked, we might still want to allow zooming. We will apply mouse X/Y as an offset.
    ctx.scale(camera.zoom, camera.zoom);
    
    // 3. Apply Camera Target Translation & Rotation Locks
    let tx = 0, ty = 0, rotAngle = 0;
    
    if (cameraTargetMode === 'earth-pos') {
        tx = 0; ty = 0; rotAngle = 0;
    } else if (cameraTargetMode === 'earth-rot') {
        tx = 0; ty = 0; rotAngle = -earthRotAngle;
    } else if (cameraTargetMode === 'moon-pos') {
        tx = state.mx; ty = state.my; rotAngle = 0;
    } else if (cameraTargetMode === 'moon-rot') {
        tx = state.mx; ty = state.my; rotAngle = -moonRotAngle;
    } else if (cameraTargetMode === 'ship-pos') {
        tx = state.x; ty = state.y; rotAngle = 0;
    } else if (cameraTargetMode === 'ship-rot') {
        tx = state.x; ty = state.y; 
        // Rotate so ship sprite forward (Right) points "up" (subtract 90 deg)
        rotAngle = -(state.angle + Math.PI/2); 
    }

    // Apply the transforms (negative tx, ty because we move the universe, not the camera)
    ctx.rotate(rotAngle);
    ctx.translate(-tx + camera.x, -ty + camera.y);

    // =============================
    // DRAW BACKGROUND & ORBITS
    // =============================
    
    // Moon's circular orbit line around Earth
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.beginPath(); 
    ctx.arc(0, 0, CONSTANTS.MOON_ORBIT_DIST, 0, Math.PI*2); 
    ctx.stroke();

    // Earth
    ctx.save();
    ctx.translate(0, 0);
    ctx.rotate(earthRotAngle); // Rotate earth mesh itself
    drawProceduralEarth(ctx, CONSTANTS.EARTH_RADIUS);
    ctx.restore();

    // Moon
    ctx.save();
    ctx.translate(state.mx, state.my);
    ctx.rotate(moonRotAngle);
    drawProceduralMoon(ctx, CONSTANTS.MOON_RADIUS);
    ctx.restore();
    
    // Moon SOI Ring
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath(); 
    ctx.arc(state.mx, state.my, CONSTANTS.SOI_RADIUS, 0, Math.PI*2); 
    ctx.stroke();

    // =============================
    // DRAW PREDICTED FLIGHT PATH
    // =============================
    ctx.lineWidth = 2 / camera.zoom;
    
    let lineSOI = pathData[0].soi;
    let lineBurning = pathData[0].burning;
    
    const getPathStyle = (soi, burning) => {
        if (burning) return { color: '#f97316', dash: [] }; // Orange solid for burns
        if (soi === 'Moon') return { color: '#facc15', dash: [6, 6] }; // Yellow dashed for Moon
        return { color: '#3b82f6', dash: [6, 6] }; // Blue dashed for Earth
    };

    let currentStyle = getPathStyle(lineSOI, lineBurning);
    ctx.beginPath();
    ctx.strokeStyle = currentStyle.color;
    ctx.setLineDash(currentStyle.dash);
    
    pathData.forEach((p, i) => {
        if (i === 0) {
            ctx.moveTo(p.x, p.y);
        } else {
            const nextStyle = getPathStyle(p.soi, p.burning);
            
            // Switch style if SOI or Burning state changes
            if (nextStyle.color !== currentStyle.color || nextStyle.dash.length !== currentStyle.dash.length) {
                // Finish previous segment
                ctx.stroke();
                
                // Start next segment from the SAME point to avoid gaps
                ctx.beginPath();
                ctx.strokeStyle = nextStyle.color;
                ctx.setLineDash(nextStyle.dash);
                ctx.moveTo(pathData[i-1].x, pathData[i-1].y);
                currentStyle = nextStyle;
            }

            const res = p.burning ? 1 : 3;
            if (i % res === 0 || i === pathData.length - 1) {
                ctx.lineTo(p.x, p.y);
            }
        }
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // =============================
    // DRAW MOON-RELATIVE "GHOST" ORBIT (BROWN)
    // =============================
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeStyle = '#a0522d'; 
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let firstMoonPoint = true;
    pathData.forEach(p => {
        if (p.soi === 'Moon') {
            const rx = p.x - p.mx;
            const ry = p.y - p.my;
            const drawX = state.mx + rx;
            const drawY = state.my + ry;
            if (firstMoonPoint) {
                ctx.moveTo(drawX, drawY);
                firstMoonPoint = false;
            } else {
                ctx.lineTo(drawX, drawY);
            }
        }
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // =============================
    // DRAW MULTIPLE GHOST INTERCEPTS
    // =============================
    interceptEvents.forEach(ev => {
        if (ev.type === 'ENTER') {
            ctx.save();
            ctx.fillStyle = 'rgba(250, 204, 21, 0.05)';
            ctx.strokeStyle = '#d29922';
            ctx.setLineDash([2, 2]);
            ctx.lineWidth = 1 / camera.zoom;
            // Ghost Moon
            ctx.beginPath(); ctx.arc(ev.mx, ev.my, CONSTANTS.MOON_RADIUS, 0, Math.PI*2); ctx.fill();
            // Ghost SOI
            ctx.beginPath(); ctx.arc(ev.mx, ev.my, CONSTANTS.SOI_RADIUS, 0, Math.PI*2); ctx.stroke();
            
            // Highlight exact intercept point
            ctx.fillStyle = 'white';
            ctx.beginPath(); ctx.arc(ev.x, ev.y, 4/camera.zoom, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    });

    // =============================
    // DRAW MANEUVER NODES
    // =============================
    burnNodesRef.forEach(bn => {
        const idx = Math.floor(bn.time / CONSTANTS.STEP_SIZE);
        if (idx >= 0 && idx < pathData.length) {
            const p = pathData[idx];
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath(); ctx.arc(p.x, p.y, 6/camera.zoom, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = `bold ${10/camera.zoom}px JetBrains Mono`;
            ctx.fillText(bn.label, p.x + 10/camera.zoom, p.y - 10/camera.zoom);
        }
    });

    // =============================
    // DRAW AP / PE PERIAPSIS MARKERS
    // =============================
    const futureMarkers = orbitMarkers.filter(m => m.step > currentSimStep);
    const nextMarkers = [];
    
    const findNext = (body, type) => {
        const matches = futureMarkers.filter(m => m.body === body && m.type === type);
        if (matches.length === 0) return null;
        return matches.reduce((prev, curr) => (curr.step < prev.step ? curr : prev));
    };

    const upcoming = [
        findNext('Moon', 'Pe'), findNext('Moon', 'Ap'),
        findNext('Earth', 'Pe'), findNext('Earth', 'Ap')
    ].filter(m => m !== null);

    upcoming.forEach(m => {
        // We draw the marker at its logical "pinned" location
        const drawMarker = (dx, dy, label) => {
            ctx.fillStyle = m.type === 'Ap' ? '#ef4444' : '#10b981'; 
            ctx.beginPath();
            const s = 4/camera.zoom;
            ctx.moveTo(dx, dy - s);
            ctx.lineTo(dx + s, dy);
            ctx.lineTo(dx, dy + s);
            ctx.lineTo(dx - s, dy);
            ctx.fill();
            
            ctx.fillStyle = '#e2e8f0';
            ctx.font = `bold ${10/camera.zoom}px JetBrains Mono`;
            ctx.fillText(label, dx + 6/camera.zoom, dy + 4/camera.zoom);
        };

        if (m.body === 'Moon') {
            // 1. Draw on Brown Relative Orbit (Pinned to current moon)
            drawMarker(state.mx + m.relX, state.my + m.relY, m.type);
            // 2. Draw on Yellow Absolute Path (Fixed in stars at future moon position)
            drawMarker(m.x, m.y, m.type + "*"); // Use asterisk for the absolute one
        } else {
            // Earth markers just go on the absolute path
            drawMarker(m.x, m.y, m.type);
        }
    });

    // =============================
    // DRAW SHIP
    // =============================
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate(state.angle);
    drawProceduralShip(ctx, camera.zoom, state.soi === 'Moon', isBurning);
    ctx.restore();

    ctx.restore(); // Restore main canvas transforms
}
