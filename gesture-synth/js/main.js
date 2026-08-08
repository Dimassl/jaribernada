/**
 * main.js
 * ------------------------------------------------------------------
 * Titik masuk aplikasi: menghubungkan GestureDetector <-> AudioEngine
 * <-> UIController. Tidak ada logika audio/CV di file ini — murni
 * orkestrasi & event wiring.
 * ------------------------------------------------------------------
 */

(function bootstrap() {
  let cameraOn = false;
  let audioInitialized = false;

  const videoEl = document.getElementById("inputVideo");
  const canvasEl = document.getElementById("overlayCanvas");

  async function ensureAudioReady() {
    if (audioInitialized) return;
    await Tone.start();          // wajib dipicu oleh interaksi pengguna (klik tombol)
    await AudioEngine.init();
    AudioEngine.setInstrument(document.getElementById("instrumentSelect").value);
    AudioEngine.setScale(document.getElementById("scaleSelect").value);
    AudioEngine.setRoot(parseInt(document.getElementById("rootSelect").value, 10));
    AudioEngine.setVolumeDb(parseInt(document.getElementById("volumeSlider").value, 10));
    audioInitialized = true;
    UIController.buildLadder(AudioEngine.getScaleDegreesCount());
  }

  async function startCamera() {
    await ensureAudioReady();
    try {
      await GestureDetector.start(videoEl, canvasEl, {
        onHandMove: handleHandMove,
        onPinchStart: handlePinchStart,
        onPinchEnd: handlePinchEnd,
        onHandLost: handleHandLost,
      });
      cameraOn = true;
      UIController.setCameraLive(true);
    } catch (err) {
      console.error("Gagal mengakses webcam:", err);
      alert(
        "Tidak dapat mengakses webcam. Pastikan kamu mengizinkan akses kamera " +
        "dan situs diakses lewat HTTPS (atau localhost)."
      );
    }
  }

  function stopCamera() {
    GestureDetector.stop();
    AudioEngine.noteOff("Left");
    AudioEngine.noteOff("Right");
    UIController.setReadout("Left", "—");
    UIController.setReadout("Right", "—");
    UIController.setCursor("Left", 0, false);
    UIController.setCursor("Right", 0, false);
    cameraOn = false;
    UIController.setCameraLive(false);
  }

  // ---- Gesture -> Audio + UI ------------------------------------------------

  function handleHandMove(hand, normalizedHeight) {
    const { noteName, midiNote } = AudioEngine.quantizeYToNote(normalizedHeight);
    const stepCount = AudioEngine.getScaleDegreesCount();
    const stepIndex = Math.floor(
      Math.min(0.999, Math.max(0, normalizedHeight)) * stepCount
    );

    UIController.setCursor(hand, normalizedHeight, !!AudioEngine.getActiveNote(hand));
    UIController.highlightRung(stepIndex);

    // Jika tangan ini sedang menahan nada (pinch aktif), geser pitch secara halus.
    if (AudioEngine.getActiveNote(hand)) {
      const updated = AudioEngine.noteUpdate(hand, normalizedHeight);
      UIController.setReadout(hand, updated);
    }
  }

  function handlePinchStart(hand, normalizedHeight) {
    const note = AudioEngine.noteOn(hand, normalizedHeight);
    UIController.setReadout(hand, note);
    UIController.setCursor(hand, normalizedHeight, true);
  }

  function handlePinchEnd(hand) {
    AudioEngine.noteOff(hand);
    UIController.setReadout(hand, "—");
  }

  function handleHandLost(hand) {
    AudioEngine.noteOff(hand);
    UIController.setReadout(hand, "—");
    UIController.setCursor(hand, 0, false);
  }

  // ---- UI wiring --------------------------------------------------------

  UIController.bind({
    onToggleCamera: () => (cameraOn ? stopCamera() : startCamera()),
    onInstrumentChange: (name) => audioInitialized && AudioEngine.setInstrument(name),
    onScaleChange: (name) => {
      AudioEngine.setScale(name);
      if (audioInitialized) UIController.buildLadder(AudioEngine.getScaleDegreesCount());
    },
    onRootChange: (semitone) => AudioEngine.setRoot(semitone),
    onVolumeChange: (db) => audioInitialized && AudioEngine.setVolumeDb(db),
  });

  // Render ladder kosong sebelum audio context diinisialisasi (default: major, 2 oktaf = 14).
  UIController.buildLadder(14);
})();
