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

function removeNode(id) {
    burnNodes = burnNodes.filter(n => n.id !== id);
    triggerRecalculate();
}

let draggedNodeId = null;

function handleDragStart(e, id) {
    draggedNodeId = id;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e, targetId) {
    e.preventDefault();
    e.stopPropagation();
    if (draggedNodeId !== targetId) {
        // Swap times to swap order
        const draggedNode = burnNodes.find(n => n.id === draggedNodeId);
        const targetNode = burnNodes.find(n => n.id === targetId);
        if (draggedNode && targetNode) {
            const tempTime = draggedNode.time;
            draggedNode.time = targetNode.time;
            targetNode.time = tempTime;
            triggerRecalculate();
        }
    }
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedNodeId = null;
}

function refreshUI() {
    // 1. Rebuild Node List Elements
    const list = document.getElementById('burn-list');
    list.innerHTML = '';
    
    // Sort array before rendering
    burnNodes.sort((a, b) => a.time - b.time);

    burnNodes.forEach(n => {
        const div = document.createElement('div');
        div.className = "node-item p-3 relative bg-black/40 border border-white/5 rounded-lg";
        div.draggable = true;
        
        div.addEventListener('dragstart', (e) => handleDragStart(e, n.id));
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', (e) => handleDrop(e, n.id));
        div.addEventListener('dragend', handleDragEnd);

        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2 cursor-grab text-slate-500">
                    <svg class="w-3 h-3 pointer-events-none" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.5 3a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 0 1H2a.5.5 0 0 1-.5-.5zm0 5a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 0 1H2a.5.5 0 0 1-.5-.5zm0 5a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 0 1H2a.5.5 0 0 1-.5-.5z"/></svg>
                    <input type="text" value="${n.label}" 
                           onchange="updateNodeParam(${n.id}, 'label', this.value)"
                           class="bg-transparent border-none p-0 m-0 font-bold text-blue-400 text-xs w-28 uppercase tracking-tighter outline-none focus:text-blue-300 pointer-events-auto">
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-[9px] font-bold text-slate-400 font-mono" title="Estimated Fuel Cost">COST: ${(n.totalDV || 0).toFixed(1)}</span>
                    <button onclick="removeNode(${n.id})" class="text-slate-600 hover:text-red-400 pointer-events-auto transition-colors">
                         <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
                    </button>
                </div>
            </div>
            <div class="space-y-2 pointer-events-auto mt-2 pt-2 border-t border-white/5">
                <div class="flex items-center justify-between">
                    <span class="text-[9px] text-slate-500 uppercase font-black w-14">Time</span>
                    <div class="flex gap-1 items-center">
                        <button onclick="stepNodeParam(${n.id}, 'time', -1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">-1</button>
                        <button onclick="stepNodeParam(${n.id}, 'time', -0.1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">-.1</button>
                        <input type="number" step="0.1" class="!w-12 !px-1 !py-0 !text-center !text-xs" value="${parseFloat(n.time.toFixed(1))}" onchange="updateNodeParam(${n.id}, 'time', this.value)">
                        <button onclick="stepNodeParam(${n.id}, 'time', 0.1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">+.1</button>
                        <button onclick="stepNodeParam(${n.id}, 'time', 1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">+1</button>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-[9px] text-slate-500 uppercase font-black w-14">Prograde</span>
                    <div class="flex gap-1 items-center">
                        <button onclick="stepNodeParam(${n.id}, 'dvPrograde', -0.1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">-.1</button>
                        <button onclick="stepNodeParam(${n.id}, 'dvPrograde', -0.01)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">-.01</button>
                        <input type="number" step="0.01" class="!w-16 !px-1 !py-0 !text-center !text-xs" value="${parseFloat(n.dvPrograde.toFixed(2))}" onchange="updateNodeParam(${n.id}, 'dvPrograde', this.value)">
                        <button onclick="stepNodeParam(${n.id}, 'dvPrograde', 0.01)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">+.01</button>
                        <button onclick="stepNodeParam(${n.id}, 'dvPrograde', 0.1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">+.1</button>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-[9px] text-slate-500 uppercase font-black w-14">Radial In</span>
                    <div class="flex gap-1 items-center">
                        <button onclick="stepNodeParam(${n.id}, 'dvRadial', -0.1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">-.1</button>
                        <button onclick="stepNodeParam(${n.id}, 'dvRadial', -0.01)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">-.01</button>
                        <input type="number" step="0.01" class="!w-16 !px-1 !py-0 !text-center !text-xs" value="${parseFloat(n.dvRadial.toFixed(2))}" onchange="updateNodeParam(${n.id}, 'dvRadial', this.value)">
                        <button onclick="stepNodeParam(${n.id}, 'dvRadial', 0.01)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">+.01</button>
                        <button onclick="stepNodeParam(${n.id}, 'dvRadial', 0.1)" class="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-white rounded">+.1</button>
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
    if (document.getElementById('fuel-val')) {
        document.getElementById('fuel-val').innerText = `${state.fuel.toFixed(0)} / ${CONSTANTS.MAX_FUEL_DV}`;
    }
}
