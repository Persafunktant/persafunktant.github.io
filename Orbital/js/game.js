// game.js - Main Game Loop and State Management

let burnNodes = [
    { id: 1, time: 8, dvPrograde: 13, dvRadial: 0, label: 'CIRCULARIZE' },
    { id: 2, time: 88, dvPrograde: 10.5, dvRadial: 0, label: 'LUNAR TRANSFER' },
    { id: 3, time: 175, dvPrograde: -14.5, dvRadial: 0, label: 'LUNAR CAPTURE' }
];

let launchAngle = 54;
let launchPower = 24.5;
let launchDelay = 0;
let simDuration = 2000;

let isDragging = false;
let lastMouse = { x: 0, y: 0 };

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
    }, {passive:true});

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
    
    // Start render loop
    requestAnimationFrame(mainLoop);
}

function triggerRecalculate() {
    solvePath(launchAngle, launchPower, burnNodes, launchDelay, simDuration);
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
    absoluteWallTime = 0;
    if (!isPaused) togglePause();
    else triggerRecalculate(); // Make sure to force an update if already paused
}

function mainLoop() {
    // Advance simulation
    if (!isPaused && pathData.length > 0 && currentSimStep < pathData.length - 1) {
        currentSimStep += renderTimeWarp;
        if (currentSimStep >= pathData.length) currentSimStep = pathData.length - 1;
    }

    // Draw frame
    drawScene();

    // Update HUD continuously based on currentSimStep state
    if (pathData[currentSimStep] && typeof updateHUDStats === 'function') {
        updateHUDStats(pathData[currentSimStep], currentSimStep * CONSTANTS.STEP_SIZE);
    }

    requestAnimationFrame(mainLoop);
}

// Start immediately loading
init();
