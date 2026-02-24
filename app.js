const PHOTO_RATIO = 35 / 45;
const OUTPUT_WIDTH = 413;
const OUTPUT_HEIGHT = 531;
const SLIDER_MIN = 35;
const SLIDER_MAX = 100;
const FRAME_SCALE_STEP = 0.1;
const WHEEL_SCALE_STEP = 0.5;
const MAX_FINE_ROTATION_DEG = 5;
const JPEG_MAX_QUALITY = 1;
const JPEG_MIN_QUALITY = 0.4;
const JPEG_SEARCH_STEPS = 12;
const ONLINE_MAX_BYTES = 500 * 1024;
const PASSPORT_PHOTO_HEIGHT_CM = 4.5;
const TOP_MARGIN_CM = 0.2;
const HEAD_LENGTH_CM = 3.2;
const GUIDE_HEAD_TOP_RATIO = TOP_MARGIN_CM / PASSPORT_PHOTO_HEIGHT_CM;
const GUIDE_HEAD_LENGTH_RATIO = HEAD_LENGTH_CM / PASSPORT_PHOTO_HEIGHT_CM;
const EXPORT_BUTTON_LABEL = "✨ 결과 만들기";
const VIEW_ORDER = ["edit", "result", "info"];
const SWIPE_MIN_DISTANCE = 52;
const SWIPE_MAX_VERTICAL_DRIFT = 42;

const ui = {
  photoInput: document.getElementById("photoInput"),
  dropzone: document.getElementById("dropzone"),
  uploadSummary: document.getElementById("uploadSummary"),
  uploadThumb: document.getElementById("uploadThumb"),
  uploadName: document.getElementById("uploadName"),
  changePhotoBtn: document.getElementById("changePhotoBtn"),
  loadDemoBtn: document.getElementById("loadDemoBtn"),
  viewEditBtn: document.getElementById("viewEditBtn"),
  viewResultBtn: document.getElementById("viewResultBtn"),
  viewInfoBtn: document.getElementById("viewInfoBtn"),
  workspace: document.getElementById("workspace"),
  workspaceTrack: document.getElementById("workspaceTrack"),
  editView: document.getElementById("editView"),
  resultView: document.getElementById("resultView"),
  infoView: document.getElementById("infoView"),
  frameScale: document.getElementById("frameScale"),
  frameScaleValue: document.getElementById("frameScaleValue"),
  rotateLeftBtn: document.getElementById("rotateLeftBtn"),
  rotateRightBtn: document.getElementById("rotateRightBtn"),
  rotationRange: document.getElementById("rotationRange"),
  rotationValue: document.getElementById("rotationValue"),
  tiltValue: document.getElementById("tiltValue"),
  resetRotationBtn: document.getElementById("resetRotationBtn"),
  showGuides: document.getElementById("showGuides"),
  centerFrameBtn: document.getElementById("centerFrameBtn"),
  exportBtn: document.getElementById("exportBtn"),
  statusMessage: document.getElementById("statusMessage"),
  step2LockNote: document.getElementById("step2LockNote"),
  editorCanvasWrap: document.getElementById("editorCanvasWrap"),
  editorCanvas: document.getElementById("editorCanvas"),
  outputCanvas: document.getElementById("outputCanvas"),
  fileInfo: document.getElementById("fileInfo"),
  downloadLink: document.getElementById("downloadLink"),
  processingOverlay: document.getElementById("processingOverlay"),
  step1Card: document.getElementById("step1Card"),
  step2Card: document.getElementById("step2Card"),
  step3Card: document.getElementById("step3Card"),
  adjustControls: Array.from(document.querySelectorAll("[data-adjust-control]")),
};

const editorCtx = ui.editorCanvas?.getContext("2d") || null;
const outputCtx = ui.outputCanvas?.getContext("2d") || null;

const state = {
  image: null,
  imageBounds: { x: 0, y: 0, w: 0, h: 0 },
  fitScale: 1,
  crop: { x: 0, y: 0, w: 0, h: 0 },
  cropMinH: 0,
  cropMaxH: 0,
  dragging: false,
  dragStartPoint: { x: 0, y: 0 },
  dragStartCrop: { x: 0, y: 0 },
  dpr: window.devicePixelRatio || 1,
  baseRotationDeg: 0,
  fineRotationDeg: 0,
  rotatedSource: null,
  rotatedWidth: 0,
  rotatedHeight: 0,
  showGuides: true,
  downloadUrl: null,
  objectUrl: null,
  currentStep: 1,
  currentView: "edit",
  outputMode: "cropped",
  exporting: false,
  lastExportError: "",
  layoutObserver: null,
  swipeStartX: 0,
  swipeStartY: 0,
  swiping: false,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function toSignedAngle(degrees) {
  let normalized = normalizeAngle(degrees);
  if (normalized > 180) normalized -= 360;
  return normalized;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function getCanvasCssSize() {
  return {
    w: ui.editorCanvas.width / state.dpr,
    h: ui.editorCanvas.height / state.dpr,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function normalizeFrameScaleValue(value) {
  const numeric = Number.isFinite(value) ? value : SLIDER_MIN;
  const stepped = SLIDER_MIN + Math.round((numeric - SLIDER_MIN) / FRAME_SCALE_STEP) * FRAME_SCALE_STEP;
  const clamped = clamp(stepped, SLIDER_MIN, SLIDER_MAX);
  return Number(clamped.toFixed(1));
}

function updateStatus(message, type = "info") {
  if (!ui.statusMessage) return;
  ui.statusMessage.textContent = message || "";
  ui.statusMessage.classList.remove("success", "error");
  if (type === "success") ui.statusMessage.classList.add("success");
  if (type === "error") ui.statusMessage.classList.add("error");
}

function setAdjustControlsEnabled(enabled) {
  for (const control of ui.adjustControls) {
    if (control instanceof HTMLDetailsElement) {
      control.classList.toggle("is-disabled", !enabled);
      if (!enabled) control.open = false;
      continue;
    }

    if ("disabled" in control) {
      control.disabled = !enabled;
    }
  }
}

function applyStateClass(node, stepIndex) {
  if (!node) return;
  node.classList.toggle("is-active", state.currentStep === stepIndex);
  node.classList.toggle("is-done", state.currentStep > stepIndex);
  node.classList.toggle("is-locked", state.currentStep < stepIndex);
}

function setActiveView(view) {
  const next = view === "result" || view === "info" ? view : "edit";
  state.currentView = next;
  const activeIndex = VIEW_ORDER.indexOf(next);
  const trackIndex = activeIndex >= 0 ? activeIndex : 0;

  if (ui.workspaceTrack) {
    ui.workspaceTrack.style.setProperty("--view-index", String(trackIndex));
  }
  if (ui.workspace) {
    ui.workspace.setAttribute("data-view", next);
  }

  if (ui.editView) {
    ui.editView.classList.toggle("is-active", next === "edit");
    ui.editView.setAttribute("aria-hidden", next === "edit" ? "false" : "true");
  }
  if (ui.resultView) {
    ui.resultView.classList.toggle("is-active", next === "result");
    ui.resultView.setAttribute("aria-hidden", next === "result" ? "false" : "true");
  }
  if (ui.infoView) {
    ui.infoView.classList.toggle("is-active", next === "info");
    ui.infoView.setAttribute("aria-hidden", next === "info" ? "false" : "true");
  }

  if (ui.viewEditBtn) ui.viewEditBtn.classList.toggle("is-active", next === "edit");
  if (ui.viewResultBtn) ui.viewResultBtn.classList.toggle("is-active", next === "result");
  if (ui.viewInfoBtn) ui.viewInfoBtn.classList.toggle("is-active", next === "info");

  if (next === "edit") {
    window.setTimeout(syncCanvasSize, 0);
  }
}

function moveViewByOffset(offset) {
  const currentIndex = VIEW_ORDER.indexOf(state.currentView);
  if (currentIndex < 0) return;
  const nextIndex = clamp(currentIndex + offset, 0, VIEW_ORDER.length - 1);
  if (nextIndex === currentIndex) return;
  setActiveView(VIEW_ORDER[nextIndex]);
}

function shouldIgnoreSwipeTarget(target) {
  if (!(target instanceof Element)) return true;

  return Boolean(target.closest("input, button, a, label, canvas, .dropzone, [data-adjust-control]"));
}

function bindSwipeNavigation() {
  if (!ui.workspace) return;

  ui.workspace.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) {
        state.swiping = false;
        return;
      }

      if (shouldIgnoreSwipeTarget(event.target)) {
        state.swiping = false;
        return;
      }

      const touch = event.touches[0];
      state.swipeStartX = touch.clientX;
      state.swipeStartY = touch.clientY;
      state.swiping = true;
    },
    { passive: true },
  );

  ui.workspace.addEventListener(
    "touchend",
    (event) => {
      if (!state.swiping || event.changedTouches.length === 0) {
        state.swiping = false;
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - state.swipeStartX;
      const deltaY = touch.clientY - state.swipeStartY;
      state.swiping = false;

      if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE) return;
      if (Math.abs(deltaY) > SWIPE_MAX_VERTICAL_DRIFT) return;

      if (deltaX < 0) {
        moveViewByOffset(1);
      } else {
        moveViewByOffset(-1);
      }
    },
    { passive: true },
  );

  ui.workspace.addEventListener(
    "touchcancel",
    () => {
      state.swiping = false;
    },
    { passive: true },
  );
}

function bindLayoutObserver() {
  if (typeof ResizeObserver !== "function" || !ui.editorCanvasWrap) return;

  const observer = new ResizeObserver(() => {
    if (state.currentView !== "edit") return;
    syncCanvasSize();
  });

  observer.observe(ui.editorCanvasWrap);
  if (ui.workspace) observer.observe(ui.workspace);
  state.layoutObserver = observer;
}

function setStep(step) {
  state.currentStep = clamp(step, 1, 3);

  applyStateClass(ui.step1Card, 1);
  applyStateClass(ui.step2Card, 2);
  applyStateClass(ui.step3Card, 3);

  ui.step2Card.setAttribute("aria-disabled", state.currentStep < 2 ? "true" : "false");
  ui.step3Card.setAttribute("aria-disabled", state.currentStep < 3 ? "true" : "false");

  ui.step2LockNote.hidden = state.currentStep >= 2;

  setAdjustControlsEnabled(state.currentStep >= 2 && !state.exporting);
}

function clearDownloadLink() {
  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
  }

  ui.downloadLink.classList.remove("is-visible");
  ui.downloadLink.removeAttribute("href");
}

function markResultDirty() {
  if (!state.image) return;
  if (!state.downloadUrl && state.currentStep < 3) return;

  state.outputMode = "cropped";
  clearDownloadLink();
  ui.fileInfo.textContent = "생성 전";

  if (state.currentStep === 3) {
    setStep(2);
  }
}

function updateFrameScaleLabel() {
  const value = normalizeFrameScaleValue(Number(ui.frameScale.value));
  ui.frameScale.value = value.toFixed(1);
  ui.frameScaleValue.textContent = `${value.toFixed(1)}%`;
}

function getTotalRotationDeg() {
  return state.baseRotationDeg + state.fineRotationDeg;
}

function updateRotationLabel() {
  const total = toSignedAngle(getTotalRotationDeg());
  ui.rotationValue.textContent = `${total.toFixed(1)}°`;
  ui.tiltValue.textContent = `${state.fineRotationDeg.toFixed(1)}°`;
}

function rebuildRotatedSource() {
  if (!state.image) {
    state.rotatedSource = null;
    state.rotatedWidth = 0;
    state.rotatedHeight = 0;
    return;
  }

  const degree = toSignedAngle(getTotalRotationDeg());
  const radian = toRadians(degree);

  if (Math.abs(radian) < 0.00001) {
    state.rotatedSource = state.image;
    state.rotatedWidth = state.image.naturalWidth;
    state.rotatedHeight = state.image.naturalHeight;
    return;
  }

  const sourceW = state.image.naturalWidth;
  const sourceH = state.image.naturalHeight;
  const cosAbs = Math.abs(Math.cos(radian));
  const sinAbs = Math.abs(Math.sin(radian));

  const rotatedW = Math.ceil(sourceW * cosAbs + sourceH * sinAbs);
  const rotatedH = Math.ceil(sourceW * sinAbs + sourceH * cosAbs);

  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = rotatedW;
  rotatedCanvas.height = rotatedH;

  const rotatedCtx = rotatedCanvas.getContext("2d");
  if (!rotatedCtx) {
    state.rotatedSource = state.image;
    state.rotatedWidth = sourceW;
    state.rotatedHeight = sourceH;
    return;
  }

  rotatedCtx.fillStyle = "#ffffff";
  rotatedCtx.fillRect(0, 0, rotatedW, rotatedH);
  rotatedCtx.translate(rotatedW / 2, rotatedH / 2);
  rotatedCtx.rotate(radian);
  rotatedCtx.drawImage(state.image, -sourceW / 2, -sourceH / 2, sourceW, sourceH);

  state.rotatedSource = rotatedCanvas;
  state.rotatedWidth = rotatedW;
  state.rotatedHeight = rotatedH;
}

function applyRotation() {
  updateRotationLabel();

  if (!state.image) return;

  markResultDirty();
  rebuildRotatedSource();
  updateImageBounds();
  ensureCropInsideBounds();
  drawEditor();
}

function setFineRotation(degree) {
  const parsed = Number(degree);
  const next = clamp(
    Number.isFinite(parsed) ? parsed : 0,
    -MAX_FINE_ROTATION_DEG,
    MAX_FINE_ROTATION_DEG,
  );

  state.fineRotationDeg = next;
  ui.rotationRange.value = next.toFixed(1);
  applyRotation();
}

function setBaseRotation(degree) {
  const normalized = normalizeAngle(Number(degree) || 0);
  const snapped = [0, 90, 180, 270].reduce((closest, candidate) => {
    if (Math.abs(candidate - normalized) < Math.abs(closest - normalized)) {
      return candidate;
    }
    return closest;
  }, 0);

  state.baseRotationDeg = snapped;
  applyRotation();
}

function syncCanvasSize() {
  if (state.currentView !== "edit") {
    return;
  }

  const wrapWidth = Math.round(ui.editorCanvasWrap?.clientWidth || ui.editorCanvas.clientWidth || 320);
  const width = Math.max(220, wrapWidth);
  const ratioHeight = Math.max(180, Math.round(width * 0.76));
  const viewportBasedMax = Math.max(360, Math.round(window.innerHeight * 0.68));
  const height = clamp(ratioHeight, 180, viewportBasedMax);

  state.dpr = window.devicePixelRatio || 1;
  ui.editorCanvas.style.height = `${height}px`;
  ui.editorCanvas.width = Math.round(width * state.dpr);
  ui.editorCanvas.height = Math.round(height * state.dpr);
  editorCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  if (!state.image) {
    drawEmptyEditor();
    drawOutputPreview();
    return;
  }

  updateImageBounds();
  ensureCropInsideBounds();
  drawEditor();
}

function updateImageBounds() {
  if (!state.image || !state.rotatedSource || !state.rotatedWidth || !state.rotatedHeight) return;

  const { w: canvasW, h: canvasH } = getCanvasCssSize();
  state.fitScale = Math.min(canvasW / state.rotatedWidth, canvasH / state.rotatedHeight);

  const drawW = state.rotatedWidth * state.fitScale;
  const drawH = state.rotatedHeight * state.fitScale;

  state.imageBounds = {
    x: (canvasW - drawW) / 2,
    y: (canvasH - drawH) / 2,
    w: drawW,
    h: drawH,
  };

  const maxByHeightW = state.imageBounds.h * PHOTO_RATIO;
  if (maxByHeightW <= state.imageBounds.w) {
    state.cropMaxH = state.imageBounds.h;
  } else {
    state.cropMaxH = state.imageBounds.w / PHOTO_RATIO;
  }

  state.cropMinH = Math.max(110, state.cropMaxH * 0.35);
  if (state.cropMinH > state.cropMaxH) {
    state.cropMinH = state.cropMaxH * 0.6;
  }
}

function sliderValueToHeight() {
  const value = normalizeFrameScaleValue(Number(ui.frameScale.value));
  const t = (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
  return state.cropMinH + t * (state.cropMaxH - state.cropMinH);
}

function heightToSliderValue(height) {
  if (state.cropMaxH === state.cropMinH) return SLIDER_MIN;
  const t = (height - state.cropMinH) / (state.cropMaxH - state.cropMinH);
  const raw = SLIDER_MIN + t * (SLIDER_MAX - SLIDER_MIN);
  return normalizeFrameScaleValue(raw);
}

function initCropFromSlider() {
  if (!state.image) return;

  const h = clamp(sliderValueToHeight(), state.cropMinH, state.cropMaxH);
  const w = h * PHOTO_RATIO;
  const x = state.imageBounds.x + (state.imageBounds.w - w) / 2;
  const y = state.imageBounds.y + (state.imageBounds.h - h) / 2;

  state.crop = { x, y, w, h };
}

function ensureCropInsideBounds() {
  if (!state.image || !state.crop.w || !state.crop.h) {
    initCropFromSlider();
    return;
  }

  const h = clamp(state.crop.h, state.cropMinH, state.cropMaxH);
  const w = h * PHOTO_RATIO;
  const bounds = state.imageBounds;

  let x = state.crop.x;
  let y = state.crop.y;

  x = clamp(x, bounds.x, bounds.x + bounds.w - w);
  y = clamp(y, bounds.y, bounds.y + bounds.h - h);

  state.crop = { x, y, w, h };
  ui.frameScale.value = heightToSliderValue(h).toFixed(1);
  updateFrameScaleLabel();
}

function resizeCrop(newHeight, anchorX, anchorY) {
  if (!state.image) return;

  const h = clamp(newHeight, state.cropMinH, state.cropMaxH);
  const w = h * PHOTO_RATIO;

  let x = anchorX - w / 2;
  let y = anchorY - h / 2;

  const bounds = state.imageBounds;
  x = clamp(x, bounds.x, bounds.x + bounds.w - w);
  y = clamp(y, bounds.y, bounds.y + bounds.h - h);

  state.crop = { x, y, w, h };
  ui.frameScale.value = heightToSliderValue(h).toFixed(1);
  updateFrameScaleLabel();
}

function drawPreviewPlaceholder(ctx, title, subtitle) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.strokeStyle = "#d1dae8";
  ctx.strokeRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  ctx.fillStyle = "#5d6d84";
  ctx.textAlign = "center";
  ctx.font = "700 20px 'Noto Sans KR', sans-serif";
  ctx.fillText(title, OUTPUT_WIDTH / 2, OUTPUT_HEIGHT / 2 - 12);
  ctx.font = "500 14px 'Noto Sans KR', sans-serif";
  ctx.fillText(subtitle, OUTPUT_WIDTH / 2, OUTPUT_HEIGHT / 2 + 16);
}

function drawEmptyEditor() {
  const { w, h } = getCanvasCssSize();
  editorCtx.clearRect(0, 0, w, h);

  const gradient = editorCtx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#edf4ff");
  gradient.addColorStop(1, "#e8eef9");
  editorCtx.fillStyle = gradient;
  editorCtx.fillRect(0, 0, w, h);

  editorCtx.fillStyle = "#52627b";
  editorCtx.textAlign = "center";
  editorCtx.font = "700 17px 'Noto Sans KR', sans-serif";
  editorCtx.fillText("업로드 후 프레임을 드래그해 위치를 맞춰주세요", w / 2, h / 2 - 8);
  editorCtx.font = "500 13px 'Noto Sans KR', sans-serif";
  editorCtx.fillText("비율 고정: 3.5 x 4.5", w / 2, h / 2 + 18);
}

function drawGuideLine(y, color) {
  const c = state.crop;
  editorCtx.save();
  editorCtx.setLineDash([6, 5]);
  editorCtx.lineWidth = 1.2;
  editorCtx.strokeStyle = color;
  editorCtx.beginPath();
  editorCtx.moveTo(c.x, y);
  editorCtx.lineTo(c.x + c.w, y);
  editorCtx.stroke();
  editorCtx.restore();
}

function drawGuideLabel(y, text, color, side = "left") {
  const c = state.crop;
  const { w: canvasW, h: canvasH } = getCanvasCssSize();
  editorCtx.save();
  editorCtx.font = "700 11px 'Noto Sans KR', sans-serif";
  editorCtx.textAlign = "left";
  editorCtx.textBaseline = "middle";

  const padX = 7;
  const boxH = 18;
  const boxW = Math.ceil(editorCtx.measureText(text).width + padX * 2);
  const gap = 8;
  const edgePad = 6;
  let boxX = c.x - gap - boxW;

  if (side === "right") {
    boxX = c.x + c.w + gap;
    if (boxX + boxW > canvasW - edgePad) {
      boxX = Math.max(edgePad, c.x - gap - boxW);
    }
  } else if (boxX < edgePad) {
    boxX = Math.min(canvasW - boxW - edgePad, c.x + c.w + gap);
  }

  const boxY = clamp(y - boxH / 2, edgePad, canvasH - boxH - edgePad);

  editorCtx.fillStyle = "rgba(18, 29, 45, 0.82)";
  editorCtx.fillRect(boxX, boxY, boxW, boxH);
  editorCtx.strokeStyle = color;
  editorCtx.lineWidth = 1;
  editorCtx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

  editorCtx.fillStyle = "#ffffff";
  editorCtx.fillText(text, boxX + padX, boxY + boxH / 2 + 0.5);
  editorCtx.restore();
}

function drawGuides() {
  const c = state.crop;

  editorCtx.save();
  editorCtx.beginPath();
  editorCtx.rect(c.x, c.y, c.w, c.h);
  editorCtx.clip();

  editorCtx.strokeStyle = "rgba(158, 220, 236, 0.95)";
  editorCtx.setLineDash([4, 4]);
  editorCtx.beginPath();
  editorCtx.moveTo(c.x + c.w / 2, c.y);
  editorCtx.lineTo(c.x + c.w / 2, c.y + c.h);
  editorCtx.stroke();

  const headTop = c.y + c.h * GUIDE_HEAD_TOP_RATIO;
  const chinLine = headTop + c.h * GUIDE_HEAD_LENGTH_RATIO;

  drawGuideLine(headTop, "#8dd9aa");
  drawGuideLine(chinLine, "#ff9b8e");

  editorCtx.fillStyle = "rgba(141, 217, 170, 0.08)";
  editorCtx.fillRect(c.x + 1, c.y + 1, c.w - 2, Math.max(0, headTop - c.y));

  editorCtx.fillStyle = "rgba(255, 155, 142, 0.07)";
  editorCtx.fillRect(c.x + 1, chinLine, c.w - 2, Math.max(0, c.y + c.h - chinLine));

  editorCtx.restore();

  const { w: canvasW } = getCanvasCssSize();
  const leftSpace = c.x;
  const rightSpace = canvasW - (c.x + c.w);
  const labelSide = leftSpace >= rightSpace ? "left" : "right";

  drawGuideLabel(headTop, "정수리선", "#8dd9aa", labelSide);
  drawGuideLabel(chinLine, "턱끝선", "#ff9b8e", labelSide);
  drawGuideLabel(c.y + 14, "중심선", "#9edcec", labelSide);
}

function drawEditor() {
  if (!state.image) {
    drawEmptyEditor();
    return;
  }

  const { w, h } = getCanvasCssSize();
  editorCtx.clearRect(0, 0, w, h);

  editorCtx.fillStyle = "#f4f8ff";
  editorCtx.fillRect(0, 0, w, h);

  editorCtx.drawImage(
    state.rotatedSource,
    state.imageBounds.x,
    state.imageBounds.y,
    state.imageBounds.w,
    state.imageBounds.h,
  );

  editorCtx.fillStyle = "rgba(15, 22, 33, 0.52)";
  editorCtx.beginPath();
  editorCtx.rect(0, 0, w, h);
  editorCtx.rect(state.crop.x, state.crop.y, state.crop.w, state.crop.h);
  editorCtx.fill("evenodd");

  editorCtx.strokeStyle = "#ffffff";
  editorCtx.lineWidth = 2;
  editorCtx.strokeRect(state.crop.x, state.crop.y, state.crop.w, state.crop.h);

  const cornerSize = 15;
  editorCtx.strokeStyle = "#d4f3e2";
  editorCtx.lineWidth = 1;

  function drawCorner(x, y, xDir, yDir) {
    editorCtx.beginPath();
    editorCtx.moveTo(x, y);
    editorCtx.lineTo(x + cornerSize * xDir, y);
    editorCtx.stroke();

    editorCtx.beginPath();
    editorCtx.moveTo(x, y);
    editorCtx.lineTo(x, y + cornerSize * yDir);
    editorCtx.stroke();
  }

  const c = state.crop;
  drawCorner(c.x, c.y, 1, 1);
  drawCorner(c.x + c.w, c.y, -1, 1);
  drawCorner(c.x, c.y + c.h, 1, -1);
  drawCorner(c.x + c.w, c.y + c.h, -1, -1);

  if (state.showGuides) {
    drawGuides();
  }

  drawOutputPreview();
}

function getSourceCropRect() {
  if (
    !state.image ||
    !state.rotatedSource ||
    !state.rotatedWidth ||
    !state.rotatedHeight ||
    !state.crop.w ||
    !state.crop.h
  ) {
    return null;
  }

  const rawX = (state.crop.x - state.imageBounds.x) / state.fitScale;
  const rawY = (state.crop.y - state.imageBounds.y) / state.fitScale;
  const rawW = state.crop.w / state.fitScale;
  const rawH = state.crop.h / state.fitScale;

  let sourceW = Math.max(1, Math.round(rawW));
  let sourceH = Math.max(1, Math.round(rawH));
  sourceW = Math.min(sourceW, state.rotatedWidth);
  sourceH = Math.min(sourceH, state.rotatedHeight);

  const maxX = Math.max(0, state.rotatedWidth - sourceW);
  const maxY = Math.max(0, state.rotatedHeight - sourceH);
  const sourceX = clamp(Math.round(rawX), 0, maxX);
  const sourceY = clamp(Math.round(rawY), 0, maxY);

  return { sourceX, sourceY, sourceW, sourceH };
}

function drawOutputPreview() {
  if (!outputCtx) return;
  if (state.outputMode === "original" && state.image) {
    drawOriginalPreviewToOutput();
    return;
  }

  const sourceRect = getSourceCropRect();
  if (!sourceRect || !state.rotatedSource) {
    drawPreviewPlaceholder(outputCtx, "After", "결과 미리보기");
    return;
  }

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  outputCtx.imageSmoothingEnabled = true;
  outputCtx.imageSmoothingQuality = "high";
  outputCtx.drawImage(
    state.rotatedSource,
    sourceRect.sourceX,
    sourceRect.sourceY,
    sourceRect.sourceW,
    sourceRect.sourceH,
    0,
    0,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
  );
}

function toCanvasPoint(event) {
  const rect = ui.editorCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function isPointInCrop(point) {
  return (
    point.x >= state.crop.x &&
    point.x <= state.crop.x + state.crop.w &&
    point.y >= state.crop.y &&
    point.y <= state.crop.y + state.crop.h
  );
}

function setCanvasCursor(event) {
  if (!state.image) {
    ui.editorCanvas.style.cursor = "default";
    return;
  }

  const point = toCanvasPoint(event);
  ui.editorCanvas.style.cursor = isPointInCrop(point) ? "grab" : "default";
}

function onPointerDown(event) {
  if (!state.image) return;
  const point = toCanvasPoint(event);

  if (!isPointInCrop(point)) return;

  state.dragging = true;
  state.dragStartPoint = point;
  state.dragStartCrop = { x: state.crop.x, y: state.crop.y };
  ui.editorCanvas.style.cursor = "grabbing";
  try {
    if (typeof ui.editorCanvas.setPointerCapture === "function") {
      ui.editorCanvas.setPointerCapture(event.pointerId);
    }
  } catch (error) {
    // Some mobile browsers can throw for pointer capture; dragging still works without it.
  }
}

function onPointerMove(event) {
  if (!state.image) return;

  if (!state.dragging) {
    setCanvasCursor(event);
    return;
  }

  const point = toCanvasPoint(event);
  const deltaX = point.x - state.dragStartPoint.x;
  const deltaY = point.y - state.dragStartPoint.y;

  const bounds = state.imageBounds;
  const nextX = clamp(state.dragStartCrop.x + deltaX, bounds.x, bounds.x + bounds.w - state.crop.w);
  const nextY = clamp(state.dragStartCrop.y + deltaY, bounds.y, bounds.y + bounds.h - state.crop.h);

  state.crop.x = nextX;
  state.crop.y = nextY;
  markResultDirty();
  drawEditor();
}

function onPointerUp(event) {
  if (!state.image) return;

  if (!state.dragging) return;

  state.dragging = false;
  ui.editorCanvas.style.cursor = "grab";
  try {
    if (
      typeof ui.editorCanvas.hasPointerCapture === "function" &&
      typeof ui.editorCanvas.releasePointerCapture === "function" &&
      ui.editorCanvas.hasPointerCapture(event.pointerId)
    ) {
      ui.editorCanvas.releasePointerCapture(event.pointerId);
    }
  } catch (error) {
    // Ignore pointer-capture release errors on mobile browsers.
  }
}

function onWheel(event) {
  if (!state.image) return;

  event.preventDefault();

  const direction = event.deltaY < 0 ? 1 : -1;
  const currentScale = normalizeFrameScaleValue(Number(ui.frameScale.value));
  const nextScale = normalizeFrameScaleValue(currentScale + direction * WHEEL_SCALE_STEP);

  if (nextScale === currentScale) return;

  ui.frameScale.value = nextScale.toFixed(1);
  updateFrameScaleLabel();

  const anchorX = state.crop.x + state.crop.w / 2;
  const anchorY = state.crop.y + state.crop.h / 2;
  markResultDirty();
  resizeCrop(sliderValueToHeight(), anchorX, anchorY);
  drawEditor();
}

function dataUrlToBlob(dataUrl) {
  const [header, body] = dataUrl.split(",");
  if (!header || !body) return null;

  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || "image/jpeg";
  const binary = atob(body);
  const len = binary.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

function describeExportFailure() {
  const reason = state.lastExportError || "";
  if (reason.includes("SecurityError")) {
    return "현재 환경 제한으로 편집 결과 저장이 불가해 원본 다운로드로 전환합니다.";
  }

  if (reason.includes("EMPTY_DATA_URL") || reason.includes("EMPTY_BLOB")) {
    return "브라우저가 결과 이미지를 인코딩하지 못했습니다. 프레임을 조금 줄이거나 브라우저를 새로고침 후 다시 시도하세요.";
  }

  return "결과 생성에 실패했습니다. 다시 시도하세요.";
}

function isSecurityExportError() {
  const reason = state.lastExportError || "";
  return reason.includes("SecurityError");
}

function enableOriginalDownloadFallback() {
  if (!state.image) return false;
  const sourceUrl = state.objectUrl || state.image.src;
  if (!sourceUrl) return false;

  state.outputMode = "original";
  drawOutputPreview();
  clearDownloadLink();
  ui.downloadLink.href = sourceUrl;
  ui.downloadLink.download = "passport-photo-original.jpg";
  ui.downloadLink.classList.add("is-visible");
  ui.fileInfo.textContent = "원본 다운로드 (편집 결과 저장 제한)";
  setStep(3);
  setActiveView("result");
  return true;
}

function canvasToBlob(canvas, mimeType = "image/jpeg", quality) {
  return new Promise((resolve) => {
    state.lastExportError = "";
    let settled = false;
    const done = (blob) => {
      if (settled) return;
      settled = true;
      resolve(blob);
    };

    const fallback = () => {
      try {
        const q = typeof quality === "number" ? quality : 0.92;
        const dataUrl = canvas.toDataURL(mimeType, q);
        const fallbackBlob = dataUrlToBlob(dataUrl);
        if (!fallbackBlob) {
          state.lastExportError = "EMPTY_DATA_URL";
          done(null);
          return;
        }

        done(fallbackBlob);
      } catch (error) {
        const errorName = error && typeof error === "object" && "name" in error ? String(error.name) : "UNKNOWN";
        state.lastExportError = `TO_DATA_URL:${errorName}`;
        done(null);
      }
    };

    const timeoutId = window.setTimeout(() => {
      fallback();
    }, 1800);

    try {
      if (typeof canvas.toBlob === "function") {
        if (typeof quality === "number") {
          canvas.toBlob((blob) => {
            window.clearTimeout(timeoutId);
            if (blob) {
              done(blob);
              return;
            }

            state.lastExportError = "EMPTY_BLOB";
            fallback();
          }, mimeType, quality);
          return;
        }

        canvas.toBlob((blob) => {
          window.clearTimeout(timeoutId);
          if (blob) {
            done(blob);
            return;
          }

          state.lastExportError = "EMPTY_BLOB";
          fallback();
        }, mimeType);
        return;
      }
    } catch (error) {
      window.clearTimeout(timeoutId);
      const errorName = error && typeof error === "object" && "name" in error ? String(error.name) : "UNKNOWN";
      state.lastExportError = `TO_BLOB:${errorName}`;
      fallback();
      return;
    }

    window.clearTimeout(timeoutId);
    fallback();
  });
}

async function encodeJpegWithinLimit(canvas, maxBytes) {
  const maxBlob = await canvasToBlob(canvas, "image/jpeg", JPEG_MAX_QUALITY);
  if (!maxBlob) {
    return { blob: null, quality: JPEG_MAX_QUALITY, withinLimit: false };
  }

  if (maxBlob.size <= maxBytes) {
    return { blob: maxBlob, quality: JPEG_MAX_QUALITY, withinLimit: true };
  }

  const minBlob = await canvasToBlob(canvas, "image/jpeg", JPEG_MIN_QUALITY);
  if (!minBlob) {
    return { blob: null, quality: JPEG_MIN_QUALITY, withinLimit: false };
  }

  if (minBlob.size > maxBytes) {
    return { blob: minBlob, quality: JPEG_MIN_QUALITY, withinLimit: false };
  }

  let low = JPEG_MIN_QUALITY;
  let high = JPEG_MAX_QUALITY;
  let bestBlob = minBlob;
  let bestQuality = JPEG_MIN_QUALITY;

  for (let i = 0; i < JPEG_SEARCH_STEPS; i += 1) {
    const mid = (low + high) / 2;
    const candidate = await canvasToBlob(canvas, "image/jpeg", mid);
    if (!candidate) break;

    if (candidate.size <= maxBytes) {
      bestBlob = candidate;
      bestQuality = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  return { blob: bestBlob, quality: bestQuality, withinLimit: true };
}

function renderExportCanvas() {
  const sourceRect = getSourceCropRect();
  if (!sourceRect || !state.rotatedSource) return null;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = OUTPUT_WIDTH;
  exportCanvas.height = OUTPUT_HEIGHT;

  const exportCtx = exportCanvas.getContext("2d");
  if (!exportCtx) return null;

  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = "high";
  exportCtx.drawImage(
    state.rotatedSource,
    sourceRect.sourceX,
    sourceRect.sourceY,
    sourceRect.sourceW,
    sourceRect.sourceH,
    0,
    0,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
  );

  return exportCanvas;
}

function drawOriginalPreviewToOutput() {
  if (!state.image || !outputCtx) return;

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  const sourceW = state.image.naturalWidth;
  const sourceH = state.image.naturalHeight;
  const scale = Math.min(OUTPUT_WIDTH / sourceW, OUTPUT_HEIGHT / sourceH);
  const drawW = sourceW * scale;
  const drawH = sourceH * scale;
  const drawX = (OUTPUT_WIDTH - drawW) / 2;
  const drawY = (OUTPUT_HEIGHT - drawH) / 2;

  outputCtx.imageSmoothingEnabled = true;
  outputCtx.imageSmoothingQuality = "high";
  outputCtx.drawImage(state.image, drawX, drawY, drawW, drawH);
}

function setStep1Compact(compact) {
  if (!ui.step1Card) return;
  ui.step1Card.classList.toggle("is-compact", Boolean(compact));
  window.setTimeout(syncCanvasSize, 0);
}

function setExporting(isExporting) {
  state.exporting = Boolean(isExporting);
  ui.exportBtn.disabled = state.exporting || state.currentStep < 2;
  ui.exportBtn.textContent = state.exporting ? "결과 만드는 중..." : EXPORT_BUTTON_LABEL;
  ui.processingOverlay.hidden = !state.exporting;

  if (state.currentStep >= 2) {
    setAdjustControlsEnabled(!state.exporting);
  }
}

async function exportResult() {
  if (!state.image) {
    updateStatus("사진을 먼저 업로드하세요.", "error");
    return;
  }

  setExporting(true);
  updateStatus("결과 만드는 중...", "info");

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const exportCanvas = renderExportCanvas();
    if (!exportCanvas) {
      ui.fileInfo.textContent = "생성 실패";
      updateStatus("결과 생성에 실패했습니다.", "error");
      return;
    }

    const { blob, quality, withinLimit } = await encodeJpegWithinLimit(exportCanvas, ONLINE_MAX_BYTES);

    if (!blob) {
      if (isSecurityExportError() && enableOriginalDownloadFallback()) {
        updateStatus("편집 결과 저장이 제한되어 원본 다운로드를 제공합니다.", "success");
        return;
      }

      ui.fileInfo.textContent = "생성 실패";
      updateStatus(describeExportFailure(), "error");
      return;
    }

    if (!withinLimit || blob.size > ONLINE_MAX_BYTES) {
      ui.fileInfo.textContent = `${formatBytes(blob.size)} (500KB 초과)`;
      clearDownloadLink();
      setStep(2);
      updateStatus("500KB 이하 조건으로 생성하지 못했습니다. 프레임을 조금 줄여 다시 시도하세요.", "error");
      return;
    }

    clearDownloadLink();
    state.outputMode = "cropped";
    state.downloadUrl = URL.createObjectURL(blob);

    ui.downloadLink.href = state.downloadUrl;
    ui.downloadLink.download = "passport-photo-413x531.jpg";
    ui.downloadLink.classList.add("is-visible");

    ui.fileInfo.textContent = `${formatBytes(blob.size)} (품질 ${quality.toFixed(2)})`;
    setStep(3);
    setActiveView("result");
    updateStatus("결과 생성이 완료되었습니다. 다운로드 버튼으로 저장하세요.", "success");
  } catch (error) {
    console.error(error);
    ui.fileInfo.textContent = "생성 실패";
    clearDownloadLink();
    setStep(2);
    updateStatus("결과 생성 중 오류가 발생했습니다. 다시 시도하세요.", "error");
  } finally {
    setExporting(false);
  }
}

function centerFrame() {
  if (!state.image) return;

  const { w, h } = state.crop;
  state.crop.x = state.imageBounds.x + (state.imageBounds.w - w) / 2;
  state.crop.y = state.imageBounds.y + (state.imageBounds.h - h) / 2;
  markResultDirty();
  drawEditor();
}

function setUploadSummary(name, thumbSrc) {
  ui.uploadSummary.hidden = false;
  ui.uploadName.textContent = name || "업로드된 사진";
  ui.uploadThumb.src = thumbSrc;
}

function replaceSourceObjectUrl(nextUrl = null) {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }

  if (nextUrl) {
    state.objectUrl = nextUrl;
  }
}

function applyLoadedImage(image, options = {}) {
  state.image = image;
  state.outputMode = "cropped";
  state.baseRotationDeg = 0;
  state.fineRotationDeg = 0;
  state.dragging = false;
  state.showGuides = true;
  ui.rotationRange.value = "0.0";
  ui.showGuides.checked = true;

  updateRotationLabel();
  rebuildRotatedSource();
  updateImageBounds();
  initCropFromSlider();
  updateFrameScaleLabel();
  clearDownloadLink();

  ui.fileInfo.textContent = "생성 전";

  setUploadSummary(options.displayName || "업로드된 사진", options.thumbSrc || image.src);
  setStep1Compact(true);
  setStep(2);
  setActiveView("edit");
  drawEditor();
  updateStatus("사진 업로드 완료. 2단계에서 위치를 맞춘 뒤 결과를 만드세요.", "success");
}

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    updateStatus("이미지 파일만 업로드할 수 있습니다.", "error");
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  replaceSourceObjectUrl(objectUrl);

  const image = new Image();

  image.onload = () => {
    applyLoadedImage(image, {
      displayName: file.name,
      thumbSrc: objectUrl,
    });
  };

  image.onerror = () => {
    updateStatus("이미지 로드 실패", "error");
  };

  image.src = objectUrl;
}

function loadDemoImage(path) {
  if (!path) return;

  const cacheSuffix = `v=${Date.now()}`;
  const cacheBust = `${path}${path.includes("?") ? "&" : "?"}${cacheSuffix}`;
  const absolutePath = new URL(path, window.location.href).toString();
  const absoluteCacheBust = `${absolutePath}${absolutePath.includes("?") ? "&" : "?"}${cacheSuffix}`;

  const applyDemo = (image, thumbSrc) => {
    applyLoadedImage(image, {
      displayName: "데모 이미지",
      thumbSrc,
    });
  };

  const loadByImageSrc = () => {
    replaceSourceObjectUrl(null);

    const firstTry = new Image();
    firstTry.onload = () => applyDemo(firstTry, cacheBust);
    firstTry.onerror = () => {
      const secondTry = new Image();
      secondTry.onload = () => applyDemo(secondTry, absoluteCacheBust);
      secondTry.onerror = () => updateStatus("데모 이미지 로드 실패", "error");
      secondTry.src = absoluteCacheBust;
    };
    firstTry.src = cacheBust;
  };

  fetch(absoluteCacheBust, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      replaceSourceObjectUrl(objectUrl);

      const image = new Image();
      image.onload = () => applyDemo(image, objectUrl);
      image.onerror = () => {
        replaceSourceObjectUrl(null);
        loadByImageSrc();
      };
      image.src = objectUrl;
    })
    .catch(() => {
      loadByImageSrc();
    });
}

function bindDropzone() {
  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onDragEnter = (event) => {
    preventDefaults(event);
    ui.dropzone.classList.add("is-dragover");
  };

  const onDragLeave = (event) => {
    preventDefaults(event);
    ui.dropzone.classList.remove("is-dragover");
  };

  const onDrop = (event) => {
    preventDefaults(event);
    ui.dropzone.classList.remove("is-dragover");

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    loadImage(file);
  };

  ui.dropzone.addEventListener("dragenter", onDragEnter);
  ui.dropzone.addEventListener("dragover", onDragEnter);
  ui.dropzone.addEventListener("dragleave", onDragLeave);
  ui.dropzone.addEventListener("drop", onDrop);
}

function bindEvents() {
  if (ui.viewEditBtn) {
    ui.viewEditBtn.addEventListener("click", () => setActiveView("edit"));
  }
  if (ui.viewResultBtn) {
    ui.viewResultBtn.addEventListener("click", () => setActiveView("result"));
  }
  if (ui.viewInfoBtn) {
    ui.viewInfoBtn.addEventListener("click", () => setActiveView("info"));
  }

  ui.photoInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    loadImage(file);
    ui.photoInput.value = "";
  });

  ui.changePhotoBtn.addEventListener("click", () => {
    ui.photoInput.click();
  });

  ui.loadDemoBtn.addEventListener("click", () => {
    loadDemoImage("./image.png");
  });

  ui.frameScale.addEventListener("input", () => {
    if (!state.image) return;

    markResultDirty();
    updateFrameScaleLabel();
    const anchorX = state.crop.x + state.crop.w / 2;
    const anchorY = state.crop.y + state.crop.h / 2;
    resizeCrop(sliderValueToHeight(), anchorX, anchorY);
    drawEditor();
  });

  ui.rotateLeftBtn.addEventListener("click", () => setBaseRotation(state.baseRotationDeg - 90));
  ui.rotateRightBtn.addEventListener("click", () => setBaseRotation(state.baseRotationDeg + 90));

  ui.rotationRange.addEventListener("input", (event) => {
    setFineRotation(event.target.value);
  });

  ui.resetRotationBtn.addEventListener("click", () => {
    state.baseRotationDeg = 0;
    setFineRotation(0);
  });

  ui.showGuides.addEventListener("change", (event) => {
    state.showGuides = event.target.checked;
    drawEditor();
  });

  ui.centerFrameBtn.addEventListener("click", centerFrame);
  ui.exportBtn.addEventListener("click", exportResult);

  ui.editorCanvas.addEventListener("pointerdown", onPointerDown);
  ui.editorCanvas.addEventListener("pointermove", onPointerMove);
  ui.editorCanvas.addEventListener("pointerup", onPointerUp);
  ui.editorCanvas.addEventListener("pointerleave", onPointerUp);
  ui.editorCanvas.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("resize", syncCanvasSize);

  bindDropzone();
  bindSwipeNavigation();
  bindLayoutObserver();
}

function init() {
  if (!editorCtx || !outputCtx) return;

  ui.frameScale.step = String(FRAME_SCALE_STEP);
  ui.frameScale.value = normalizeFrameScaleValue(Number(ui.frameScale.value)).toFixed(1);
  updateFrameScaleLabel();
  updateRotationLabel();
  setStep1Compact(false);
  setActiveView("edit");
  setStep(1);
  setExporting(false);
  bindEvents();
  syncCanvasSize();
  drawEmptyEditor();
  drawOutputPreview();
  updateStatus("1단계에서 사진을 업로드하면 자동으로 2단계가 열립니다.");
}

init();
