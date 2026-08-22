const GestureDetector = (() => {

  const THUMB_TIP = 4, THUMB_IP = 3, PINKY_MCP = 17, INDEX_MCP = 5, WRIST = 0;
  const COUNT_FINGERS = [
    { name: "index", tip: 8, pip: 6 },
    { name: "middle", tip: 12, pip: 10 },
    { name: "ring", tip: 16, pip: 14 },
    { name: "pinky", tip: 20, pip: 18 },
  ];


  const STABLE_FRAMES = 3;


  const ORIENTATION_SIGN_PALM_IS_POSITIVE = true;

  let videoEl, canvasEl, ctx;
  let hands, camera;
  let running = false;

  function makeFingerState() {
    return { committed: false, pending: false, streak: 0 };
  }
  function makeHandState() {
    return {
      present: false,
      fingers: {
        thumb: makeFingerState(),
        index: makeFingerState(),
        middle: makeFingerState(),
        ring: makeFingerState(),
        pinky: makeFingerState(),
      },
      orientation: { committed: "palm", pending: "palm", streak: 0 },
    };
  }

  let handStates = { Left: makeHandState(), Right: makeHandState() };

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


  function detectRawFingerStates(landmarks) {
    const raw = {};
    for (const f of COUNT_FINGERS) {
    
      raw[f.name] = landmarks[f.tip].y < landmarks[f.pip].y;
    }

    raw.thumb = dist(landmarks[THUMB_TIP], landmarks[PINKY_MCP]) >
                dist(landmarks[THUMB_IP], landmarks[PINKY_MCP]);
    return raw;
  }

 
  function computeIsPalmFacing(landmarks, correctedLabel) {
    const wrist = landmarks[WRIST];
    const indexMcp = landmarks[INDEX_MCP];
    const pinkyMcp = landmarks[PINKY_MCP];
    const v1x = indexMcp.x - wrist.x, v1y = indexMcp.y - wrist.y;
    const v2x = pinkyMcp.x - wrist.x, v2y = pinkyMcp.y - wrist.y;
    const cross = v1x * v2y - v1y * v2x;

    const rawPositive = cross > 0;
    const normalized = correctedLabel === "Left" ? rawPositive : !rawPositive;
    return ORIENTATION_SIGN_PALM_IS_POSITIVE ? normalized : !normalized;
  }

///new debounce
  function updateFingerDebounce(fingerStates, rawStates) {
    const committed = {};
    for (const name of Object.keys(fingerStates)) {
      const fs = fingerStates[name];
      const raw = rawStates[name];
      if (raw === fs.pending) {
        fs.streak++;
      } else {
        fs.pending = raw;
        fs.streak = 1;
      }
      if (fs.streak >= STABLE_FRAMES && fs.committed !== fs.pending) {
        fs.committed = fs.pending;
      }
      committed[name] = fs.committed;
    }
    return committed;
  }

  function updateOrientationDebounce(orientationState, isPalmRaw) {
    const raw = isPalmRaw ? "palm" : "back";
    if (raw === orientationState.pending) {
      orientationState.streak++;
    } else {
      orientationState.pending = raw;
      orientationState.streak = 1;
    }
    if (orientationState.streak >= STABLE_FRAMES && orientationState.committed !== orientationState.pending) {
      orientationState.committed = orientationState.pending;
    }
    return orientationState.committed;
  }

  function isMiddleFingerOnly(committed) {
    return committed.middle && !committed.index && !committed.ring && !committed.pinky;
  }

  function countExtendedFingers(committed) {
    if (isMiddleFingerOnly(committed)) return 0;
    let count = 0;
    for (const f of COUNT_FINGERS) {
      if (committed[f.name]) count++;
    }
    return count;
  }

  function drawConnectorsAndPoints(landmarks, handedness, committed) {
    const color = handedness === "Left" ? "#8b4fc4" : "#29b3a6";

    if (window.drawConnectors) {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "rgba(255,255,255,0.20)", lineWidth: 2 });
    }

    const tipIndices = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
    for (const lm of landmarks) {
      const x = lm.x * canvasEl.width;
      const y = lm.y * canvasEl.height;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fill();
    }

  
    for (const [name, idx] of Object.entries(tipIndices)) {
      const lm = landmarks[idx];
      const x = lm.x * canvasEl.width;
      const y = lm.y * canvasEl.height;
      const isExtended = committed[name];
      ctx.beginPath();
      ctx.arc(x, y, isExtended ? 7 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isExtended ? color : "rgba(255,255,255,0.28)";
      ctx.shadowColor = color;
      ctx.shadowBlur = isExtended ? 9 : 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

 
//============================//
  function drawStatusBadge(landmarks, handedness, count, orientation) {
    const wrist = landmarks[WRIST];
    const x = wrist.x * canvasEl.width;
    const y = wrist.y * canvasEl.height + 24;
    const color = handedness === "Left" ? "#8b4fc4" : "#29b3a6";
    const label = `${count} \u00B7 ${orientation === "palm" ? "TELAPAK" : "PUNGGUNG"}`;


    ctx.save();
    ctx.scale(-1, 1);
    ctx.font = "600 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.fillText(label, -x, y);
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
   
        const rawLabel = results.multiHandedness[i].label; // "Left" | "Right"
        const label = rawLabel === "Left" ? "Right" : "Left";

        seenThisFrame[label] = true;
        const st = handStates[label];
        st.present = true;

        const rawFingerStates = detectRawFingerStates(landmarks);
        const committed = updateFingerDebounce(st.fingers, rawFingerStates);
        const count = countExtendedFingers(committed);

        const isPalmRaw = computeIsPalmFacing(landmarks, label);
        const orientation = updateOrientationDebounce(st.orientation, isPalmRaw);

        const thumbBonus = committed.thumb;

        drawConnectorsAndPoints(landmarks, label, committed);
        drawStatusBadge(landmarks, label, count, orientation);

        callbacks.onHandUpdate(label, count, orientation, thumbBonus, committed, landmarks);
      }
    }


    for (const label of ["Left", "Right"]) {
      const st = handStates[label];
      if (st.present && !seenThisFrame[label]) {
        st.present = false;
        handStates[label] = makeHandState();
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
    handStates = { Left: makeHandState(), Right: makeHandState() };
  }

  return { start, stop };
})();
