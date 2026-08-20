
(function bootstrap() {
  let cameraOn = false;
  let audioInitialized = false;

  const videoEl = document.getElementById("inputVideo");
  const canvasEl = document.getElementById("overlayCanvas");

  async function ensureAudioReady() {
    if (audioInitialized) return;
    await Tone.start();         
    await AudioEngine.init();
    AudioEngine.setScale(document.getElementById("scaleSelect").value);
    AudioEngine.setRoot(parseInt(document.getElementById("rootSelect").value, 10));
    AudioEngine.setVolumeDb(parseInt(document.getElementById("volumeSlider").value, 10));
    audioInitialized = true;
  }

  async function startCamera() {
    try {
      await ensureAudioReady();
      await GestureDetector.start(videoEl, canvasEl, {
        onHandUpdate: handleHandUpdate,
        onHandLost: handleHandLost,
      });
      cameraOn = true;
      UIController.setCameraLive(true);
    } catch (err) {
      console.error("Gagal memulai GeoGestPlay:", err);
      alert(
        "Tidak dapat memulai kamera/audio.\n\n" +
        "Penyebab umum:\n" +
        "- Izin webcam ditolak / belum diberikan oleh browser\n" +
        "- Situs tidak diakses lewat HTTPS (atau localhost)\n" +
        "- Koneksi ke CDN Tone.js / MediaPipe terblokir\n\n" +
        "Detail teknis: " + (err && err.message ? err.message : err)
      );
    }
  }

  function stopCamera() {
    GestureDetector.stop();
    AudioEngine.noteOff("Left");
    AudioEngine.noteOff("Right");
    UIController.setReadout("Left", "—");
    UIController.setReadout("Right", "—");
    UIController.setFingerChip("Left", {});
    UIController.setFingerChip("Right", {});
    cameraOn = false;
    UIController.setCameraLive(false);
  }

  // ---- Gesture -> Audio + UI ------------------------------------------------

  function handleHandUpdate(hand, value, thumbBonus, committedMap) {
    UIController.setFingerChip(hand, committedMap);

    const noteName = AudioEngine.noteUpdate(hand, value, thumbBonus);
    UIController.setReadout(hand, noteName);
  }

  function handleHandLost(hand) {
    AudioEngine.noteOff(hand);
    UIController.setReadout(hand, "—");
    UIController.setFingerChip(hand, {});
  }

  // ---- UI wiring --------------------------------------------------------

  UIController.bind({
    onToggleCamera: () => (cameraOn ? stopCamera() : startCamera()),
    onScaleChange: (name) => AudioEngine.setScale(name),
    onRootChange: (semitone) => AudioEngine.setRoot(semitone),
    onVolumeChange: (db) => audioInitialized && AudioEngine.setVolumeDb(db),
  });

  UIController.refreshComboTables();
})();
