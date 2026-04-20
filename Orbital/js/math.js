// math.js - Orbital Mechanics and Physics Simulator

const CONSTANTS = {
    G: 0.5,
    EARTH_RADIUS: 100, // kept for easy reference
    SOI_RADIUS: 300,
    BASE_STEP_SIZE: 0.05,
    MAX_STEP_SIZE: 2.0,
    ATMOSPHERE_HEIGHT: 40,
    SHIP_HEIGHT_RADIUS: 2.0 // Radius representing half of ship height for collision
};

CONSTANTS.BODIES = [
    {
        name: 'Earth',
        mass: 120000,
        radius: 100,
        rotSpeed: 0.02,
        isCentral: true,
        orbitDist: 0,
        startAngle: 0,
        color: '#3b82f6'
    },
    {
        name: 'Moon',
        mass: 6000,
        radius: 30,
        rotSpeed: 0.005,
        orbitDist: 1800,
        startAngle: 0.5,
        color: '#facc15'
    },
    {
        name: 'Moon2',
        mass: 3000,
        radius: 20,
        rotSpeed: 0.008,
        orbitDist: 2800,
        startAngle: 2.0,
        color: '#38bdf8'
    }
];

CONSTANTS.BODIES.forEach(b => {
    if (!b.isCentral) {
        b.orbitSpeed = Math.sqrt(CONSTANTS.G * CONSTANTS.BODIES[0].mass / b.orbitDist);
    }
});

CONSTANTS.SHIP_ACCELERATION = 8.0; // Optimized for Earth hovering (G=6)
CONSTANTS.MAX_FUEL_DV = 500; // Increased for complex missions

// Vis-viva formula calculations
function calculateOrbitalElements(px, py, vx, vy, centralMass) {
    const r = Math.sqrt(px * px + py * py);
    const v2 = vx * vx + vy * vy;
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
        return { pe: pe, ap: Infinity, e: e, a: Infinity, T: Infinity, hyperbolic: true };
    }

    // Semi-major axis
    const a = -mu / (2 * E);

    // Apoapsis and Periapsis
    const pe = a * (1 - e);
    const ap = a * (1 + e);
    
    // Period
    const T = 2 * Math.PI * Math.sqrt((a * a * a) / mu);

    return { pe, ap, e, a, T, hyperbolic: false };
}

function getBodyPositions(t) {
    let pos = {};
    CONSTANTS.BODIES.forEach(b => {
        if (b.isCentral) {
            pos[b.name] = { x: 0, y: 0, ang: t * b.rotSpeed, vx: 0, vy: 0 };
        } else {
            const angle = b.startAngle + (b.orbitSpeed / b.orbitDist * t);
            const x = Math.cos(angle) * b.orbitDist;
            const y = Math.sin(angle) * b.orbitDist;
            // Analytical velocity derivative
            const vx = -Math.sin(angle) * b.orbitSpeed;
            const vy = Math.cos(angle) * b.orbitSpeed;
            pos[b.name] = { x, y, ang: t * b.rotSpeed, vx, vy };
        }
    });
    return pos;
}

function computeGravityAt(x, y, t) {
    let ax = 0, ay = 0;
    const bodyPos = getBodyPositions(t);
    CONSTANTS.BODIES.forEach(b => {
         const bp = bodyPos[b.name];
         const dx = x - bp.x;
         const dy = y - bp.y;
         const dsq = Math.max(dx*dx + dy*dy, 1);
         const dist = Math.sqrt(dsq);
         const f = (CONSTANTS.G * b.mass) / dsq;
         ax += -(dx / dist) * f;
         ay += -(dy / dist) * f;
    });
    return { ax, ay };
}

// Global Path State
let pathData = [];
let interceptEvents = []; // Stores `{ type: 'ENTER'|'EXIT', t, ... }`
let orbitMarkers = []; // Physical coordinates of Ap/Pe passes

function clampMag(x, y, maxMag) {
    const mag = Math.sqrt(x * x + y * y);
    if (mag === 0) return { x: 0, y: 0 };
    return { x: x / mag, y: y / mag, mag: mag };
}

// The core solver function
function solvePath(launchAngleDeg, launchPower, burnNodes, launchDelay = 0, simDuration = 4000) {
    pathData = [];
    interceptEvents = [];
    orbitMarkers = [];
    const maxSteps = Math.floor(simDuration / CONSTANTS.STEP_SIZE);

    let px0 = 0, py0 = -(CONSTANTS.BODIES[0].radius + CONSTANTS.SHIP_HEIGHT_RADIUS + 0.1);
    let rad0 = (90 - launchAngleDeg) * Math.PI / 180;

    let pvx0 = Math.sin(rad0) * launchPower;
    let pvy0 = -Math.cos(rad0) * launchPower;
    pvx0 += (CONSTANTS.BODIES[0].radius * CONSTANTS.BODIES[0].rotSpeed);

    const groundTheta = launchDelay * CONSTANTS.BODIES[0].rotSpeed;
    const cosT = Math.cos(groundTheta);
    const sinT = Math.sin(groundTheta);

    let px = px0 * cosT - py0 * sinT;
    let py = px0 * sinT + py0 * cosT;
    let pvx = pvx0 * cosT - pvy0 * sinT;
    let pvy = pvx0 * sinT + pvy0 * cosT;

    // Pre-calculate burn stats for ALL nodes (even disabled ones so UI shows costs)
    burnNodes.forEach(n => {
        const absoluteTime = launchDelay + n.time;
        n.throttle = n.throttle !== undefined ? n.throttle : 1.0;
        
        if (n.isLaunch) {
            // In launch mode, prograde is the power/delta-v, radial is the angle
            n.totalDV = Math.abs(n.dvPrograde);
            n.progRatio = 1;
            n.radRatio = 0;
        } else {
            n.totalDV = Math.sqrt(n.dvPrograde * n.dvPrograde + n.dvRadial * n.dvRadial);
            if (n.totalDV > 0) {
                n.progRatio = n.dvPrograde / n.totalDV;
                n.radRatio = n.dvRadial / n.totalDV;
            } else {
                n.progRatio = 0; n.radRatio = 0;
            }
        }

        const actualAcceleration = CONSTANTS.SHIP_ACCELERATION * Math.max(0.01, n.throttle);
        n.burnDuration = n.totalDV / actualAcceleration;
        n.burnStart = absoluteTime - (n.burnDuration / 2);
        n.burnEnd = absoluteTime + (n.burnDuration / 2);
    });

    // Get sorted subset of enabled nodes for the actual simulation loop
    const nodes = [...burnNodes]
        .filter(n => n.enabled !== false)
        .sort((a, b) => a.time - b.time);

    let nextNodeIdx = 0;

    let currentSOI = 'Earth';
    let wasInMoonSOI = false;
    let remainingFuelDV = CONSTANTS.MAX_FUEL_DV;

    // Visual Orientation State
    let shipVisualAngle = rad0 - Math.PI / 2; // Initial pointing
    const TUMBLE_SPEED = 0.015; // Much slower, imperceptible tumble
    const ALIGN_LEAD_TIME = 45; // Longer, more gradual alignment slew

    // Simulate Step by Step
    let simTime = launchDelay;
    let stepCount = 0;
    const maxPathLimit = 150000; // Hard fail-safe
    
    let isLanded = false;
    let landedOnBodyName = null;
    let landedRotationOffset = 0;
    let lastLandingSpeed = 0;

    let encounterActive = false;
    let encounterBody = null;
    let encounterMinDist = Infinity;
    let encounterStartTime = 0;

    while (simTime < launchDelay + simDuration && pathData.length < maxPathLimit) {
        let stepSize = CONSTANTS.BASE_STEP_SIZE;
        const bodies = getBodyPositions(simTime);
        
        let nearestDist = Infinity;
        let currentSOI = 'Earth';
        
        // Calc nearest distance for adaptive stepping
        CONSTANTS.BODIES.forEach(b => {
            const bp = bodies[b.name];
            const dist = Math.sqrt((px - bp.x)**2 + (py - bp.y)**2);
            if (!b.isCentral && dist < CONSTANTS.SOI_RADIUS) currentSOI = b.name;
            const surfDist = Math.max(0, dist - b.radius);
            if (surfDist < nearestDist) nearestDist = surfDist;
        });

        // Adaptive Step Calculation
        if (nearestDist > CONSTANTS.SOI_RADIUS) {
            stepSize = Math.min(CONSTANTS.MAX_STEP_SIZE, CONSTANTS.BASE_STEP_SIZE + (nearestDist - CONSTANTS.SOI_RADIUS) * 0.01);
        }

        // Clamp to maneuvers
        if (nextNodeIdx < nodes.length) {
            const n = nodes[nextNodeIdx];
            if (simTime < n.burnStart && simTime + stepSize > n.burnStart) {
                stepSize = Math.max(0.001, n.burnStart - simTime);
            } else if (simTime >= n.burnStart - ALIGN_LEAD_TIME && simTime < n.burnEnd + 10) {
                stepSize = CONSTANTS.BASE_STEP_SIZE;
            }
        }

        const isCurrentlyInMoonSOI = currentSOI !== 'Earth';
        const currentRefBodyName = isCurrentlyInMoonSOI ? currentSOI : 'Earth';
        const cbPos = bodies[currentRefBodyName];

        // --- Encounter Logic ---
        if (!encounterActive && isCurrentlyInMoonSOI) {
            encounterActive = true;
            encounterBody = currentSOI;
            encounterMinDist = Infinity;
            encounterStartTime = simTime;
            // We don't push ENTER immediately because we want to find minDist first? 
            // Actually usually we push ENTER at the start.
            interceptEvents.push({ type: 'ENTER', body: currentSOI, time: simTime });
        } else if (encounterActive && !isCurrentlyInMoonSOI) {
            interceptEvents.push({ type: 'EXIT', body: encounterBody, time: simTime, minDist: encounterMinDist });
            encounterActive = false;
            encounterBody = null;
        }

        if (encounterActive) {
            const bp = bodies[encounterBody];
            const dist = Math.sqrt((px - bp.x)**2 + (py - bp.y)**2);
            if (dist < encounterMinDist) encounterMinDist = dist;
        }

        // --- Handle Landed State Logic ---
        if (isLanded) {
            const b = CONSTANTS.BODIES.find(x => x.name === landedOnBodyName);
            const bp = bodies[b.name];
            
            // Check for Liftoff (explicit Launch nodes only)
            if (nextNodeIdx < nodes.length) {
                const n = nodes[nextNodeIdx];
                if (simTime >= n.burnStart && n.isLaunch) {
                    isLanded = false;
                    
                    // Apply Instant Impulse exactly ONCE at moment of liftoff
                    const b = CONSTANTS.BODIES.find(x => x.name === landedOnBodyName);
                    const bp = bodies[b.name];
                    const surfaceNormalAngle = Math.atan2(py - bp.y, px - bp.x);
                    const relAngleRad = (90 - (n.dvRadial || 0)) * Math.PI / 180;
                    
                    // Match initial launch convention: 0 is prograde, 90 is up.
                    // Clockwise turn from UP vector.
                    const absoluteLaunchAngle = surfaceNormalAngle + relAngleRad;
                    
                    const burnVX = Math.cos(absoluteLaunchAngle);
                    const burnVY = Math.sin(absoluteLaunchAngle);
                    
                    const dvToApply = Math.min(n.totalDV, remainingFuelDV);
                    pvx += burnVX * dvToApply;
                    pvy += burnVY * dvToApply;
                    remainingFuelDV -= dvToApply;
                    
                    shipVisualAngle = absoluteLaunchAngle;
                } else if (simTime >= n.burnEnd) {
                    // Consumer orbital nodes in the background while landed
                    nextNodeIdx++;
                }
            }
            
            if (isLanded) {
                const currentSurfaceAngle = landedRotationOffset + (simTime * b.rotSpeed);
                px = bp.x + Math.cos(currentSurfaceAngle) * (b.radius + CONSTANTS.SHIP_HEIGHT_RADIUS);
                py = bp.y + Math.sin(currentSurfaceAngle) * (b.radius + CONSTANTS.SHIP_HEIGHT_RADIUS);
                
                // Velocity matches surface velocity
                pvx = bp.vx - Math.sin(currentSurfaceAngle) * b.radius * b.rotSpeed;
                pvy = bp.vy + Math.cos(currentSurfaceAngle) * b.radius * b.rotSpeed;
                
                shipVisualAngle = currentSurfaceAngle;
                
                // Jump time and skip physics
                pathData.push({
                    x: px, y: py, vx: pvx, vy: pvy,
                    soi: b.name, t: simTime,
                    ap: 0, pe: 0, period: 0,
                    fuel: remainingFuelDV,
                    burning: false,
                    angle: shipVisualAngle,
                    status: 'LANDED',
                    landingSpeed: lastLandingSpeed,
                    landingBody: b.name,
                    bodiesSnapshot: bodies,
                    eDir: 0, mDir: 0
                });
                
                simTime += stepSize;
                stepCount++;
                continue; 
            }
        }

        // Apply Maneuver Node finite burn
        let isBurning = false;
        if (nextNodeIdx < nodes.length) {
            const n = nodes[nextNodeIdx];

            const stepStart = simTime;
            const stepEnd = simTime + stepSize;
            const overlapStart = Math.max(stepStart, n.burnStart);
            const overlapEnd = Math.min(stepEnd, n.burnEnd);
            const overlap = Math.max(0, overlapEnd - overlapStart);

            let refVx = pvx - cbPos.vx;
            let refVy = pvy - cbPos.vy;

            let burnVX, burnVY;
            const targetTotalDV = Math.sqrt(n.dvPrograde * n.dvPrograde + n.dvRadial * n.dvRadial);

            if (n.isLaunch) {
                // Surface Launch Logic: Prograde = Power, Radial = Angle (offset from normal)
                // Behavior matched to initial launch: 90 is straight up, 0 is horizontal prograde
                const bp = bodies[landedOnBodyName] || bodies[currentRefBodyName];
                const surfaceNormalAngle = Math.atan2(py - bp.y, px - bp.x);
                const relAngleRad = (90 - (n.dvRadial || 0)) * Math.PI / 180;
                const absoluteLaunchAngle = surfaceNormalAngle - relAngleRad;
                
                burnVX = Math.cos(absoluteLaunchAngle);
                burnVY = Math.sin(absoluteLaunchAngle);
                shipVisualAngle = absoluteLaunchAngle;
            } else {
                // Standard Orbital Prograde/Radial Logic
                const vVec = clampMag(refVx, refVy);
                const rX = -vVec.y, rY = vVec.x;
                burnVX = (vVec.x * n.progRatio) + (rX * n.radRatio);
                burnVY = (vVec.y * n.progRatio) + (rY * n.radRatio);
                shipVisualAngle = Math.atan2(burnVY, burnVX);
            }

            if (overlap > 0 && remainingFuelDV > 0 && n.totalDV > 0 && !isLanded) {
                isBurning = true;

                if (n.isLaunch) {
                    // Standard finite burn logic handled elsewhere; 
                    // Launch Impulse now handled once during liftoff.
                } else {
                    const actualAcceleration = CONSTANTS.SHIP_ACCELERATION * Math.max(0.01, n.throttle);
                    const dvThisStep = Math.min(overlap * actualAcceleration, remainingFuelDV);
                    remainingFuelDV -= dvThisStep;

                    pvx += burnVX * dvThisStep;
                    pvy += burnVY * dvThisStep;
                }
            } else if (simTime > n.burnStart - ALIGN_LEAD_TIME && simTime <= n.burnStart) {
                const targetBurnAngle = Math.atan2(burnVY, burnVX);
                const rawT = (simTime - (n.burnStart - ALIGN_LEAD_TIME)) / ALIGN_LEAD_TIME;
                const t = 0.5 - Math.cos(rawT * Math.PI) * 0.5; 
                const naturalTumble = shipVisualAngle + TUMBLE_SPEED * stepSize;
                shipVisualAngle = naturalTumble * (1 - t) + targetBurnAngle * t;
            } else {
                shipVisualAngle += TUMBLE_SPEED * stepSize;
            }
            if (stepEnd >= n.burnEnd) {
                nextNodeIdx++;
            }
        } else {
            shipVisualAngle += TUMBLE_SPEED * stepSize;
        }

        let ax = 0, ay = 0;
        let isReentry = false;

        // --- N-Body Continuous Gravity loop ---
        CONSTANTS.BODIES.forEach(b => {
             const bp = bodies[b.name];
             const dx = px - bp.x;
             const dy = py - bp.y;
             const dsq = Math.max(dx*dx + dy*dy, 1);
             const dist = Math.sqrt(dsq);
             const f = (CONSTANTS.G * b.mass) / dsq;
             ax += -(dx / dist) * f;
             ay += -(dy / dist) * f;

             // Atmosphere Drag (Earth only for now)
             if (b.isCentral) {
                 const alt = dist - b.radius;
                 if (alt < CONSTANTS.ATMOSPHERE_HEIGHT && alt > 0) {
                     const density = Math.exp(-alt / 10.0);
                     const vSq = pvx*pvx + pvy*pvy;
                     if (vSq > 0.1) {
                         const dragMag = density * vSq * 0.0005; 
                         const vDir = clampMag(-pvx, -pvy);
                         ax += vDir.x * dragMag;
                         ay += vDir.y * dragMag;
                         if (dragMag > 0.05) isReentry = true;
                     }
                 }
             }
        });

        // Integration
        if (!isBurning && !isReentry && stepSize > 0.06) {
            // High-Precision RK4 Integration for variable-scale drift
            const k1ax = ax, k1ay = ay;
            const k1vx = k1ax * stepSize, k1vy = k1ay * stepSize;
            const k1x = pvx * stepSize, k1y = pvy * stepSize;
            
            const p2 = computeGravityAt(px + k1x*0.5, py + k1y*0.5, simTime + stepSize*0.5);
            const k2vx = p2.ax * stepSize, k2vy = p2.ay * stepSize;
            const k2x = (pvx + k1vx*0.5) * stepSize, k2y = (pvy + k1vy*0.5) * stepSize;
            
            const p3 = computeGravityAt(px + k2x*0.5, py + k2y*0.5, simTime + stepSize*0.5);
            const k3vx = p3.ax * stepSize, k3vy = p3.ay * stepSize;
            const k3x = (pvx + k2vx*0.5) * stepSize, k3y = (pvy + k2vy*0.5) * stepSize;
            
            const p4 = computeGravityAt(px + k3x, py + k3y, simTime + stepSize);
            const k4vx = p4.ax * stepSize, k4vy = p4.ay * stepSize;
            const k4x = (pvx + k3vx) * stepSize, k4y = (pvy + k3vy) * stepSize;
            
            px += (k1x + 2*k2x + 2*k3x + k4x) / 6.0;
            py += (k1y + 2*k2y + 2*k3y + k4y) / 6.0;
            pvx += (k1vx + 2*k2vx + 2*k3vx + k4vx) / 6.0;
            pvy += (k1vy + 2*k2vy + 2*k3vy + k4vy) / 6.0;
            simTime += stepSize;
        } else {
            // Standard/Euler fallback for tight atmosphere/burn windows
            pvx += ax * stepSize;
            pvy += ay * stepSize;
            px += pvx * stepSize;
            py += pvy * stepSize;
            simTime += stepSize;
        }
        
        // --- Track Physical Ap/Pe Map Markers ---
        if (pathData.length > 0) {
            const lastPushed = pathData[pathData.length - 1];
            
            // Earth relative tracking
            const distE = Math.sqrt(px*px + py*py);
            const prevDistE = Math.sqrt(lastPushed.x*lastPushed.x + lastPushed.y*lastPushed.y);
            let newDirE = distE > prevDistE ? 1 : (distE < prevDistE ? -1 : 0);
            
            if (newDirE !== 0 && lastPushed.eDir !== 0 && newDirE !== lastPushed.eDir) {
                if (currentSOI === 'Earth') {
                    orbitMarkers.push({ type: lastPushed.eDir === 1 ? 'Ap' : 'Pe', x: px, y: py, body: 'Earth', step: pathData.length - 1 });
                }
            }
            var trackDirE = newDirE !== 0 ? newDirE : lastPushed.eDir;

            // Targeted Body tracking
            var trackDirM = 0;
            if (currentSOI !== 'Earth') {
                const cbPos = bodies[currentSOI];
                const distM = Math.sqrt((px - cbPos.x)**2 + (py - cbPos.y)**2);
                const bpPrev = lastPushed.bodiesSnapshot ? lastPushed.bodiesSnapshot[currentSOI] : cbPos;
                const prevDistM = Math.sqrt((lastPushed.x - bpPrev.x)**2 + (lastPushed.y - bpPrev.y)**2);
                
                let newDirM = distM > prevDistM ? 1 : (distM < prevDistM ? -1 : 0);
                if (newDirM !== 0 && lastPushed.mDir !== 0 && newDirM !== lastPushed.mDir) {
                    orbitMarkers.push({ 
                        type: lastPushed.mDir === 1 ? 'Ap' : 'Pe', 
                        x: px, 
                        y: py, 
                        relX: px - cbPos.x, 
                        relY: py - cbPos.y, 
                        body: currentSOI, 
                        step: pathData.length - 1 
                    });
                }
                trackDirM = newDirM !== 0 ? newDirM : lastPushed.mDir;
            } else {
                trackDirM = lastPushed.mDir || 0;
            }
        } else {
            var trackDirE = 0;
            var trackDirM = 0;
        }

        // Calculate Stats for HUD
        let pAp = 0, pPe = 0, pPeriod = 0;
        if (currentSOI !== 'Earth') {
            const stats = calculateOrbitalElements(px - cbPos.x, py - cbPos.y, pvx - cbPos.vx, pvy - cbPos.vy, CONSTANTS.BODIES.find(x=>x.name===currentSOI).mass);
            pAp = stats.ap; pPe = stats.pe; pPeriod = stats.T || 0;
        } else {
            const stats = calculateOrbitalElements(px, py, pvx, pvy, CONSTANTS.BODIES[0].mass);
            pAp = stats.ap; pPe = stats.pe; pPeriod = stats.T || 0;
        }

        // Only save state periodically to reduce array size (Adaptive path point drops)
        if (stepCount % 5 === 0 || isBurning || isReentry || stepSize < 0.1 || currentSOI !== 'Earth') {
            pathData.push({
                x: px, y: py,
                vx: pvx, vy: pvy,
                soi: currentSOI,
                t: simTime,
                ap: pAp, pe: pPe, period: pPeriod,
                fuel: remainingFuelDV,
                burning: isBurning,
                angle: shipVisualAngle,
                status: isReentry ? 'RE-ENTRY' : 'IN FLIGHT',
                bodiesSnapshot: bodies,
                eDir: trackDirE,
                mDir: trackDirM
            });
        }
        stepCount++;



        // --- Landing & Collision Check --- 
        if (simTime - launchDelay > 5) {
            let hitBody = null;
            let relV = {x: 0, y: 0};
            let bodyX = 0, bodyY = 0;

            CONSTANTS.BODIES.forEach(b => {
                 const bp = bodies[b.name];
                 const dist = Math.sqrt((px - bp.x)**2 + (py - bp.y)**2);
                 if (dist <= b.radius + CONSTANTS.SHIP_HEIGHT_RADIUS) {
                      hitBody = b.name;
                      const groundAngle = Math.atan2(py - bp.y, px - bp.x);
                      const groundVelX = bp.vx - Math.sin(groundAngle) * b.radius * b.rotSpeed;
                      const groundVelY = bp.vy + Math.cos(groundAngle) * b.radius * b.rotSpeed;
                      relV = { x: pvx - groundVelX, y: pvy - groundVelY };
                      bodyX = bp.x; bodyY = bp.y;
                 }
            });

            if (hitBody !== null) {
                const speedScale = Math.sqrt(relV.x*relV.x + relV.y*relV.y);
                const speedMs = speedScale * 10; 
                
                const surfaceNormalAngle = Math.atan2(py - bodyY, px - bodyX);
                let angleDiff = (shipVisualAngle - surfaceNormalAngle) % (Math.PI*2);
                if (angleDiff < -Math.PI) angleDiff += Math.PI*2;
                if (angleDiff > Math.PI) angleDiff -= Math.PI*2;
                
                const degreesOff = Math.abs(angleDiff) * (180/Math.PI);
                
                let landedSuccessfully = speedMs < 40.0 && degreesOff < 25; 
                
                if (landedSuccessfully) {
                    isLanded = true;
                    landedOnBodyName = hitBody;
                    lastLandingSpeed = speedMs;
                    const b = CONSTANTS.BODIES.find(x => x.name === hitBody);
                    const bp = bodies[b.name];
                    const surfaceAngle = Math.atan2(py - bp.y, px - bp.x);
                    landedRotationOffset = surfaceAngle - (simTime * b.rotSpeed);
                    
                    if (pathData.length > 0) {
                        pathData[pathData.length - 1].status = 'LANDED';
                        pathData[pathData.length - 1].landingSpeed = speedMs;
                        pathData[pathData.length - 1].landingBody = hitBody;
                    }
                } else {
                    if (pathData.length > 0) {
                        pathData[pathData.length - 1].status = 'CRASHED';
                        pathData[pathData.length - 1].landingSpeed = speedMs;
                        pathData[pathData.length - 1].landingBody = hitBody;
                    }
                    break; // End simulation on crash
                }
            }
        }
    }
}
