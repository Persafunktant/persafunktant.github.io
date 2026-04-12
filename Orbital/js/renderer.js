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
    const earthRotAngle = -simTime * CONSTANTS.EARTH_ROT_SPEED;
    const moonRotAngle = -simTime * CONSTANTS.MOON_ROT_SPEED;

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
        tx = 0; ty = 0; rotAngle = earthRotAngle;
    } else if (cameraTargetMode === 'moon-pos') {
        tx = state.mx; ty = state.my; rotAngle = 0;
    } else if (cameraTargetMode === 'moon-rot') {
        tx = state.mx; ty = state.my; rotAngle = moonRotAngle;
    } else if (cameraTargetMode === 'ship-pos') {
        tx = state.x; ty = state.y; rotAngle = 0;
    } else if (cameraTargetMode === 'ship-rot') {
        tx = state.x; ty = state.y; 
        const next = pathData[Math.min(currentSimStep + 1, pathData.length - 1)];
        // Rotate so ship points "up" (-90 deg from standard cartesian)
        const heading = Math.atan2(next.y - state.y, next.x - state.x);
        rotAngle = -(heading + Math.PI/2); 
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
    ctx.rotate(-earthRotAngle); // Rotate earth mesh itself
    drawProceduralEarth(ctx, CONSTANTS.EARTH_RADIUS);
    ctx.restore();

    // Moon
    ctx.save();
    ctx.translate(state.mx, state.my);
    ctx.rotate(-moonRotAngle);
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
    ctx.setLineDash([6, 6]);
    
    let lineSOI = 'Earth';
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6'; // Default blue for Earth SOI
    
    pathData.forEach((p, i) => {
        if (i === 0) {
            ctx.moveTo(p.x, p.y);
        } else {
            // Color switch on SOI boundary
            if (p.soi !== lineSOI) {
                ctx.stroke();
                ctx.beginPath();
                ctx.strokeStyle = p.soi === 'Moon' ? '#facc15' : '#3b82f6';
                ctx.moveTo(p.x, p.y);
                lineSOI = p.soi;
            }
            if (i % 3 === 0) ctx.lineTo(p.x, p.y); // Optimize rendering
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
    orbitMarkers.forEach(m => {
        ctx.fillStyle = m.type === 'Ap' ? '#ef4444' : '#10b981'; 
        ctx.beginPath();
        const s = 4/camera.zoom;
        ctx.moveTo(m.x, m.y - s);
        ctx.lineTo(m.x + s, m.y);
        ctx.lineTo(m.x, m.y + s);
        ctx.lineTo(m.x - s, m.y);
        ctx.fill();
        
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `bold ${10/camera.zoom}px JetBrains Mono`;
        ctx.fillText(m.type, m.x + 6/camera.zoom, m.y + 4/camera.zoom);
    });

    // =============================
    // DRAW SHIP
    // =============================
    ctx.save();
    ctx.translate(state.x, state.y);
    const nextNode = pathData[Math.min(currentSimStep + 1, pathData.length - 1)];
    const shipHeading = Math.atan2(nextNode.y - state.y, nextNode.x - state.x);
    ctx.rotate(shipHeading);
    drawProceduralShip(ctx, camera.zoom, state.soi === 'Moon', isBurning);
    ctx.restore();

    ctx.restore(); // Restore main canvas transforms
}
