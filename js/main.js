/**
 * main.js
 * ------------------------------------------------------------------
 * ------------------------------------------------------------------
 */

(function bootstrap() {
  
  if (window.GeoGestPlayInitialized) {
    console.warn("GeoGestPlay sudah diinisialisasi sebelumnya. Menghentikan duplikasi.");
    return;
  }
  window.GeoGestPlayInitialized = true;

  let cameraOn = false;
  let audioInitialized = false;

  const videoEl = document.getElementById("inputVideo");
  const canvasEl = document.getElementById("overlayCanvas");

  async function ensureAudioReady() {
    if (audioInitialized) return;
    
  
    if (typeof Tone === 'undefined') {
      console.error("Tone.js belum termuat sempurna dari CDN.");
      alert("Komponen Audio (Tone.js) gagal dimuat. Coba refresh halaman (Ctrl + F5).");
      return;
    }

    await Tone.start();          //
    await AudioEngine.init();

    //
    const scaleEl = document.getElementById("scaleSelect");
    const rootEl = document.getElementById("rootSelect");
    const volumeEl = document.getElementById("volumeSlider");

    //
    if (scaleEl) AudioEngine.setScale(scaleEl.value);
    if (rootEl) AudioEngine.setRoot(parseInt(rootEl.value, 10));
    if (volumeEl) AudioEngine.setVolumeDb(parseInt(volumeEl.value, 10));

    audioInitialized = true;
  }

  async function startCamera() {
    await ensureAudioReady();
    try {
      await GestureDetector.start(videoEl, canvasEl, {
        onHandUpdate: handleHandUpdate,
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
    UIController.setFingerCount("Left", 0);
    UIController.setFingerCount("Right", 0);
    cameraOn = false;
    UIController.setCameraLive(false);
  }

  // ---- Gesture -> Audio + UI ------------------------------------------------

  function handleHandUpdate(hand, fingerCount) {
    UIController.setFingerCount(hand, fingerCount);

    const noteName = AudioEngine.noteUpdate(hand, fingerCount);
    UIController.setReadout(hand, noteName);
  }

  function handleHandLost(hand) {
    AudioEngine.noteOff(hand);
    UIController.setReadout(hand, "—");
    UIController.setFingerCount(hand, 0);
  }

  // ---- UI wiring --------------------------------------------------------

  UIController.bind({
    onToggleCamera: () => (cameraOn ? stopCamera() : startCamera()),
    onScaleChange: (name) => AudioEngine.setScale(name),
    onRootChange: (semitone) => AudioEngine.setRoot(semitone),
    onVolumeChange: (db) => audioInitialized && AudioEngine.setVolumeDb(db),
  });
})();
