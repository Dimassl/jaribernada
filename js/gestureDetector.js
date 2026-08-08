/**
 * gestureDetector.js
 * ------------------------------------------------------------------
 * Melacak tangan lewat webcam menggunakan MediaPipe Hands, menggambar
 * overlay landmark, dan menerjemahkan posisi tangan menjadi event
 * gestur tingkat tinggi:
 *   - onHandMove(handLabel, normalizedHeight)  -> tiap frame tangan terdeteksi
 *   - onPinchStart(handLabel, normalizedHeight) -> ibu jari & telunjuk mendekat
 *   - onPinchEnd(handLabel)                     -> ibu jari & telunjuk menjauh
 *   - onHandLost(handLabel)                     -> tangan hilang dari frame
 * ------------------------------------------------------------------
 */

const GestureDetector = (() => {
  const PINCH_ON_THRESHOLD = 0.055;   // jarak (normalized) di bawah ini = mencubit
  const PINCH_OFF_THRESHOLD = 0.09;   // hysteresis: harus menjauh lebih dari ini utk lepas

  let videoEl, canvasEl, ctx;
  let hands, camera;
  let running = false;

  // status per tangan agar kita tahu transisi pinch on/off & hand lost
  let handStates = {
    Left: { pinched: false, present: false },
    Right: { pinched: false, present: false },
  };

  let callbacks = {
    onHandMove: () => {},
    onPinchStart: () => {},
    onPinchEnd: () => {},
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

  function drawLandmarks(results) {
    ctx.save();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i]?.label || "Right";
        const color = handedness === "Left" ? "#57e7d6" : "#ffb454";

        // MediaPipe global helpers (drawing_utils.js)
        if (window.drawConnectors) {
          drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "rgba(255,255,255,0.25)", lineWidth: 2 });
        }
        if (window.drawLandmarks) {
          drawLandmarks_(landmarks, color);
        }
      }
    }
    ctx.restore();
  }

  // custom landmark drawing to control point styling (renamed to avoid collision
  // with the global `drawLandmarks` function injected by MediaPipe drawing_utils).
  function drawLandmarks_(landmarks, color) {
    for (const lm of landmarks) {
      const x = lm.x * canvasEl.width;
      const y = lm.y * canvasEl.height;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawPinchIndicator(x, y, active, color) {
    const px = x * canvasEl.width;
    const py = y * canvasEl.height;
    ctx.beginPath();
    ctx.arc(px, py, active ? 14 : 9, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = active ? 16 : 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function onResults(results) {
    resizeCanvasToVideo();
    drawLandmarks(results);

    const seenThisFrame = { Left: false, Right: false };

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        // Catatan: MediaPipe melabeli tangan dari sudut pandang kamera (mirrored),
        // sehingga label "Left"/"Right" di sini sudah sesuai persepsi pengguna
        // karena video & canvas di-mirror lewat CSS (scaleX(-1)) dan MediaPipe
        // menganalisis frame asli (belum di-mirror) -> label tetap konsisten.
        const rawLabel = results.multiHandedness[i].label; // "Left" | "Right"
        const label = rawLabel === "Left" ? "Right" : "Left"; // koreksi krn video di-mirror

        seenThisFrame[label] = true;
        handStates[label].present = true;

        const wrist = landmarks[0];
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        // Ketinggian dinormalisasi: 0 = bawah frame, 1 = atas frame (dibalik dari y MediaPipe).
        const normalizedHeight = 1 - Math.min(1, Math.max(0, wrist.y));

        callbacks.onHandMove(label, normalizedHeight, landmarks);

        const pinchDist = dist(thumbTip, indexTip);
        const color = label === "Left" ? "#57e7d6" : "#ffb454";

        if (!handStates[label].pinched && pinchDist < PINCH_ON_THRESHOLD) {
          handStates[label].pinched = true;
          callbacks.onPinchStart(label, normalizedHeight);
        } else if (handStates[label].pinched && pinchDist > PINCH_OFF_THRESHOLD) {
          handStates[label].pinched = false;
          callbacks.onPinchEnd(label);
        }

        drawPinchIndicator(
          (thumbTip.x + indexTip.x) / 2,
          (thumbTip.y + indexTip.y) / 2,
          handStates[label].pinched,
          color
        );
      }
    }

    // Deteksi tangan yang hilang dari frame -> matikan nada terkait.
    for (const label of ["Left", "Right"]) {
      if (handStates[label].present && !seenThisFrame[label]) {
        handStates[label].present = false;
        handStates[label].pinched = false;
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
      Left: { pinched: false, present: false },
      Right: { pinched: false, present: false },
    };
  }

  return { start, stop };
})();
