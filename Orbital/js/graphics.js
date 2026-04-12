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

function drawProceduralShip(ctx, scale, isMoonSOI, isBurning) {
    ctx.save();
    
    // Flame Exhaust
    if (isBurning) {
        ctx.fillStyle = "#f97316"; // Orange flame
        ctx.beginPath();
        // Flame trails out back
        ctx.moveTo(-10/scale, 2/scale);
        // Flicker effect using time
        const flicker = Math.random() * 5 + 10;
        ctx.lineTo((-10 - flicker)/scale, 0);
        ctx.lineTo(-10/scale, -2/scale);
        ctx.closePath();
        ctx.fill();
        
        // Inner bright flame
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.moveTo(-10/scale, 1/scale);
        ctx.lineTo((-10 - (flicker*0.5))/scale, 0);
        ctx.lineTo(-10/scale, -1/scale);
        ctx.closePath();
        ctx.fill();
    }

    // Ship Hull (Pointy triangle)
    ctx.fillStyle = isMoonSOI ? '#facc15' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(15/scale, 0);
    ctx.lineTo(-10/scale, 8/scale);
    ctx.lineTo(-10/scale, -8/scale);
    ctx.closePath();
    ctx.fill();
    
    // Windows or accents
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(2/scale, 0, 2/scale, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
}
