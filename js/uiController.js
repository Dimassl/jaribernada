
const UIController = (() => {
  const STEP_COUNT = 6; // 0 (diam) sampai 5 jari

  let els = {};

  function cacheEls() {
    els = {
      toggleCamera: document.getElementById("toggleCamera"),
      toggleCameraLabel: document.getElementById("toggleCameraLabel"),
      scaleSelect: document.getElementById("scaleSelect"),
      rootSelect: document.getElementById("rootSelect"),
      volumeSlider: document.getElementById("volumeSlider"),
      volumeValue: document.getElementById("volumeValue"),
      statusDot: document.getElementById("statusDot"),
      statusText: document.getElementById("statusText"),
      scopeEmpty: document.getElementById("scopeEmpty"),
      leftFingerSteps: document.getElementById("leftFingerSteps"),
      rightFingerSteps: document.getElementById("rightFingerSteps"),
      leftNoteReadout: document.getElementById("leftNoteReadout"),
      rightNoteReadout: document.getElementById("rightNoteReadout"),
    };
  }

  function buildFingerSteps() {
    for (const container of [els.leftFingerSteps, els.rightFingerSteps]) {
      container.innerHTML = "";
      for (let i = 0; i < STEP_COUNT; i++) {
        const step = document.createElement("div");
        step.className = "finger-step";
        step.dataset.index = i;
        container.appendChild(step);
      }
    }
  }

  function setFingerCount(hand, count) {
    const container = hand === "Left" ? els.leftFingerSteps : els.rightFingerSteps;
    if (!container) return;
    const steps = container.querySelectorAll(".finger-step");
    // Nyalakan step 1..count (step 0 = diam / kepalan tangan, tidak pernah menyala).
    steps.forEach((s, i) => s.classList.toggle("on", i > 0 && i <= count));
  }

  function setReadout(hand, text) {
    const el = hand === "Left" ? els.leftNoteReadout : els.rightNoteReadout;
    if (el) el.textContent = text || "—";
  }

  function setCameraLive(isLive) {
    els.toggleCameraLabel.textContent = isLive ? "STOP KAMERA" : "START KAMERA";
    els.toggleCamera.classList.toggle("is-live", isLive);
    els.statusDot.classList.toggle("live", isLive);
    els.statusText.textContent = isLive ? "KAMERA LIVE" : "KAMERA OFF";
    els.scopeEmpty.classList.toggle("hidden", isLive);
  }

  function bind(handlers) {
    cacheEls();
    buildFingerSteps();

    els.toggleCamera.addEventListener("click", handlers.onToggleCamera);

    els.scaleSelect.addEventListener("change", (e) => {
      handlers.onScaleChange(e.target.value);
    });

    els.rootSelect.addEventListener("change", (e) => {
      handlers.onRootChange(parseInt(e.target.value, 10));
    });

    els.volumeSlider.addEventListener("input", (e) => {
      const db = parseInt(e.target.value, 10);
      els.volumeValue.textContent = `${db} dB`;
      handlers.onVolumeChange(db);
    });
  }

  return {
    bind,
    setFingerCount,
    setReadout,
    setCameraLive,
    getEls: () => els,
  };
})();
