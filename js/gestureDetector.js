
const GestureDetector = (() => {
  // Landmark index MediaPipe Hands
  const THUMB_TIP = 4, THUMB_IP = 3, PINKY_MCP = 17, WRIST = 0;
  const FINGERS = [
    { name: "index", tip: 8, pip: 6 },
    { name: "middle", tip: 12, pip: 10 },
    { name: "ring", tip: 16, pip: 14 },
    { name: "pinky", tip: 20, pip: 18 },
  ];

  // Debounce: jumlah jari harus stabil selama N frame berturut-turut
  // sebelum dianggap "berubah", supaya nada tidak berkedip-kedip akibat noise.
  const STABLE_FRAMES = 3;

  let videoEl, canvasEl, ctx;
  let hands, camera;
  let running = false;

  let handStates = {
    Left: { present: false, committedCount: 0, pendingCount: 0, pendingStreak: 0 },
    Right: { present: false, committedCount: 0, pendingCount: 0, pendingStreak: 0 },
  };

  let callbacks = {
    onHandUpdate: () => {},
    onHandLost: () => {},
    onResults: () => {},
  };

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function resizeCanvasToVideo() {
    canvasEl.width = videoEl.videoWidth || canvasEl.clientWidth;
    canvasEl.height = videoEl.videoHeight || canvasEl.clientHeight;
  }

  /** Hitung jari yang terentang; mengembalikan {count, extended: {thumb,index,...}} */
  function countExtendedFingers(landmarks) {
    const extended = {};

    // Jari selain jempol: terentang jika ujung jari lebih "tinggi" (y lebih kecil)
    // dibanding sendi tengahnya — berlaku saat tangan diangkat menghadap kamera.
    for (const f of FINGERS) {
      extended[f.name] = landmarks[f.tip].y < landmarks[f.pip].y;
    }

    // Jempol bergerak menyamping, bukan naik-turun -> dicek lewat jarak ke
    // pangkal kelingking (rotation-invariant terhadap orientasi tangan).
    extended.thumb = dist(landmarks[THUMB_TIP], landmarks[PINKY_MCP]) >
                      dist(landmarks[THUMB_IP], landmarks[PINKY_MCP]);

    const count = Object.values(extended).filter(Boolean).length;
    return { count, extended };
  }

  function drawConnectorsAndPoints(landmarks, handedness, extendedMap) {
    const color = handedness === "Left" ? "#9b4fd1" : "#29c4b6";

    if (window.drawConnectors) {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "rgba(255,255,255,0.22)", lineWidth: 2 });
    }

    const tipIndices = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
    for (const lm of landmarks) {
      const x = lm.x * canvasEl.width;
      const y = lm.y * canvasEl.height;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
    }

    // Tandai ujung jari yang terentang lebih besar & bercahaya.
    for (const [name, idx] of Object.entries(tipIndices)) {
      const lm = landmarks[idx];
      const x = lm.x * canvasEl.width;
      const y = lm.y * canvasEl.height;
      const isExtended = extendedMap[name];
      ctx.beginPath();
      ctx.arc(x, y, isExtended ? 8 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isExtended ? color : "rgba(255,255,255,0.3)";
      ctx.shadowColor = color;
      ctx.shadowBlur = isExtended ? 12 : 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawFingerCountBadge(landmarks, handedness, count) {
    const wrist = landmarks[WRIST];
    const x = wrist.x * canvasEl.width;
    const y = wrist.y * canvasEl.height + 26;
    const color = handedness === "Left" ? "#9b4fd1" : "#29c4b6";

    ctx.save();
    ctx.scale(-1, 1); // teks tidak ikut ter-mirror oleh transform CSS pada canvas
    ctx.font = "600 15px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillText(String(count), -x, y);
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function onResults(results) {
    resizeCanvasToVideo();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const seenThisFrame = { Left: false, Right: false };

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        // MediaPipe melabeli tangan dari sudut pandang kamera; video & canvas
        // di-mirror lewat CSS (scaleX(-1)) untuk interaksi yang natural, jadi
        // label perlu dibalik agar sesuai persepsi pengguna di layar.
        const rawLabel = results.multiHandedness[i].label; // "Left" | "Right"
        const label = rawLabel === "Left" ? "Right" : "Left";

        seenThisFrame[label] = true;
        const st = handStates[label];
        st.present = true;

        const { count, extended } = countExtendedFingers(landmarks);

        drawConnectorsAndPoints(landmarks, label, extended);
        drawFingerCountBadge(landmarks, label, count);

        // Debounce sederhana: hanya "commit" perubahan jumlah jari setelah
        // stabil beberapa frame berturut-turut.
        if (count === st.pendingCount) {
          st.pendingStreak++;
        } else {
          st.pendingCount = count;
          st.pendingStreak = 1;
        }
        if (st.pendingStreak >= STABLE_FRAMES && st.committedCount !== st.pendingCount) {
          st.committedCount = st.pendingCount;
        }

        callbacks.onHandUpdate(label, st.committedCount, landmarks);
      }
    }

    // Tangan yang hilang dari frame -> reset & beri tahu agar nada dimatikan.
    for (const label of ["Left", "Right"]) {
      const st = handStates[label];
      if (st.present && !seenThisFrame[label]) {
        st.present = false;
        st.committedCount = 0;
        st.pendingCount = 0;
        st.pendingStreak = 0;
        callbacks.onHandLost(label);
      }
    }

    callbacks.onResults(results);
  }

  async function start(videoElement, canvasElement, userCallbacks) {
    videoEl = videoElement;
    canvasEl = canvasElement;
    ctx = canvasEl.getContext("2d");
    callbacks = { ...callbacks, ...userCallbacks };

    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.6,
    });

    hands.onResults(onResults);

    camera = new Camera(videoEl, {
      onFrame: async () => {
        if (running) await hands.send({ image: videoEl });
      },
      width: 640,
      height: 480,
    });

    await camera.start();
    running = true;
  }

  function stop() {
    running = false;
    if (camera) camera.stop();
    if (videoEl && videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
    if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    handStates = {
      Left: { present: false, committedCount: 0, pendingCount: 0, pendingStreak: 0 },
      Right: { present: false, committedCount: 0, pendingCount: 0, pendingStreak: 0 },
    };
  }

  return { start, stop };
})();
