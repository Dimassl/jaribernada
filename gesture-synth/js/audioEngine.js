/**
 * audioEngine.js
 * ------------------------------------------------------------------
 * Membungkus Tone.js: membuat instrumen, menerapkan pitch quantization
 * ke tangga nada (scale) yang dipilih, dan mengelola note on/off per
 * tangan (polifoni maksimum 2 suara: kiri & kanan).
 * ------------------------------------------------------------------
 */

const AudioEngine = (() => {

  // Interval semitone relatif terhadap root, untuk tiap tangga nada.
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],       // Ionian
    minor: [0, 2, 3, 5, 7, 8, 10],       // Natural minor / Aeolian
  };

  const MIDI_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // Rentang oktaf yang dipetakan dari ketinggian tangan (0 = paling rendah).
  const OCTAVE_SPAN = 2;      // 2 oktaf penuh
  const BASE_OCTAVE = 3;      // mulai dari oktaf 3 (C3, dst)

  let state = {
    root: 0,           // 0 = C
    scaleName: "major",
    instrumentName: "piano",
    instrument: null,
    master: null,
    activeVoices: { Left: null, Right: null }, // menyimpan nama not aktif per tangan
    ready: false,
  };

  /**
   * Membuat instrumen Tone.js sesuai pilihan.
   * Piano memakai sample recording (Salamander) via Tone.Sampler agar realistis.
   * Instrumen lain memakai synthesis Tone.js yang di-tuning menyerupai karakter aslinya,
   * sehingga tidak bergantung pada file sample tambahan.
   */
  function buildInstrument(name) {
    switch (name) {
      case "piano":
        return new Tone.Sampler({
          urls: {
            C4: "C4.mp3",
            "D#4": "Ds4.mp3",
            "F#4": "Fs4.mp3",
            A4: "A4.mp3",
            C3: "C3.mp3",
            "D#3": "Ds3.mp3",
            "F#3": "Fs3.mp3",
            A3: "A3.mp3",
            C5: "C5.mp3",
            "D#5": "Ds5.mp3",
            "F#5": "Fs5.mp3",
            A5: "A5.mp3",
          },
          release: 1.2,
          baseUrl: "https://tonejs.github.io/audio/salamander/",
        });

      case "guitar":
        // PluckSynth: karplus-strong physical modeling -> karakter dawai dipetik.
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
          envelope: { attack: 0.005, decay: 0.6, sustain: 0.15, release: 1.4 },
          volume: -6,
        });

      case "saxophone":
        // FMSynth dengan portamento & envelope legato -> karakter tiup yang "menggesek".
        return new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 1.5,
          modulationIndex: 8,
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.08, decay: 0.25, sustain: 0.65, release: 0.6 },
          modulation: { type: "square" },
          modulationEnvelope: { attack: 0.15, decay: 0.2, sustain: 0.4, release: 0.4 },
          volume: -8,
        });

      case "kalimba":
        // AMSynth + envelope cepat & decay panjang -> karakter logam dipetik (bilah kalimba).
        return new Tone.PolySynth(Tone.AMSynth, {
          harmonicity: 3.01,
          oscillator: { type: "sine" },
          modulation: { type: "triangle" },
          envelope: { attack: 0.002, decay: 1.4, sustain: 0.05, release: 1.0 },
          modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0.1, release: 0.5 },
          volume: -5,
        });

      default:
        return new Tone.PolySynth(Tone.Synth);
    }
  }

  async function init() {
    state.master = new Tone.Volume(-10).toDestination();
    state.instrument = buildInstrument(state.instrumentName);
    state.instrument.connect(state.master);
    state.ready = true;
  }

  async function setInstrument(name) {
    if (name === state.instrumentName && state.instrument) return;
    const old = state.instrument;
    const fresh = buildInstrument(name);
    fresh.connect(state.master);
    state.instrument = fresh;
    state.instrumentName = name;
    state.activeVoices.Left = null;
    state.activeVoices.Right = null;
    if (old) {
      // Buang instrumen lama setelah release alami selesai.
      setTimeout(() => old.dispose && old.dispose(), 1500);
    }
  }

  function setScale(name) {
    if (SCALES[name]) state.scaleName = name;
  }

  function setRoot(semitoneFromC) {
    state.root = ((semitoneFromC % 12) + 12) % 12;
  }

  function setVolumeDb(db) {
    if (state.master) state.master.volume.rampTo(db, 0.05);
  }

  /**
   * Kuantisasi: ubah posisi vertikal tangan (0 = bawah layar, 1 = atas layar)
   * menjadi frekuensi nada yang selalu berada dalam tangga nada aktif.
   */
  function quantizeYToNote(normalizedHeight) {
    const scale = SCALES[state.scaleName];
    const totalSteps = scale.length * OCTAVE_SPAN;
    const clamped = Math.min(0.999, Math.max(0, normalizedHeight));
    const stepIndex = Math.floor(clamped * totalSteps);

    const octaveOffset = Math.floor(stepIndex / scale.length);
    const degreeIndex = stepIndex % scale.length;
    const semitoneFromRoot = scale[degreeIndex];

    const midiNote =
      12 * (BASE_OCTAVE + octaveOffset) + state.root + semitoneFromRoot + 12; // +12: C4 anchor

    const noteName = MIDI_NAMES[midiNote % 12] + Math.floor(midiNote / 12 - 1);
    const freq = Tone.Midi(midiNote).toFrequency();

    return { noteName, freq, midiNote };
  }

  /** Mulai membunyikan nada untuk tangan tertentu ("Left" | "Right"). */
  function noteOn(hand, normalizedHeight, velocity = 0.85) {
    if (!state.ready) return null;
    const { noteName, freq } = quantizeYToNote(normalizedHeight);

    // Jika tangan ini sudah membunyikan nada lain, lepaskan dulu (glide antar nada).
    if (state.activeVoices[hand] && state.activeVoices[hand] !== noteName) {
      safeRelease(state.activeVoices[hand]);
    }

    if (state.instrument.triggerAttack) {
      state.instrument.triggerAttack(freq, Tone.now(), velocity);
    }
    state.activeVoices[hand] = noteName;
    return noteName;
  }

  /** Perbarui pitch nada yang sedang berbunyi (glide halus) tanpa re-trigger attack. */
  function noteUpdate(hand, normalizedHeight, velocity = 0.85) {
    if (!state.ready || !state.activeVoices[hand]) return noteOn(hand, normalizedHeight, velocity);
    const { noteName } = quantizeYToNote(normalizedHeight);
    if (noteName !== state.activeVoices[hand]) {
      // Nada berubah antar-langkah tangga nada -> lepas lalu bunyikan nada baru.
      safeRelease(state.activeVoices[hand]);
      return noteOn(hand, normalizedHeight, velocity);
    }
    return noteName;
  }

  function safeRelease(noteName) {
    if (state.instrument.triggerRelease) {
      try {
        state.instrument.triggerRelease(noteName, Tone.now());
      } catch (e) { /* noop */ }
    }
  }

  function noteOff(hand) {
    const current = state.activeVoices[hand];
    if (current) {
      safeRelease(current);
      state.activeVoices[hand] = null;
    }
  }

  function getScaleDegreesCount() {
    return SCALES[state.scaleName].length * OCTAVE_SPAN;
  }

  function getActiveNote(hand) {
    return state.activeVoices[hand];
  }

  return {
    init,
    setInstrument,
    setScale,
    setRoot,
    setVolumeDb,
    quantizeYToNote,
    noteOn,
    noteUpdate,
    noteOff,
    getScaleDegreesCount,
    getActiveNote,
  };
})();
