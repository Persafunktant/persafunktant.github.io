// game.js - Main Game Loop and State Management

// PASTE THESE INTO game.js

let burnNodes = [
    {
        "id": 1,
        "time": 6.587,
        "dvPrograde": 11.399,
        "dvRadial": 0,
        "throttle": 1,
        "label": "CIRCULARIZE",
        "isLaunch": false,
        "enabled": true
    },
    {
        "id": 2,
        "time": 56.56,
        "dvPrograde": 7.855,
        "dvRadial": 0,
        "throttle": 1,
        "label": "LUNAR TRANSFER",
        "isLaunch": false,
        "enabled": true
    },
    {
        "id": 3,
        "time": 200.089,
        "dvPrograde": -6.802,
        "dvRadial": 0,
        "throttle": 1,
        "label": "ENTER LUNARORBIT",
        "isLaunch": false,
        "enabled": true
    },
    {
        "id": 4,
        "time": 343.25,
        "dvPrograde": -2.152,
        "dvRadial": -0.429,
        "throttle": 1,
        "label": "DeOrbit",
        "isLaunch": false,
        "enabled": true
    },
    {
        "id": 5,
        "time": 383.66,
        "dvPrograde": -5.448,
        "dvRadial": 5.229,
        "throttle": 1,
        "label": "DECEL",
        "isLaunch": false,
        "enabled": true
    },
    {
        "id": 1776647731269,
        "time": 387.269,
        "dvPrograde": -21.371,
        "dvRadial": 0,
        "throttle": 1,
        "label": "CATCH",
        "isLaunch": false,
        "enabled": true
    },
    {
        "id": 1776641143309,
        "time": 471.677,
        "dvPrograde": 12.245,
        "dvRadial": 64.455,
        "throttle": 1,
        "label": "Lunar Launch",
        "isLaunch": true,
        "enabled": true
    },
    {
        "id": 1776642808467,
        "time": 510.041,
        "dvPrograde": 4.462,
        "dvRadial": 0,
        "throttle": 1,
        "label": "Tranfer",
        "isLaunch": false,
        "enabled": true
    }
];
let launchAngle = 54;
let launchPower = 20.4;
let launchDelay = 0;
let simDuration = 2000;

let isDragging = false;
let lastMouse = { x: 0, y: 0 };
let currentSimTime = 0;
let playbackDirection = 1; // 1 for forward, -1 for backward

function init() {
    // Canvas interaction events
    canvas.addEventListener('mousedown', e => {
        isDragging = true;
        lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    window.addEventListener('mousemove', e => {
        if (isDragging) {
            // Adjust for rotation and zoom in camera padding logic
            camera.x += (e.clientX - lastMouse.x) / camera.zoom;
            camera.y += (e.clientY - lastMouse.y) / camera.zoom;
            lastMouse = { x: e.clientX, y: e.clientY };
        }
    });

    canvas.addEventListener('wheel', e => {
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        camera.zoom *= zoomDelta;
        camera.zoom = Math.max(0.005, Math.min(camera.zoom, 10));
    }, { passive: true });

    const inputAngle = document.getElementById('launch-angle');
    const inputPower = document.getElementById('launch-power');
    const inputDelay = document.getElementById('launch-delay');
    const inputDuration = document.getElementById('sim-duration');

    if (inputAngle) inputAngle.addEventListener('input', (e) => {
        launchAngle = parseFloat(e.target.value) || 0;
        triggerRecalculate();
    });

    if (inputPower) inputPower.addEventListener('input', (e) => {
        launchPower = parseFloat(e.target.value) || 0;
        triggerRecalculate();
    });

    if (inputDelay) inputDelay.addEventListener('input', (e) => {
        launchDelay = parseFloat(e.target.value) || 0;
        triggerRecalculate();
    });

    if (inputDuration) inputDuration.addEventListener('input', (e) => {
        simDuration = parseFloat(e.target.value) || 4000;
        triggerRecalculate();
    });

    // Run first simulation compute
    triggerRecalculate();
    currentSimTime = launchDelay;

    // Start render loop
    requestAnimationFrame(mainLoop);
}

function triggerRecalculate() {
    solvePath(launchAngle, launchPower, burnNodes, launchDelay, simDuration);
    // Ensure currentSimStep remains valid for the new path data
    if (pathData.length === 0) {
        currentSimStep = 0;
    } else if (currentSimStep >= pathData.length) {
        currentSimStep = pathData.length - 1;
    }
    // Push ref to renderer
    burnNodesRef = burnNodes;
    // Notify UI
    if (typeof refreshUI === 'function') refreshUI();
}

function togglePause() {
    isPaused = !isPaused;
    const icon = document.getElementById('play-icon');
    const statusVal = document.getElementById('status-val');

    if (isPaused) {
        icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        statusVal.innerText = "PLANNING";
        statusVal.style.color = "var(--accent-blue)";
    } else {
        icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        statusVal.innerText = "IN FLIGHT";
        statusVal.style.color = "var(--accent-green)";
    }
}

function resetSimulation() {
    currentSimStep = 0;
    currentSimTime = launchDelay;
    playbackDirection = 1;
    updatePlaybackUI();
    if (!isPaused) togglePause();
    else triggerRecalculate(); // Make sure to force an update if already paused
}

function togglePlaybackDirection() {
    playbackDirection = playbackDirection === 1 ? -1 : 1;
    updatePlaybackUI();
}

function updatePlaybackUI() {
    const revIcon = document.getElementById('reverse-icon');
    const playIcon = document.getElementById('play-icon');

    if (playbackDirection === -1) {
        revIcon.classList.add('text-blue-400');
        revIcon.classList.remove('text-slate-400');
        if (!isPaused) {
            playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        }
    } else {
        revIcon.classList.add('text-slate-400');
        revIcon.classList.remove('text-blue-400');
    }
}

function mainLoop() {
    // If no path data exists, just skip this frame's logic
    if (!pathData || pathData.length === 0) {
        requestAnimationFrame(mainLoop);
        return;
    }

    // Advance simulation by physical time domain
    if (!isPaused) {
        if (playbackDirection === 1 && currentSimStep < pathData.length - 1) {
            currentSimTime += 0.05 * renderTimeWarp;
        } else if (playbackDirection === -1 && currentSimTime > launchDelay) {
            currentSimTime -= 0.05 * renderTimeWarp;
        }

        // Clamp time
        if (currentSimTime < launchDelay) currentSimTime = launchDelay;

        // Synchronize currentSimStep
        if (playbackDirection === 1) {
            while (currentSimStep < pathData.length - 1 && pathData[currentSimStep].t < currentSimTime) {
                currentSimStep++;
            }
        } else {
            while (currentSimStep > 0 && pathData[currentSimStep].t > currentSimTime) {
                currentSimStep--;
            }
        }
    }

    // Draw frame
    let renderState = pathData[currentSimStep];

    // Smooth Interpolation
    if (!isPaused && currentSimStep > 0 && renderState && pathData[currentSimStep].t > currentSimTime) {
        const prev = pathData[currentSimStep - 1];
        const next = pathData[currentSimStep];
        const dt = next.t - prev.t;
        if (dt > 0) {
            const ratio = (currentSimTime - prev.t) / dt;
            renderState = { ...prev };
            // Interpolate Ship
            renderState.x = prev.x + (next.x - prev.x) * ratio;
            renderState.y = prev.y + (next.y - prev.y) * ratio;
            renderState.angle = prev.angle + (next.angle - prev.angle) * ratio;

            // Interpolate Bodies
            if (prev.bodiesSnapshot && next.bodiesSnapshot) {
                renderState.bodiesSnapshot = {};
                Object.keys(prev.bodiesSnapshot).forEach(b => {
                    const bp_prev = prev.bodiesSnapshot[b];
                    const bp_next = next.bodiesSnapshot[b];
                    renderState.bodiesSnapshot[b] = {
                        x: bp_prev.x + (bp_next.x - bp_prev.x) * ratio,
                        y: bp_prev.y + (bp_next.y - bp_prev.y) * ratio,
                        ang: bp_prev.ang + (bp_next.ang - bp_prev.ang) * ratio
                    };
                });
            }
        }
    }

    drawScene(renderState);

    // Update HUD continuously based on currentSimStep state
    if (renderState && typeof updateHUDStats === 'function') {
        updateHUDStats(renderState, currentSimTime);
    }

    requestAnimationFrame(mainLoop);
}

// Start immediately loading
init();
