/**
 * uiController.js
 * ------------------------------------------------------------------
 * Mengurus semua interaksi DOM: dropdown instrumen/tangga nada/nada
 * dasar, slider volume, tombol start/stop kamera, status readout,
 * dan visualisasi "pitch ladder" (elemen signature UI).
 * ------------------------------------------------------------------
 */

const UIController = (() => {
  let els = {};

  function cacheEls() {
    els = {
      toggleCamera: document.getElementById("toggleCamera"),
      toggleCameraLabel: document.getElementById("toggleCameraLabel"),
      instrumentSelect: document.getElementById("instrumentSelect"),
      scaleSelect: document.getElementById("scaleSelect"),
      rootSelect: document.getElementById("rootSelect"),
      volumeSlider: document.getElementById("volumeSlider"),
      volumeValue: document.getElementById("volumeValue"),
      statusDot: document.getElementById("statusDot"),
      statusText: document.getElementById("statusText"),
      scopeEmpty: document.getElementById("scopeEmpty"),
      ladderTrack: document.getElementById("ladderTrack"),
      cursorLeft: document.getElementById("cursorLeft"),
      cursorRight: document.getElementById("cursorRight"),
      leftNoteReadout: document.getElementById("leftNoteReadout"),
      rightNoteReadout: document.getElementById("rightNoteReadout"),
    };
  }

  function buildLadder(stepCount) {
    els.ladderTrack.innerHTML = "";
    for (let i = 0; i < stepCount; i++) {
      const rung = document.createElement("div");
      rung.className = "ladder-rung";
      rung.dataset.index = i;
      els.ladderTrack.appendChild(rung);
    }
  }

  function highlightRung(stepIndex) {
    const rungs = els.ladderTrack.querySelectorAll(".ladder-rung");
    rungs.forEach((r) => r.classList.remove("on"));
    if (stepIndex >= 0 && stepIndex < rungs.length) {
      rungs[stepIndex].classList.add("on");
    }
  }

  function setCursor(hand, normalizedHeight, active) {
    const el = hand === "Left" ? els.cursorLeft : els.cursorRight;
    if (!el) return;
    el.style.top = `${(1 - normalizedHeight) * 100}%`;
    el.classList.toggle("active", !!active);
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

    els.toggleCamera.addEventListener("click", handlers.onToggleCamera);

    els.instrumentSelect.addEventListener("change", (e) => {
      handlers.onInstrumentChange(e.target.value);
    });

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
    buildLadder,
    highlightRung,
    setCursor,
    setReadout,
    setCameraLive,
    getEls: () => els,
  };
})();
