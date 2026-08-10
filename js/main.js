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

    // Mengambil elemen secara aman dengan defensive check
    const scaleEl = document.getElementById("scaleSelect");
    const rootEl = document.getElementById("rootSelect");
    const volumeEl = document.getElementById("volumeSlider");

    // Hanya mengambil value jika elemen tersebut sudah siap dan ter-render di halaman
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
