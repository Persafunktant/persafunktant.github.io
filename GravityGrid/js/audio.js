/**
 * Ported Chiptune Audio Engine from Neon Flip
 */
class ChiptuneEngine {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.isPlaying = false;
        
        // C Minor Blues Scale (Melodic and catchy)
        // C3, Eb3, F3, Gb3, G3, Bb3, C4, Eb4
        this.notes = [130.81, 155.56, 174.61, 185.00, 196.00, 233.08, 261.63, 311.13]; 
        this.step = 0;
        this.pattern = 0; // 0: Intro, 1: Build, 2: Drop/Hook, 3: Breakdown
        
        // Timing state for lookahead scheduler
        this.nextNoteTime = 0.0;
        this.scheduleAheadTime = 0.1; // Seconds to schedule ahead
        this.lookaheadInterval = 25.0; // ms between scheduler checks
        this.timerID = null;
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.value = 0.15;
        this.masterVolume.connect(this.ctx.destination);
    }

    // Advanced synth with Vibrato and ADSR-ish envelope
    playSynth(freq, time, duration, vol, type = 'square', vibrato = false) {
        if (!isFinite(freq)) return;
        
        const osc = this.ctx.createOscillator();
        const vca = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);

        if (vibrato) {
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();
            lfo.frequency.setValueAtTime(6, time); // 6Hz vib
            lfoGain.gain.setValueAtTime(freq * 0.01, time);
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start(time);
            lfo.stop(time + duration);
        }

        // ADSR Envelope
        vca.gain.setValueAtTime(0, time);
        vca.gain.linearRampToValueAtTime(vol, time + 0.02); // Attack
        vca.gain.exponentialRampToValueAtTime(vol * 0.5, time + duration * 0.5); // Decay/Sustain
        vca.gain.exponentialRampToValueAtTime(0.0001, time + duration); // Release
        
        osc.connect(vca);
        vca.connect(this.masterVolume);
        
        osc.start(time);
        osc.stop(time + duration);
    }

    playPercussion(type, time, vol = 0.6) {
        if (type === 'kick') {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(160, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
            gain.gain.setValueAtTime(vol, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
            osc.connect(gain); gain.connect(this.masterVolume);
            osc.start(time); osc.stop(time + 0.12);
        } else if (type === 'snare') {
            const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const env = this.ctx.createGain();
            env.gain.setValueAtTime(vol * 0.4, time);
            env.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
            noise.connect(env); env.connect(this.masterVolume);
            noise.start(time);
        } else if (type === 'hihat') {
            const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.02, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(8000, time);
            const env = this.ctx.createGain();
            env.gain.setValueAtTime(vol * 0.2, time);
            env.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
            noise.connect(filter); filter.connect(env); env.connect(this.masterVolume);
            noise.start(time);
        }
    }

    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.step, this.nextNoteTime);
            this.advanceNote();
        }
        this.timerID = setTimeout(() => this.scheduler(), this.lookaheadInterval);
    }

    advanceNote() {
        const tempo = 124.0;
        const secondsPerBeat = 60.0 / tempo;
        this.nextNoteTime += 0.25 * secondsPerBeat; // 16th note steps

        this.step++;
        if (this.step % 128 === 0) {
            this.pattern++;
            if (this.pattern >= 8) {
                this.pattern = 1; // Loop back to Build, skipping Intro (0)
            }
        }
    }

    scheduleNote(step, time) {
        if (!this.isPlaying) return;

        const subStep = step % 16;
        const tempo = 124.0;
        const secondsPerBeat = 60.0 / tempo;
        const stepLen = 0.25 * secondsPerBeat;

        // --- RHYTHM SECTION ---
        // Breakdown (3) and Bridge (6) have minimal/no drums
        const hasDrums = (this.pattern !== 3 && this.pattern !== 6);
        const intenseDrums = (this.pattern === 2 || this.pattern === 5 || this.pattern === 7);

        if (hasDrums) {
            // Kick - Solid driving pulse (1, 5, 9, 13)
            if (step % 4 === 0) this.playPercussion('kick', time, 0.7);
            
            // Snare - Backbeat (5, 13)
            if (step % 8 === 4) this.playPercussion('snare', time, 0.6);

            // Hi-hats
            if (intenseDrums) { // High energy sections
                if (step % 2 === 1) this.playPercussion('hihat', time, 0.4);
            } else {
                if (step % 4 === 2) this.playPercussion('hihat', time, 0.3);
            }
        }

        // --- BASS SECTION ---
        // Groovy fixed bassline
        const bassPattern = [0, -1, -1, 0, -1, -1, 0, 5, 0, -1, 0, -1, -1, 0, -1, -1];
        const noteIdx = bassPattern[subStep];
        if (noteIdx !== -1) {
            let actualIdx = noteIdx;
            // Key shifts for different sections
            if (this.pattern === 2 || this.pattern === 5) {
                if (step % 32 >= 16) actualIdx = 5; // C -> Bb shift
            } else if (this.pattern === 4 || this.pattern === 6) {
                if (step % 32 >= 16) actualIdx = 2; // C -> F shift
            }
            const freq = this.notes[actualIdx] / 2;
            this.playSynth(freq, time, stepLen * 0.9, 0.12, 'sawtooth');
        }

        // --- MELODY / LEAD SECTION ---
        switch(this.pattern) {
            case 0: // Intro: Simple melody
                const introMel = [0, -1, -1, -1, 2, -1, -1, -1, 4, -1, -1, -1, 5, -1, -1, -1];
                const m0 = introMel[subStep];
                if (m0 !== -1) this.playSynth(this.notes[m0], time, stepLen * 4, 0.08, 'sine', true);
                break;
            case 1: // Build: Rising Arp
            case 7: // Final Build: Intense Arp
                const buildArp = [0, 2, 4, 6, 0, 2, 4, 6, 0, 2, 4, 6, 7, 6, 5, 4];
                const oct = (this.pattern === 7 ? 4 : 2);
                const freq1 = this.notes[buildArp[subStep]] * oct;
                this.playSynth(freq1, time, stepLen, 0.06, 'square');
                break;
            case 2: // Drop 1: The Hook
                const hook1 = [0, 0, 2, 0, 5, 4, 2, 0, 4, 4, 5, 4, 0, -1, -1, -1];
                const m2 = hook1[subStep];
                if (m2 !== -1) this.playSynth(this.notes[m2] * 2, time, stepLen * 1.5, 0.12, 'square', true);
                break;
            case 3: // Breakdown
                if (subStep === 0) {
                    this.playSynth(this.notes[0] * 2, time, stepLen * 16, 0.06, 'triangle', true);
                    this.playSynth(this.notes[2] * 2, time, stepLen * 16, 0.04, 'triangle', true);
                }
                break;
            case 4: // Alt Build: Syncopated
                const altBuild = [0, -1, 2, -1, 4, -1, 5, -1, 7, -1, 5, -1, 4, -1, 2, -1];
                const m4 = altBuild[subStep];
                if (m4 !== -1) this.playSynth(this.notes[m4] * 2, time, stepLen * 0.8, 0.07, 'sawtooth');
                break;
            case 5: // Drop 2: Varied Hook
                const hook2 = [7, 7, 5, 7, 4, 5, 2, 0, 5, 5, 4, 2, 0, -1, -1, -1];
                const m5 = hook2[subStep];
                if (m5 !== -1) this.playSynth(this.notes[m5] * 2.5, time, stepLen * 1.5, 0.1, 'square', true);
                break;
            case 6: // Bridge: Melodic call/response
                const bridge = [0, -1, 0, -1, 2, -1, 2, -1, 4, -1, 5, -1, 4, -1, 2, -1];
                const m6 = bridge[subStep];
                if (m6 !== -1) this.playSynth(this.notes[m6], time, stepLen * 2, 0.1, 'sine', true);
                break;
        }
    }

    start() {
        this.init();
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.step = 0;
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduler();
    }

    stop() { 
        this.isPlaying = false; 
        if (this.timerID) clearTimeout(this.timerID);
    }

    setVolume(value) {
        if (this.masterVolume) {
            this.masterVolume.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
        }
    }

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
