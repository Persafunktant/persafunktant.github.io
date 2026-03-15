/**
 * Ported Chiptune Audio Engine from Neon Flip
 */
class ChiptuneEngine {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.isPlaying = false;
        this.notes = [130.81, 155.56, 174.61, 185.00, 196.00, 233.08]; 
        this.step = 0;
        this.pattern = 0;
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.value = 0.15;
        this.masterVolume.connect(this.ctx.destination);
    }

    playPWM(freq, time, duration, vol, type = 'square') {
        const osc = this.ctx.createOscillator();
        const pwm = this.ctx.createOscillator();
        const pwmGain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        pwm.frequency.setValueAtTime(5, time);
        pwmGain.gain.setValueAtTime(0.002, time);
        pwm.connect(pwmGain);
        pwmGain.connect(osc.frequency);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(vol, time);
        env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(env);
        env.connect(this.masterVolume);
        pwm.start(time); osc.start(time);
        pwm.stop(time + duration); osc.stop(time + duration);
    }

    playPercussion(type, time) {
        if (type === 'kick') {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
            gain.gain.setValueAtTime(0.6, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
            osc.connect(gain); gain.connect(this.masterVolume);
            osc.start(time); osc.stop(time + 0.15);
        } else if (type === 'snare') {
            const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.2, time);
            env.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
            noise.connect(env); env.connect(this.masterVolume);
            noise.start(time);
        }
    }

    tick() {
        if (!this.isPlaying) return;
        const now = this.ctx.currentTime;
        const tempo = 132;
        const beatLen = 60 / tempo;
        const subStep = this.step % 16;
        if (this.step % 64 === 0) this.pattern = (this.pattern + 1) % 4;
        
        // Continuous upbeat drums
        if (subStep % 4 === 0) this.playPercussion('kick', now);
        if (subStep % 4 === 2) this.playPercussion('snare', now);
        
        const bassFreq = this.notes[this.pattern === 1 ? (subStep % 3) : 0] / 2;
        this.playPWM(bassFreq, now, beatLen * 0.5, 0.1, 'sawtooth');
        
        // Arpeggiator plays continuously for energy
        const arpFreq = this.notes[Math.floor(Math.random() * this.notes.length)] * 2;
        this.playPWM(arpFreq, now, beatLen * 0.2, 0.08);
        this.step++;
        setTimeout(() => this.tick(), (beatLen * 250));
    }

    start() {
        this.init();
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.tick();
    }

    stop() { this.isPlaying = false; }

    playSfx(type) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        if (type === 'jump') {
            const osc = this.ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.12, now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
            osc.connect(g); g.connect(this.masterVolume);
            osc.start(); osc.stop(now + 0.12);
        } else if (type === 'death') {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(10, now + 1.5);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.3, now);
            g.gain.linearRampToValueAtTime(0, now + 1.5);
            osc.connect(g); g.connect(this.masterVolume);
            osc.start(); osc.stop(now + 1.5);
        } else if (type === 'flip') {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.1, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(g); g.connect(this.masterVolume);
            osc.start(); osc.stop(now + 0.1);
        } else if (type === 'coin') {
            const osc = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            osc.type = 'sine';
            osc2.type = 'sine';
            osc.frequency.setValueAtTime(987.77, now); // B5
            osc2.frequency.setValueAtTime(1318.51, now); // E6
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.1, now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
            osc.connect(g); osc2.connect(g);
            g.connect(this.masterVolume);
            osc.start(); osc2.start();
            osc.stop(now + 0.5); osc2.stop(now + 0.5);
        }
    }
}
