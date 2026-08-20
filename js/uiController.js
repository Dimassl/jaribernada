const UIController = (() => {
  const FINGER_ORDER = ["thumb", "index", "middle", "ring", "pinky"];
  const FINGER_LABEL = { thumb: "Ibu Jari", index: "Telunjuk", middle: "Tengah", ring: "Manis", pinky: "Kelingking" };
  const FINGER_WEIGHT = { thumb: null, index: 8, middle: 4, ring: 2, pinky: 1 };

  let els = {};

  function cacheEls() {
    els = {
      toggleCamera: document.getElementById("toggleCamera"),
      toggleCameraLabel: document.getElementById("toggleCameraLabel"),
      toggleCameraIcon: document.getElementById("toggleCameraIcon"),
      scaleSelect: document.getElementById("scaleSelect"),
      rootSelect: document.getElementById("rootSelect"),
      volumeSlider: document.getElementById("volumeSlider"),
      volumeValue: document.getElementById("volumeValue"),
      statusDot: document.getElementById("statusDot"),
      statusText: document.getElementById("statusText"),
      scopeEmpty: document.getElementById("scopeEmpty"),
      leftFingerChip: document.getElementById("leftFingerChip"),
      rightFingerChip: document.getElementById("rightFingerChip"),
      leftNoteReadout: document.getElementById("leftNoteReadout"),
      rightNoteReadout: document.getElementById("rightNoteReadout"),
      comboTableLeft: document.getElementById("comboTableLeft"),
      comboTableRight: document.getElementById("comboTableRight"),
    };
  }

  function buildFingerChip(container) {
    container.innerHTML = "";
    for (const name of FINGER_ORDER) {
      const dot = document.createElement("div");
      dot.className = "finger-dot";
      dot.dataset.finger = name;
      dot.title = FINGER_LABEL[name];
      const label = document.createElement("span");
      label.className = "finger-dot__label";
      label.textContent = FINGER_LABEL[name].slice(0, 1);
      dot.appendChild(label);
      container.appendChild(dot);
    }
  }

  function setFingerChip(hand, committedMap) {
    const container = hand === "Left" ? els.leftFingerChip : els.rightFingerChip;
    if (!container || !committedMap) return;
    for (const name of FINGER_ORDER) {
      const dot = container.querySelector(`[data-finger="${name}"]`);
      if (dot) dot.classList.toggle("on", !!committedMap[name]);
    }
  }

  function setReadout(hand, text) {
    const el = hand === "Left" ? els.leftNoteReadout : els.rightNoteReadout;
    if (el) el.textContent = text || "—";
  }

  function setCameraLive(isLive) {
    els.toggleCameraLabel.textContent = isLive ? "STOP KAMERA" : "START KAMERA";
    els.toggleCameraIcon.textContent = isLive ? "videocam_off" : "videocam";
    els.toggleCamera.classList.toggle("is-live", isLive);
    els.statusDot.classList.toggle("live", isLive);
    els.statusText.textContent = isLive ? "KAMERA LIVE" : "KAMERA OFF";
    els.scopeEmpty.classList.toggle("hidden", isLive);
  }

  function renderComboTable(hand) {
    const table = hand === "Left" ? els.comboTableLeft : els.comboTableRight;
    if (!table) return;
    table.innerHTML = "";

    const head = document.createElement("div");
    head.className = "combo-row combo-row--head";
    head.innerHTML = `
      <span>Nilai</span>
      <span>Telunjuk (8)</span>
      <span>Tengah (4)</span>
      <span>Manis (2)</span>
      <span>Kelingking (1)</span>
      <span>Nada</span>
    `;
    table.appendChild(head);

    for (const value of AudioEngine.COMBO_VALUES) {
      const row = document.createElement("div");
      row.className = "combo-row";
      const bits = {
        index: !!(value & 8),
        middle: !!(value & 4),
        ring: !!(value & 2),
        pinky: !!(value & 1),
      };
      const noteName = AudioEngine.previewNoteName(hand, value, false);

      row.innerHTML = `
        <span class="combo-row__value">${value}</span>
        ${["index", "middle", "ring", "pinky"].map((f) => `
          <span class="combo-row__icon">
            <span class="material-symbols-outlined${bits[f] ? " is-on" : ""}">${bits[f] ? "check_circle" : "radio_button_unchecked"}</span>
          </span>
        `).join("")}
        <span class="combo-row__note">${noteName ?? "—"}</span>
      `;
      table.appendChild(row);
    }
  }

  function refreshComboTables() {
    renderComboTable("Left");
    renderComboTable("Right");
  }

  function bind(handlers) {
    cacheEls();
    buildFingerChip(els.leftFingerChip);
    buildFingerChip(els.rightFingerChip);

    els.toggleCamera.addEventListener("click", handlers.onToggleCamera);

    els.scaleSelect.addEventListener("change", (e) => {
      handlers.onScaleChange(e.target.value);
      refreshComboTables();
    });

    els.rootSelect.addEventListener("change", (e) => {
      handlers.onRootChange(parseInt(e.target.value, 10));
      refreshComboTables();
    });

    els.volumeSlider.addEventListener("input", (e) => {
      const db = parseInt(e.target.value, 10);
      els.volumeValue.textContent = `${db} dB`;
      handlers.onVolumeChange(db);
    });
  }

  return {
    bind,
    setFingerChip,
    setReadout,
    setCameraLive,
    refreshComboTables,
    getEls: () => els,
  };
})();
