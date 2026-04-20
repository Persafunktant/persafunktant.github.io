// graphics.js - Procedural Rendering Assets

function drawProceduralEarth(ctx, radius) {
    ctx.save();
    
    // Create soft atmospheric glow
    const glow = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, radius * 1.5);
    glow.addColorStop(0, "rgba(59, 130, 246, 0.4)"); 
    glow.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Base ocean sphere
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip(); // Clip to the circle

    // Ocean color
    ctx.fillStyle = "#1e3a8a"; 
    ctx.fillRect(-radius, -radius, radius*2, radius*2);

    // Procedural continents (Simple overlapping circles to look like landmasses)
    ctx.fillStyle = "#22c55e"; // Green
    const rng = (seed) => { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
    
    // Draw pseudo-continents
    for(let i=0; i<15; i++) {
        let lx = (rng(i*1)-0.5)*radius*1.8;
        let ly = (rng(i*2)-0.5)*radius*1.8;
        let lr = rng(i*3)*radius*0.6 + 10;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI*2);
        ctx.fill();
    }

    // Shading shadow for depth (Day/Night terminator roughly)
    const shadow = ctx.createLinearGradient(-radius, -radius, radius, radius);
    shadow.addColorStop(0, "rgba(255,255,255,0.1)");
    shadow.addColorStop(0.5, "rgba(0,0,0,0)");
    shadow.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-radius, -radius, radius*2, radius*2);

    ctx.restore();
}

function drawProceduralMoon(ctx, radius) {
    ctx.save();
    
    // Base Grey
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip(); 

    ctx.fillStyle = "#94a3b8"; 
    ctx.fillRect(-radius, -radius, radius*2, radius*2);

    // Dark craters
    ctx.fillStyle = "#475569";
    const rng = (seed) => { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
    for(let i=0; i<8; i++) {
        let cx = (rng(i*4)-0.5)*radius*1.5;
        let cy = (rng(i*5)-0.5)*radius*1.5;
        let cr = rng(i*6)*radius*0.3 + 2;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI*2);
        ctx.fill();
        // Highlight edge
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    // Shadow
    const shadow = ctx.createLinearGradient(-radius, -radius, radius, radius);
    shadow.addColorStop(0, "rgba(255,255,255,0.2)");
    shadow.addColorStop(0.6, "rgba(0,0,0,0)");
    shadow.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-radius, -radius, radius*2, radius*2);

    ctx.restore();
}

function drawProceduralMoon2(ctx, radius) {
    ctx.save();
    
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip(); 

    // Ice/Crystal color
    ctx.fillStyle = "#38bdf8"; 
    ctx.fillRect(-radius, -radius, radius*2, radius*2);

    // Streaks
    ctx.fillStyle = "#e0f2fe";
    const rng = (seed) => { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); };
    for(let i=0; i<12; i++) {
        let cx = (rng(i*7)-0.5)*radius*1.8;
        let cy = (rng(i*8)-0.5)*radius*1.8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius*0.4, rng(i*9)*radius*0.1 + 1, Math.PI/4, 0, Math.PI*2);
        ctx.fill();
    }

    const shadow = ctx.createLinearGradient(-radius, -radius, radius, radius);
    shadow.addColorStop(0, "rgba(255,255,255,0.3)");
    shadow.addColorStop(0.5, "rgba(0,0,0,0)");
    shadow.addColorStop(1, "rgba(0,0,0,0.9)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-radius, -radius, radius*2, radius*2);

    ctx.restore();
}

function drawProceduralShip(ctx, scale, soi, isBurning, isReentry) {
    ctx.save();
    
    // Scale adjustment: if zoomed way in, give ship a physical size (0.2 * base vectors = roughly 2-3 game units)
    let s = scale > 5 ? 0.2 : 1 / scale;

    // Reentry visual effect
    if (isReentry) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.4)"; // Red glow
        ctx.beginPath();
        // Nose shield
        ctx.arc(12*s, 0, 16*s, -Math.PI/2, Math.PI/2);
        ctx.lineTo(-20*s, 10*s);
        ctx.lineTo(-20*s, -10*s);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = "rgba(249, 115, 22, 0.8)"; // Hot orange
        ctx.beginPath();
        ctx.arc(10*s, 0, 12*s, -Math.PI/2, Math.PI/2);
        ctx.fill();
    }

    // Flame Exhaust
    if (isBurning) {
        ctx.fillStyle = "#f97316"; 
        ctx.beginPath();
        ctx.moveTo(-10*s, 3*s);
        const flicker = Math.random() * 5 + 10;
        ctx.lineTo((-10 - flicker)*s, 0);
        ctx.lineTo(-10*s, -3*s);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.moveTo(-10*s, 1*s);
        ctx.lineTo((-10 - (flicker*0.5))*s, 0);
        ctx.lineTo(-10*s, -1*s);
        ctx.closePath();
        ctx.fill();
    }

    // Ship Hull (Rectangular body with nose cone, sits flat on tail)
    if (soi === 'Moon') ctx.fillStyle = '#facc15';
    else if (soi === 'Moon2') ctx.fillStyle = '#38bdf8';
    else ctx.fillStyle = '#ffffff';

    ctx.beginPath();
    ctx.moveTo(10*s, 0);       // Nose
    ctx.lineTo(2*s, 6*s);      // Shoulder
    ctx.lineTo(-10*s, 6*s);    // Bottom tail corner
    ctx.lineTo(-10*s, -6*s);   // Top tail corner
    ctx.lineTo(2*s, -6*s);     // Shoulder
    ctx.closePath();
    ctx.fill();
    
    // Windows
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(4*s, 0, 2*s, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
}
