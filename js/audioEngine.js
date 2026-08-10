/**
 * audioEngine.js
 * ------------------------------------------------------------------
 * ------------------------------------------------------------------
 */

const AudioEngine = (() => {

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],       // Ionian
    minor: [0, 2, 3, 5, 7, 8, 10],       // Natural minor / Aeolian
  };

  const MIDI_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  
  const MAX_FINGERS = 5;

  
  const HAND_OCTAVE = { Left: 3, Right: 5 };

  let state = {
    root: 0,           // 0 = C
    scaleName: "major",
    instrument: null,
    master: null,
    activeVoices: { Left: null, Right: null }, // menyimpan nama not aktif per tangan
    ready: false,
  };

  
  function buildPiano() {
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
        C2: "C2.mp3",
        "D#2": "Ds2.mp3",
        "F#2": "Fs2.mp3",
        A2: "A2.mp3",
        C5: "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        A5: "A5.mp3",
        C6: "C6.mp3",
      },
      release: 1.2,
      baseUrl: "https://tonejs.github.io/audio/salamander/",
    });
  }

  async function init() {
    state.master = new Tone.Volume(-10).toDestination();
    state.instrument = buildPiano();
    state.instrument.connect(state.master);
    state.ready = true;
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

  
  function quantizeFingersToNote(hand, fingerCount) {
    if (!fingerCount || fingerCount <= 0) return null;

    const scale = SCALES[state.scaleName];
    const degreeIndex = Math.min(fingerCount, MAX_FINGERS, scale.length) - 1; // 1-5 -> 0-4
    const semitoneFromRoot = scale[degreeIndex];
    const octave = HAND_OCTAVE[hand] ?? 4;

    const midiNote = 12 * octave + state.root + semitoneFromRoot + 12; // +12: C4 anchor
    const noteName = MIDI_NAMES[midiNote % 12] + Math.floor(midiNote / 12 - 1);
    const freq = Tone.Midi(midiNote).toFrequency();

    return { noteName, freq, midiNote };
  }

  
  function noteOn(hand, fingerCount, velocity = 0.85) {
    if (!state.ready) return null;
    const result = quantizeFingersToNote(hand, fingerCount);
    if (!result) return null;

    if (state.activeVoices[hand] && state.activeVoices[hand] !== result.noteName) {
      safeRelease(state.activeVoices[hand]);
    }

    if (state.instrument.triggerAttack) {
      state.instrument.triggerAttack(result.freq, Tone.now(), velocity);
    }
    state.activeVoices[hand] = result.noteName;
    return result.noteName;
  }

  //update 
  function noteUpdate(hand, fingerCount, velocity = 0.85) {
    if (!fingerCount || fingerCount <= 0) {
      noteOff(hand);
      return null;
    }
    const result = quantizeFingersToNote(hand, fingerCount);
    if (!result) return null;

    if (!state.activeVoices[hand]) {
      return noteOn(hand, fingerCount, velocity);
    }
    if (result.noteName !== state.activeVoices[hand]) {
      safeRelease(state.activeVoices[hand]);
      return noteOn(hand, fingerCount, velocity);
    }
    return result.noteName;
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

  function getActiveNote(hand) {
    return state.activeVoices[hand];
  }

  return {
    init,
    setScale,
    setRoot,
    setVolumeDb,
    quantizeFingersToNote,
    noteOn,
    noteUpdate,
    noteOff,
    getActiveNote,
    MAX_FINGERS,
  };
})();
