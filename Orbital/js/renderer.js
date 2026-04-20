// renderer.js - Camera Matrices and Drawing Loops

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width, height;
let cameraTargetMode = 'earth-pos'; // Options: earth-pos, earth-rot, moon-pos, moon-rot, ship-pos, ship-rot

let camera = { x: 0, y: 0, zoom: 0.8 };
let renderTimeWarp = 1;

let viewMode = 'MAP'; // MAP or LANDING
function toggleViewMode() {
    viewMode = viewMode === 'MAP' ? 'LANDING' : 'MAP';
    if (viewMode === 'LANDING') {
        camera.zoom = 15; // Set starting zoom
    } else {
        camera.zoom = 0.8; // Restore map zoom
    }
}

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

function drawScene(interpolatedState) {
    ctx.clearRect(0, 0, width, height);
    
    if (pathData.length === 0) return;
    
    // Clamp step
    if (currentSimStep >= pathData.length) currentSimStep = pathData.length - 1;
    const state = interpolatedState || pathData[currentSimStep];
    const simTime = state.t;
    
    // Link planet spins deterministicly to mission time
    const earthRotAngle = simTime * CONSTANTS.EARTH_ROT_SPEED;
    const moonRotAngle = simTime * CONSTANTS.MOON_ROT_SPEED;

    // Check if we are in a burn window right now (for visual exhaust)
    let isBurning = false;
    burnNodesRef.forEach(bn => {
        // Find physical runtime overlaps
        if (simTime >= bn.time - 2.0 && Math.abs(simTime - bn.time) < 10.0 && state.burning) {
            isBurning = true;
        }
    });

    ctx.save();
    
    // 1. Move to center of screen
    ctx.translate(width / 2, height / 2);
    
    // 2. Apply user mouse dragging translation (offset) and zoom
    let activeZoom = camera.zoom;
    let activeTargetMode = cameraTargetMode;
    if (viewMode === 'LANDING') {
        // Enforce lock but don't hardcode zoom
        activeTargetMode = 'ship-pos'; 
    }
    
    ctx.scale(activeZoom, activeZoom);
    
    // 3. Apply Camera Target Translation & Rotation Locks
    let tx = 0, ty = 0, rotAngle = 0;
    
    if (activeTargetMode === 'earth-pos') {
        tx = 0; ty = 0; rotAngle = 0;
    } else if (activeTargetMode === 'earth-rot') {
        tx = 0; ty = 0; rotAngle = -earthRotAngle;
    } else if (activeTargetMode === 'moon-pos') {
        tx = state.mx; ty = state.my; rotAngle = 0;
    } else if (activeTargetMode === 'moon-rot') {
        tx = state.mx; ty = state.my; rotAngle = -moonRotAngle;
    } else if (activeTargetMode === 'ship-pos') {
        tx = state.x; ty = state.y; rotAngle = 0;
    } else if (activeTargetMode === 'ship-rot') {
        tx = state.x; ty = state.y; 
        // Rotate so ship sprite forward (Right) points "up" (subtract 90 deg)
        rotAngle = -(state.angle + Math.PI/2); 
    }

    // Apply the transforms (negative tx, ty because we move the universe, not the camera)
    ctx.rotate(rotAngle);
    
    // Disable manual panning in landing view so we don't accidentally get lost
    if (viewMode === 'LANDING') {
        ctx.translate(-tx, -ty);
    } else {
        ctx.translate(-tx + camera.x, -ty + camera.y);
    }

    // =============================
    // DRAW BACKGROUND & ORBITS
    // =============================
    
    CONSTANTS.BODIES.forEach(b => {
        if (!b.isCentral) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 2 / activeZoom;
            ctx.beginPath(); 
            ctx.arc(0, 0, b.orbitDist, 0, Math.PI*2); 
            ctx.stroke();
        }
    });

    // Draw Bodies
    if (state.bodiesSnapshot) {
        CONSTANTS.BODIES.forEach(b => {
            const bp = state.bodiesSnapshot[b.name];
            ctx.save();
            ctx.translate(bp.x, bp.y);
            ctx.rotate(bp.ang);
            
            // Draw specific procedural planet if it exists, otherwise just a colored circle
            if (b.name === 'Earth' && typeof drawProceduralEarth !== 'undefined') {
                drawProceduralEarth(ctx, b.radius);
            } else if (b.name === 'Moon' && typeof drawProceduralMoon !== 'undefined') {
                drawProceduralMoon(ctx, b.radius);
            } else if (b.name === 'Moon2' && typeof drawProceduralMoon2 !== 'undefined') {
                drawProceduralMoon2(ctx, b.radius);
            } else {
                ctx.fillStyle = b.color;
                ctx.beginPath(); ctx.arc(0, 0, b.radius, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
            
            // SOI ring for non-central bodies
            if (!b.isCentral) {
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1 / activeZoom;
                ctx.beginPath(); ctx.arc(bp.x, bp.y, CONSTANTS.SOI_RADIUS, 0, Math.PI*2); ctx.stroke();
            }
            
            // Target Reticle
            if (b.name === window.targetedBodyName) {
                ctx.strokeStyle = '#22d3ee';
                ctx.lineWidth = 2 / activeZoom;
                ctx.setLineDash([8/activeZoom, 4/activeZoom]);
                ctx.beginPath();
                ctx.arc(bp.x, bp.y, b.radius * 1.5, simTime * 0.5, simTime * 0.5 + Math.PI*2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
    }

    // =============================
    // DRAW PREDICTED FLIGHT PATH
    // =============================
    
    // Check toggles
    const autoHide = document.getElementById('toggle-autohide')?.checked;
    const focusPath = document.getElementById('toggle-local-path')?.checked;
    const shouldHidePaths = (autoHide && !isPaused) || viewMode === 'LANDING';

    let startIdx = 0;
    let endIdx = pathData.length - 1;
    if (focusPath && viewMode !== 'LANDING') {
        startIdx = Math.max(0, currentSimStep - 2000);
        endIdx = Math.min(pathData.length - 1, currentSimStep + 2000);
    }

    if (!shouldHidePaths) {
        
    ctx.lineWidth = 2 / activeZoom;
    
    let lineSOI = pathData[startIdx].soi;
    let lineBurning = pathData[startIdx].burning;
    
    const getPathStyle = (soi, burning) => {
        if (burning) return { color: '#f97316', dash: [] }; // Orange solid for burns
        if (soi === 'Moon') return { color: '#facc15', dash: [6, 6] }; // Yellow dashed for Moon
        if (soi === 'Moon2') return { color: '#a78bfa', dash: [6, 6] }; // Purple dashed
        return { color: '#3b82f6', dash: [6, 6] }; // Blue dashed for Earth
    };

    let currentStyle = getPathStyle(lineSOI, lineBurning);
    ctx.beginPath();
    ctx.strokeStyle = currentStyle.color;
    ctx.setLineDash(currentStyle.dash);
    
    for (let i = startIdx; i <= endIdx; i++) {
        const p = pathData[i];
        if (i === startIdx) {
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
            if (i % res === 0 || i === endIdx) {
                ctx.lineTo(p.x, p.y);
            }
        }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // =============================
    // DRAW BODY-RELATIVE "GHOST" ORBIT
    // =============================
    const showMoonPath = document.getElementById('toggle-moon-path')?.checked !== false;
    const targetBody = window.targetedBodyName || 'Earth';
    const isTargetCentral = CONSTANTS.BODIES.find(b => b.name === targetBody)?.isCentral;
    
    if (showMoonPath && !isTargetCentral && viewMode !== 'LANDING') {
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.strokeStyle = '#a0522d'; 
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        let firstMoonPoint = true;
        for (let i = startIdx; i <= endIdx; i++) {
            const p = pathData[i];
            if (!p.bodiesSnapshot) continue;
            const bp = p.bodiesSnapshot[targetBody];
            if (!bp) continue;
            
            const rx = p.x - bp.x;
            const ry = p.y - bp.y;
            // Draw relative to CURRENT state
            const currentStateBp = state.bodiesSnapshot[targetBody];
            const drawX = currentStateBp.x + rx;
            const drawY = currentStateBp.y + ry;
            if (firstMoonPoint) {
                ctx.moveTo(drawX, drawY);
                firstMoonPoint = false;
            } else {
                ctx.lineTo(drawX, drawY);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

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
    if (viewMode === 'MAP') {
        const showMoonPath = document.getElementById('toggle-moon-path')?.checked !== false;
        const targetBody = window.targetedBodyName || 'Earth';
        const isTargetCentral = CONSTANTS.BODIES.find(b => b.name === targetBody)?.isCentral;
        
        burnNodesRef.forEach(bn => {
            if (bn.enabled === false) return;
            const absoluteTime = launchDelay + bn.time;
            let p = null;
            let pIdx = -1;
            // Find closest path point by time
            for (let i = 0; i < pathData.length; i++) {
                if (pathData[i].t >= absoluteTime) {
                    p = pathData[i];
                    pIdx = i;
                    break;
                }
            }
            if (p) {
                // Focus Mode Filter
                if (focusPath && (pIdx < startIdx || pIdx > endIdx)) return;

                // Absolute Path node
                ctx.fillStyle = '#3b82f6';
                ctx.beginPath(); ctx.arc(p.x, p.y, 6/activeZoom, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = `bold ${10/activeZoom}px JetBrains Mono`;
                ctx.fillText(bn.label, p.x + 10/activeZoom, p.y - 10/activeZoom);

                // Body-relative node
                if (showMoonPath && !isTargetCentral && p.soi === targetBody && p.bodiesSnapshot) {
                    const bp = p.bodiesSnapshot[targetBody];
                    if (bp) {
                        const rx = p.x - bp.x;
                        const ry = p.y - bp.y;
                        const currentStateBp = state.bodiesSnapshot[targetBody];
                        const drawX = currentStateBp.x + rx;
                        const drawY = currentStateBp.y + ry;
                        
                        ctx.fillStyle = '#a0522d'; 
                        ctx.beginPath(); ctx.arc(drawX, drawY, 6/activeZoom, 0, Math.PI*2); ctx.fill();
                        ctx.fillStyle = 'white';
                        ctx.font = `bold ${10/activeZoom}px JetBrains Mono`;
                        ctx.fillText(bn.label + ' (Rel)', drawX + 10/activeZoom, drawY - 10/activeZoom);
                    }
                }
            }
        });
    }

    // =============================
    // DRAW AP / PE PERIAPSIS MARKERS
    // =============================
    const futureMarkers = orbitMarkers.filter(m => m.step > currentSimStep);
    
    const findNext = (body, type) => {
        const matches = futureMarkers.filter(m => m.body === body && m.type === type);
        if (matches.length === 0) return null;
        return matches.reduce((prev, curr) => (curr.step < prev.step ? curr : prev));
    };

    const upcoming = [];
    CONSTANTS.BODIES.forEach(b => {
        const pe = findNext(b.name, 'Pe');
        const ap = findNext(b.name, 'Ap');
        if (pe) upcoming.push(pe);
        if (ap) upcoming.push(ap);
    });

    upcoming.forEach(m => {
        // Focus Mode Filter for markers
        if (focusPath && (m.step < startIdx || m.step > endIdx)) return;
        
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

        if (m.body !== 'Earth') {
            const showMoonPath = document.getElementById('toggle-moon-path')?.checked !== false;
            const targetBody = window.targetedBodyName || 'Earth';
            // 1. Draw on Brown Relative Orbit (Pinned to current moon)
            if (showMoonPath && m.body === targetBody) {
                drawMarker(state.bodiesSnapshot[m.body].x + m.relX, state.bodiesSnapshot[m.body].y + m.relY, m.type);
            }
            // 2. Draw on Yellow Absolute Path (Fixed in stars at future moon position)
            drawMarker(m.x, m.y, m.type + "*"); // Use asterisk for the absolute one
        } else {
            // Earth markers just go on the absolute path
            drawMarker(m.x, m.y, m.type);
        }
    });
    
    } // End if (!shouldHidePaths)

    // =============================
    // DRAW SHIP
    // =============================
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate(state.angle);
    drawProceduralShip(ctx, activeZoom, state.soi, isBurning, state.reentry);
    ctx.restore();

    ctx.restore(); // Restore main canvas transforms
    
    // Draw View Mode overlay text if LANDING
    if (viewMode === 'LANDING') {
        ctx.fillStyle = 'red';
        ctx.font = 'bold 24px monospace';
        ctx.fillText("LANDING CAMERA", width/2 - 100, 40);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px monospace';
        ctx.fillText("[M] to toggle Map View", width/2 - 120, 70);
    }
}

// Utility to translate screen to world space for clicking
window.getWorldPos = function(screenX, screenY) {
    if (pathData.length === 0) return {x:0, y:0};
    const state = pathData[currentSimStep];
    const earthRotAngle = state.t * CONSTANTS.EARTH_ROT_SPEED;
    const moonRotAngle = state.t * CONSTANTS.MOON_ROT_SPEED;
    
    let activeZoom = camera.zoom;
    let activeTargetMode = cameraTargetMode;
    if (viewMode === 'LANDING') {
        activeTargetMode = 'ship-pos';
    }
    
    let tx = 0, ty = 0, rotAngle = 0;
    if (activeTargetMode === 'earth-pos') {
        tx = 0; ty = 0; rotAngle = 0;
    } else if (activeTargetMode === 'earth-rot') {
        tx = 0; ty = 0; rotAngle = -earthRotAngle;
    } else if (activeTargetMode === 'moon-pos' && state.bodiesSnapshot) {
        tx = state.bodiesSnapshot['Moon'].x; ty = state.bodiesSnapshot['Moon'].y; rotAngle = 0;
    } else if (activeTargetMode === 'moon-rot' && state.bodiesSnapshot) {
        tx = state.bodiesSnapshot['Moon'].x; ty = state.bodiesSnapshot['Moon'].y; rotAngle = -moonRotAngle;
    } else if (activeTargetMode === 'ship-pos') {
        tx = state.x; ty = state.y; rotAngle = 0;
    } else if (activeTargetMode === 'ship-rot') {
        tx = state.x; ty = state.y; 
        rotAngle = -(state.angle + Math.PI/2); 
    }

    const dx = (screenX - width/2) / activeZoom;
    const dy = (screenY - height/2) / activeZoom;
    const cosR = Math.cos(-rotAngle);
    const sinR = Math.sin(-rotAngle);
    const rdx = dx * cosR - dy * sinR;
    const rdy = dx * sinR + dy * cosR;
    
    if (viewMode === 'LANDING') {
        return { x: rdx + tx, y: rdy + ty };
    } else {
        return { x: rdx + tx - camera.x, y: rdy + ty - camera.y };
    }
}
