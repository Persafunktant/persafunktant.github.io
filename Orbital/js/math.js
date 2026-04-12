// math.js - Orbital Mechanics and Physics Simulator

const CONSTANTS = {
    G: 0.5,
    EARTH_MASS: 120000,
    EARTH_RADIUS: 100,
    MOON_MASS: 6000,
    MOON_RADIUS: 30,
    MOON_ORBIT_DIST: 1800,
    SOI_RADIUS: 300,
    STEP_SIZE: 0.5
};

CONSTANTS.MOON_ORBIT_SPEED = Math.sqrt(CONSTANTS.G * CONSTANTS.EARTH_MASS / CONSTANTS.MOON_ORBIT_DIST);
// Angular rotation variables to simulate spinning planets
CONSTANTS.EARTH_ROT_SPEED = 0.02; 
CONSTANTS.MOON_ROT_SPEED = 0.005;
CONSTANTS.SHIP_ACCELERATION = 2.0;
CONSTANTS.MAX_FUEL_DV = 500;

// Vis-viva formula calculations
function calculateOrbitalElements(px, py, vx, vy, centralMass) {
    const r = Math.sqrt(px*px + py*py);
    const v2 = vx*vx + vy*vy;
    const mu = CONSTANTS.G * centralMass;
    
    // Specific Orbital Energy (epsilon)
    const E = (v2 / 2) - (mu / r);
    
    // Specific Relative Angular Momentum (magnitude of cross product)
    const h = (px * vy) - (py * vx);
    
    // Eccentricity
    // Special case handling if E approaches exactly zero or is slightly positive
    const eSquared = 1 + ((2 * E * h * h) / (mu * mu));
    const e = eSquared > 0 ? Math.sqrt(eSquared) : 0;
    
    if (E >= 0) {
        // Hyperbolic or Parabolic orbit
        const pe = (Math.abs(h * h / mu)) / (1 + e); // Using focal parameter
        return { pe: pe, ap: Infinity, e: e, hyperbolic: true };
    }
    
    // Semi-major axis
    const a = -mu / (2 * E);
    
    // Apoapsis and Periapsis
    const pe = a * (1 - e);
    const ap = a * (1 + e);
    
    return { pe, ap, e, a, hyperbolic: false };
}

// Get continuous moon position based on absolute time
function getMoonPosition(t) {
    const angle = 0.5 + (CONSTANTS.MOON_ORBIT_SPEED / CONSTANTS.MOON_ORBIT_DIST * t);
    return { 
        x: Math.cos(angle) * CONSTANTS.MOON_ORBIT_DIST, 
        y: Math.sin(angle) * CONSTANTS.MOON_ORBIT_DIST, 
        angle: angle 
    };
}

// Global Path State
let pathData = [];
let interceptEvents = []; // Stores `{ type: 'ENTER'|'EXIT', t, ... }`
let orbitMarkers = []; // Physical coordinates of Ap/Pe passes

function clampMag(x, y, maxMag) {
    const mag = Math.sqrt(x*x + y*y);
    if(mag === 0) return {x:0,y:0};
    return {x: x/mag, y:y/mag, mag:mag};
}

// The core solver function
function solvePath(launchAngleDeg, launchPower, burnNodes, launchDelay = 0, simDuration = 4000) {
    const maxSteps = Math.floor(simDuration / CONSTANTS.STEP_SIZE);

    // Base vectors
    let px0 = 0, py0 = -CONSTANTS.EARTH_RADIUS;
    let rad0 = (90 - launchAngleDeg) * Math.PI / 180;
    let pvx0 = Math.sin(rad0) * launchPower;
    let pvy0 = -Math.cos(rad0) * launchPower;

    // Apply deterministic rotation matrix based on earth surface location at start time
    const groundTheta = -launchDelay * CONSTANTS.EARTH_ROT_SPEED;
    const cosT = Math.cos(groundTheta);
    const sinT = Math.sin(groundTheta);
    
    let px = px0 * cosT - py0 * sinT;
    let py = px0 * sinT + py0 * cosT;
    let pvx = pvx0 * cosT - pvy0 * sinT;
    let pvy = pvx0 * sinT + pvy0 * cosT;

    pathData = [];
    interceptEvents = [];
    orbitMarkers = [];
    
    // Ensure nodes are sorted by time
    const nodes = [...burnNodes].sort((a,b) => a.time - b.time);
    // Pre-calculate burn windows
    nodes.forEach(n => {
        n.totalDV = Math.sqrt(n.dvPrograde*n.dvPrograde + n.dvRadial*n.dvRadial);
        n.burnDuration = n.totalDV / CONSTANTS.SHIP_ACCELERATION;
        n.burnStart = n.time - (n.burnDuration / 2);
        n.burnEnd = n.time + (n.burnDuration / 2);
        if (n.totalDV > 0) {
            n.progRatio = n.dvPrograde / n.totalDV;
            n.radRatio = n.dvRadial / n.totalDV;
        } else {
            n.progRatio = 0; n.radRatio = 0;
        }
    });

    let nextNodeIdx = 0;
    
    let currentSOI = 'Earth';
    let wasInMoonSOI = false;
    let remainingFuelDV = CONSTANTS.MAX_FUEL_DV;

    // Simulate Step by Step
    for (let i = 0; i < maxSteps; i++) {
        const simTime = launchDelay + (i * CONSTANTS.STEP_SIZE);
        const mPos = getMoonPosition(simTime);

        // Apply Maneuver Node finite burn
        let isBurning = false;
        if (nextNodeIdx < nodes.length) {
            const n = nodes[nextNodeIdx];
            
            const stepStart = simTime;
            const stepEnd = simTime + CONSTANTS.STEP_SIZE;
            const overlapStart = Math.max(stepStart, n.burnStart);
            const overlapEnd = Math.min(stepEnd, n.burnEnd);
            const overlap = overlapEnd - overlapStart;

            if (overlap > 0 && remainingFuelDV > 0 && n.totalDV > 0) {
                isBurning = true;
                const dvThisStep = Math.min(overlap * CONSTANTS.SHIP_ACCELERATION, remainingFuelDV);
                remainingFuelDV -= dvThisStep;
                
                // Prograde vector (normalized velocity vector)
                const vVec = clampMag(pvx, pvy);
                // Radial vector (perpendicular to velocity)
                const rX = -vVec.y;
                const rY = vVec.x;

                // Apply distributed dv
                pvx += (vVec.x * n.progRatio * dvThisStep) + (rX * n.radRatio * dvThisStep);
                pvy += (vVec.y * n.progRatio * dvThisStep) + (rY * n.radRatio * dvThisStep);
            }
            if (stepEnd >= n.burnEnd) {
                nextNodeIdx++;
            }
        }

        let currentDominantSOI = 'Earth';
        let pAp = 0, pPe = 0;
        
        // --- N-Body Continuous Gravity ---
        const dsqE = Math.max(px*px + py*py, 1);
        const distE = Math.sqrt(dsqE);
        const fE = (CONSTANTS.G * CONSTANTS.EARTH_MASS) / dsqE;
        let ax = -(px/distE) * fE; 
        let ay = -(py/distE) * fE;

        const dxM = px - mPos.x;
        const dyM = py - mPos.y;
        const dsqM = Math.max(dxM*dxM + dyM*dyM, 1);
        const distM = Math.sqrt(dsqM);
        const fM = (CONSTANTS.G * CONSTANTS.MOON_MASS) / dsqM;
        ax += -(dxM/distM) * fM;
        ay += -(dyM/distM) * fM;
        
        // Sphere of Influence indicator & Encounter Tracker
        if (distM < CONSTANTS.SOI_RADIUS) {
            currentSOI = 'Moon';
            currentDominantSOI = 'Moon';
            if (!wasInMoonSOI) {
                interceptEvents.push({ type: 'ENTER', time: simTime, x: px, y: py, mx: mPos.x, my: mPos.y, minDist: distM });
                wasInMoonSOI = true;
            } else {
                let lastEv = interceptEvents[interceptEvents.length-1];
                if (lastEv && lastEv.type === 'ENTER') lastEv.minDist = Math.min(lastEv.minDist, distM);
            }
            // For HUD reading only, approximate current stats relative to moon
            const stats = calculateOrbitalElements(dxM, dyM, pvx, pvy, CONSTANTS.MOON_MASS);
            pAp = stats.ap; pPe = stats.pe;
        } else {
            currentSOI = 'Earth';
            currentDominantSOI = 'Earth';
            if (wasInMoonSOI) {
                interceptEvents.push({ type: 'EXIT', time: simTime, x: px, y: py, mx: mPos.x, my: mPos.y });
                wasInMoonSOI = false;
            }
            // For HUD reading only, approximate current stats relative to earth
            const stats = calculateOrbitalElements(px, py, pvx, pvy, CONSTANTS.EARTH_MASS);
            pAp = stats.ap; pPe = stats.pe;
        }

        // --- Track Physical Ap/Pe Map Markers ---
        if (i > 0 && pathData.length > 0) {
            const lastState = pathData[pathData.length - 1];
            
            // Earth local min/max
            const prevDistE = Math.sqrt(lastState.x*lastState.x + lastState.y*lastState.y);
            let newDirE = distE > prevDistE ? 1 : (distE < prevDistE ? -1 : 0);
            if (newDirE !== 0 && lastState.eDir !== 0 && newDirE !== lastState.eDir) {
                if (currentDominantSOI === 'Earth' && !isBurning) {
                    orbitMarkers.push({ type: lastState.eDir === 1 ? 'Ap' : 'Pe', x: px, y: py });
                }
            }
            var trackDirE = newDirE !== 0 ? newDirE : lastState.eDir;
            
            // Moon local min/max
            const prevDistM = Math.sqrt((lastState.x - lastState.mx)**2 + (lastState.y - lastState.my)**2);
            let newDirM = distM > prevDistM ? 1 : (distM < prevDistM ? -1 : 0);
            if (newDirM !== 0 && lastState.mDir !== 0 && newDirM !== lastState.mDir) {
                if (currentDominantSOI === 'Moon' && !isBurning) {
                    orbitMarkers.push({ type: lastState.mDir === 1 ? 'Ap' : 'Pe', x: px, y: py });
                }
            }
            var trackDirM = newDirM !== 0 ? newDirM : lastState.mDir;
        } else {
            var trackDirE = 0;
            var trackDirM = 0;
        }

        // Explicit Euler Integration
        pvx += ax * CONSTANTS.STEP_SIZE;
        pvy += ay * CONSTANTS.STEP_SIZE;
        px += pvx * CONSTANTS.STEP_SIZE;
        py += pvy * CONSTANTS.STEP_SIZE;

        pathData.push({ 
            x: px, y: py, 
            vx: pvx, vy: pvy, 
            mx: mPos.x, my: mPos.y, 
            soi: currentSOI, 
            t: simTime,
            ap: pAp, pe: pPe,
            fuel: remainingFuelDV,
            burning: isBurning,
            eDir: trackDirE,
            mDir: trackDirM
        });

        // Break if hit Earth
        if (px*px + py*py < CONSTANTS.EARTH_RADIUS*CONSTANTS.EARTH_RADIUS && simTime > 5) break;
    }
}
