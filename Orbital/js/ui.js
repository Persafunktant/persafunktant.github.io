// ui.js - User Interface and DOM State 

document.getElementById('play-btn').addEventListener('click', () => togglePause());
document.getElementById('reset-btn').addEventListener('click', () => resetSimulation());

const sidebar = document.getElementById('right-sidebar');
const mobileToggle = document.getElementById('mobile-toggle-btn');
const mobileClose = document.getElementById('mobile-close-btn');

if (mobileToggle) mobileToggle.addEventListener('click', () => sidebar.classList.remove('translate-y-full'));
if (mobileClose) mobileClose.addEventListener('click', () => sidebar.classList.add('translate-y-full'));

// Camera Lock Selector
document.getElementById('camera-lock').addEventListener('change', (e) => {
    cameraTargetMode = e.target.value;
});

// Time Warp Buttons
document.querySelectorAll('#warp-buttons button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const val = parseInt(e.target.dataset.warp);
        renderTimeWarp = val;
        // Updating visual styling
        document.querySelectorAll('#warp-buttons button').forEach(b => {
             b.className = b.dataset.warp == val ? 
                "flex-1 py-1 bg-blue-600 rounded text-xs font-bold transition-all shadow-[0_0_10px_rgba(59,130,246,0.5)]" : 
                "flex-1 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold transition-all text-slate-400";
        });
    });
});
// Set default styling
document.querySelector('[data-warp="1"]').click();

// Initial Launch Values
const inputAngle = document.getElementById('launch-angle');
const inputPower = document.getElementById('launch-power');

inputAngle.addEventListener('input', () => { launchAngle = parseFloat(inputAngle.value) || 0; triggerRecalculate(); });
inputPower.addEventListener('input', () => { launchPower = parseFloat(inputPower.value) || 0; triggerRecalculate(); });

// ==== Node Management ====
document.getElementById('add-node-btn').addEventListener('click', () => {
    // Add a new node ahead of current time
    let newTime = Math.round(pathData[currentSimStep]?.t || 10) + 50;
    burnNodes.push({
        id: Date.now(),
        time: newTime,
        dvPrograde: 0,
        dvRadial: 0,
        label: 'NEW MANEUVER'
    });
    // Force sort and UI rebuild
    triggerRecalculate();
});

function updateNodeParam(id, field, value) {
    const node = burnNodes.find(n => n.id === id);
    if (node) {
        if (field === 'label') node[field] = value;
        else node[field] = parseFloat(value) || 0;
        triggerRecalculate();
    }
}

function stepNodeParam(id, field, amount) {
    const node = burnNodes.find(n => n.id === id);
    if (node) {
        node[field] += amount;
        triggerRecalculate();
    }
}

// --- UI State & Modals ---
const settingsModal = document.getElementById('settings-modal');
if (document.getElementById('settings-btn')) {
    document.getElementById('settings-btn').addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
        settingsModal.classList.add('flex');
    });
}
if (document.getElementById('close-modal-btn')) {
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        settingsModal.classList.add('hidden');
        settingsModal.classList.remove('flex');
    });
}

// --- Ramping Configuration ---
const RAMP_CONFIG = {
    delay: 250,
    baseAccel: 10,
    maxAccel: 20000
};

['ramp-delay', 'ramp-base', 'ramp-max'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById(id + '-val').innerText = val;
        
        if (id === 'ramp-delay') RAMP_CONFIG.delay = val;
        if (id === 'ramp-base') RAMP_CONFIG.baseAccel = val;
        if (id === 'ramp-max') RAMP_CONFIG.maxAccel = val;
    });
});

// --- Hold-to-Ramp Logic ---
let activeRampInterval = null;
let lastRampTime = 0;

function startRamping(id, field, direction, baseStep) {
    stopRamping();
    const startTime = Date.now();
    let lastTick = startTime;
    
    // Initial single step
    stepNodeParam(id, field, direction * baseStep);
    
    const rampLoop = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const tickDelta = now - lastTick;
        
        if (elapsed > RAMP_CONFIG.delay) {
            const s = (now - (startTime + RAMP_CONFIG.delay)) / 1000;
            const accel = Math.min(1 + Math.pow(s, 3) * RAMP_CONFIG.baseAccel, RAMP_CONFIG.maxAccel);
            const step = direction * baseStep * accel * (tickDelta / 100); 
            
            stepNodeParam(id, field, step);
        }
        
        lastTick = now;
        activeRampInterval = requestAnimationFrame(rampLoop);
    };
    
    activeRampInterval = requestAnimationFrame(rampLoop);
}

function stopRamping() {
    if (activeRampInterval) {
        cancelAnimationFrame(activeRampInterval);
        activeRampInterval = null;
    }
}

function startGlobalRamping(paramName, direction, baseStep) {
    stopRamping();
    const startTime = Date.now();
    let lastTick = startTime;
    
    const update = (val) => {
        if (paramName === 'launchAngle') { launchAngle += val; document.getElementById('launch-angle').value = launchAngle.toFixed(1); }
        if (paramName === 'launchPower') { launchPower += val; document.getElementById('launch-power').value = launchPower.toFixed(1); }
        if (paramName === 'launchDelay') { launchDelay += val; document.getElementById('launch-delay').value = launchDelay.toFixed(0); }
        if (paramName === 'simDuration') { simDuration += val; document.getElementById('sim-duration').value = simDuration.toFixed(0); }
        triggerRecalculate();
    };

    update(direction * baseStep);
    
    const rampLoop = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const tickDelta = now - lastTick;
        
        if (elapsed > RAMP_CONFIG.delay) {
            const s = (now - (startTime + RAMP_CONFIG.delay)) / 1000;
            const accel = Math.min(1 + Math.pow(s, 3) * RAMP_CONFIG.baseAccel, RAMP_CONFIG.maxAccel);
            update(direction * baseStep * accel * (tickDelta / 100));
        }
        
        lastTick = now;
        activeRampInterval = requestAnimationFrame(rampLoop);
    };
    activeRampInterval = requestAnimationFrame(rampLoop);
}

function toggleNode(id) {
    const node = burnNodes.find(n => n.id === id);
    if (node) {
        node.enabled = node.enabled === false ? true : false;
        triggerRecalculate();
    }
}

function removeNode(id) {
    burnNodes = burnNodes.filter(n => n.id !== id);
    triggerRecalculate();
}

function refreshUI() {
    // 1. Rebuild Node List Elements
    const list = document.getElementById('burn-list');
    list.innerHTML = '';
    
    // Sort array before rendering
    burnNodes.sort((a, b) => a.time - b.time);

    burnNodes.forEach(n => {
        const isEnabled = n.enabled !== false;
        const div = document.createElement('div');
        div.className = `node-item p-3 relative bg-black/40 border border-white/5 rounded-lg ${!isEnabled ? 'opacity-50 grayscale-[0.5]' : ''}`;
        
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2 text-slate-500">
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} 
                           onchange="toggleNode(${n.id})"
                           class="w-3 h-3 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500">
                    <input type="text" value="${n.label}" 
                           onchange="updateNodeParam(${n.id}, 'label', this.value)"
                           class="bg-transparent border-none p-0 m-0 font-bold ${isEnabled ? 'text-blue-400' : 'text-slate-500'} text-xs w-28 uppercase tracking-tighter outline-none focus:text-blue-300 pointer-events-auto">
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-[9px] font-bold text-slate-400 font-mono" title="Estimated Fuel Cost">DV: ${(n.totalDV || 0).toFixed(2)} m/s</span>
                    <span class="text-[8px] font-bold text-orange-400/70 font-mono" title="Execution Time">BURN: ${(n.burnDuration || 0).toFixed(1)}s</span>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="removeNode(${n.id})" class="text-slate-600 hover:text-red-400 pointer-events-auto transition-colors">
                         <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
                    </button>
                </div>
            </div>
            <div class="space-y-2 pointer-events-auto mt-2 pt-2 border-t border-white/5">
                <div class="flex items-center justify-between">
                    <span class="text-[9px] text-slate-500 uppercase font-black w-14">Time</span>
                    <div class="flex gap-1 items-center">
                        <button onmousedown="startRamping(${n.id}, 'time', -1, 0.001)" onmouseup="stopRamping()" onmouseleave="stopRamping()" class="w-8 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-xs text-white rounded transition-colors select-none">-</button>
                        <input type="number" step="0.001" class="!w-20 !px-1 !py-0 !text-center !text-xs" value="${parseFloat(n.time.toFixed(3))}" onchange="updateNodeParam(${n.id}, 'time', this.value)">
                        <button onmousedown="startRamping(${n.id}, 'time', 1, 0.001)" onmouseup="stopRamping()" onmouseleave="stopRamping()" class="w-8 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-xs text-white rounded transition-colors select-none">+</button>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-[9px] text-slate-500 uppercase font-black w-14">Prograde</span>
                    <div class="flex gap-1 items-center">
                        <button onmousedown="startRamping(${n.id}, 'dvPrograde', -1, 0.001)" onmouseup="stopRamping()" onmouseleave="stopRamping()" class="w-8 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-xs text-white rounded transition-colors select-none">-</button>
                        <input type="number" step="0.001" class="!w-20 !px-1 !py-0 !text-center !text-xs" value="${parseFloat(n.dvPrograde.toFixed(3))}" onchange="updateNodeParam(${n.id}, 'dvPrograde', this.value)">
                        <button onmousedown="startRamping(${n.id}, 'dvPrograde', 1, 0.001)" onmouseup="stopRamping()" onmouseleave="stopRamping()" class="w-8 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-xs text-white rounded transition-colors select-none">+</button>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-[9px] text-slate-500 uppercase font-black w-14">Radial In</span>
                    <div class="flex gap-1 items-center">
                        <button onmousedown="startRamping(${n.id}, 'dvRadial', -1, 0.001)" onmouseup="stopRamping()" onmouseleave="stopRamping()" class="w-8 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-xs text-white rounded transition-colors select-none">-</button>
                        <input type="number" step="0.001" class="!w-20 !px-1 !py-0 !text-center !text-xs" value="${parseFloat(n.dvRadial.toFixed(3))}" onchange="updateNodeParam(${n.id}, 'dvRadial', this.value)">
                        <button onmousedown="startRamping(${n.id}, 'dvRadial', 1, 0.001)" onmouseup="stopRamping()" onmouseleave="stopRamping()" class="w-8 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-xs text-white rounded transition-colors select-none">+</button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(div);
    });

    // 2. Rebuild Intercepts
    const intBox = document.getElementById('intercept-container');
    intBox.innerHTML = '';
    
    // Group intercepts by enter/exit pairs for cleaner display
    let activeEncounter = null;
    let encounters = [];
    
    interceptEvents.forEach(ev => {
        if (ev.type === 'ENTER') activeEncounter = ev;
        if (ev.type === 'EXIT' && activeEncounter) {
            encounters.push({ start: activeEncounter.time, end: ev.time, minDist: activeEncounter.minDist });
            activeEncounter = null;
        }
    });
    // Catch-all if simulation ends while inside SOI
    if (activeEncounter) encounters.push({ start: activeEncounter.time, end: '???', minDist: activeEncounter.minDist });

    encounters.forEach((en, i) => {
        const distStr = en.minDist !== undefined ? (en.minDist * 10).toFixed(0) + " km" : "---";
        const html = `
            <div class="flex items-center justify-between p-2 bg-yellow-500/10 rounded border border-yellow-500/20 mb-1">
                <div class="flex items-center gap-2">
                    <span class="encounter-badge">T+ ${Math.round(en.start)}</span>
                    <span class="text-[10px] font-bold text-yellow-200">INTERCEPT #${i+1}</span>
                </div>
                <div class="text-[10px] text-yellow-100/70 font-mono font-bold">MIN: ${distStr}</div>
            </div>
        `;
        intBox.insertAdjacentHTML('beforeend', html);
    });
}

function updateHUDStats(state, simTime) {
    const vel = Math.sqrt(state.vx*state.vx + state.vy*state.vy);
    
    const soiEl = document.getElementById('soi-val');
    soiEl.innerText = state.soi.toUpperCase();
    soiEl.style.color = state.soi === 'Moon' ? 'var(--accent-yellow)' : '#c9d1d9';
    
    document.getElementById('time-val').innerText = "T+ " + simTime.toFixed(1);
    document.getElementById('vel-val').innerText = (vel * 10).toFixed(1) + " m/s";

    document.getElementById('ap-val').innerText = (state.ap === Infinity ? 'Escape' : (state.ap * 10).toFixed(0) + " km");
    // Only show Pe if we're not inside the planet realistically, but math handles it
    document.getElementById('pe-val').innerText = (state.pe * 10).toFixed(0) + " km";
    if (document.getElementById('period-val')) {
        document.getElementById('period-val').innerText = state.period === Infinity ? 'N/A' : (state.period).toFixed(1) + " s";
    }
    if (document.getElementById('fuel-val')) {
        document.getElementById('fuel-val').innerText = `${state.fuel.toFixed(0)} / ${CONSTANTS.MAX_FUEL_DV}`;
    }
}
