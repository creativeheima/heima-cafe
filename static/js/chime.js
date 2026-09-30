/**
 * Web Audio API synthesizer for café order bell & notifications
 * Zero external audio files required!
 */
class CafeAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playOrderBell() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Note 1: High crisp chime (E6 ~ 1318.5 Hz)
      this._playTone(1318.5, now, 0.6, 0.4);

      // Note 2: Harmonious lower tone (A5 ~ 880 Hz)
      this._playTone(880.0, now + 0.15, 0.9, 0.5);

      // Note 3: Warm resolution (C#6 ~ 1108 Hz)
      this._playTone(1108.7, now + 0.35, 1.2, 0.4);
    } catch (e) {
      console.warn("Audio playback not ready:", e);
    }
  }

  playWaiterCall() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Urgent double beep for waiter call
      this._playTone(987.77, now, 0.2, 0.5);
      this._playTone(1318.5, now + 0.18, 0.3, 0.6);
      this._playTone(987.77, now + 0.36, 0.2, 0.5);
      this._playTone(1318.5, now + 0.54, 0.4, 0.6);
    } catch (e) {
      console.warn("Audio playback not ready:", e);
    }
  }

  playSuccess() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this._playTone(523.25, now, 0.15, 0.3); // C5
      this._playTone(659.25, now + 0.1, 0.25, 0.35); // E5
      this._playTone(783.99, now + 0.2, 0.4, 0.4); // G5
    } catch (e) {}
  }

  _playTone(freq, startTime, duration, maxVol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(maxVol, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

window.cafeAudio = new CafeAudio();
