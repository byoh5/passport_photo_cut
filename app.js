const PHOTO_RATIO = 35 / 45;
const EXPORT_WIDTH = 413;
const EXPORT_HEIGHT = 531;
const MAX_BYTES = 500 * 1024;
const SLIDER_MIN = 35;
const SLIDER_MAX = 100;

const ui = {
  photoInput: document.getElementById("photoInput"),
  frameScale: document.getElementById("frameScale"),
  showGuides: document.getElementById("showGuides"),
  centerFrameBtn: document.getElementById("centerFrameBtn"),
  resetFrameBtn: document.getElementById("resetFrameBtn"),
  exportBtn: document.getElementById("exportBtn"),
  editorCanvas: document.getElementById("editorCanvas"),
  outputCanvas: document.getElementById("outputCanvas"),
  fileInfo: document.getElementById("fileInfo"),
  downloadLink: document.getElementById("downloadLink"),
};

const editorCtx = ui.editorCanvas.getContext("2d");
const outputCtx = ui.outputCanvas.getContext("2d");

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
  showGuides: true,
  downloadUrl: null,
};

function getCanvasCssSize() {
  return {
    w: ui.editorCanvas.width / state.dpr,
    h: ui.editorCanvas.height / state.dpr,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function syncCanvasSize() {
  const width = Math.max(320, Math.round(ui.editorCanvas.clientWidth || 320));
  const height = Math.max(320, Math.round(width * 0.7));

  ui.editorCanvas.style.height = `${height}px`;
  state.dpr = window.devicePixelRatio || 1;
  ui.editorCanvas.width = Math.round(width * state.dpr);
  ui.editorCanvas.height = Math.round(height * state.dpr);
  editorCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  if (state.image) {
    updateImageBounds();
    ensureCropInsideBounds();
    drawEditor();
    drawOutputPreview();
  } else {
    drawEmptyEditor();
  }
}

function updateImageBounds() {
  if (!state.image) return;

  const { w: canvasW, h: canvasH } = getCanvasCssSize();
  state.fitScale = Math.min(canvasW / state.image.naturalWidth, canvasH / state.image.naturalHeight);

  const drawW = state.image.naturalWidth * state.fitScale;
  const drawH = state.image.naturalHeight * state.fitScale;

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
  const value = Number(ui.frameScale.value);
  const t = (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
  return state.cropMinH + t * (state.cropMaxH - state.cropMinH);
}

function heightToSliderValue(height) {
  if (state.cropMaxH === state.cropMinH) return SLIDER_MIN;
  const t = (height - state.cropMinH) / (state.cropMaxH - state.cropMinH);
  return Math.round(SLIDER_MIN + t * (SLIDER_MAX - SLIDER_MIN));
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
  ui.frameScale.value = String(heightToSliderValue(h));
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
  ui.frameScale.value = String(heightToSliderValue(h));
}

function drawEmptyEditor() {
  const { w, h } = getCanvasCssSize();
  editorCtx.clearRect(0, 0, w, h);

  const gradient = editorCtx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#edf2ea");
  gradient.addColorStop(1, "#e4e8df");
  editorCtx.fillStyle = gradient;
  editorCtx.fillRect(0, 0, w, h);

  editorCtx.fillStyle = "#5f6d65";
  editorCtx.font = "600 17px 'Noto Sans KR', sans-serif";
  editorCtx.textAlign = "center";
  editorCtx.fillText("사진을 업로드하면 크롭 가이드가 표시됩니다", w / 2, h / 2 - 6);

  editorCtx.font = "500 13px 'Noto Sans KR', sans-serif";
  editorCtx.fillStyle = "#718279";
  editorCtx.fillText("비율 고정: 3.5 x 4.5", w / 2, h / 2 + 20);

  drawOutputPlaceholder();
}

function drawGuideLine(y, label, color) {
  const c = state.crop;
  editorCtx.save();
  editorCtx.setLineDash([6, 5]);
  editorCtx.lineWidth = 1;
  editorCtx.strokeStyle = color;
  editorCtx.beginPath();
  editorCtx.moveTo(c.x, y);
  editorCtx.lineTo(c.x + c.w, y);
  editorCtx.stroke();
  editorCtx.restore();

  const labelPadX = 8;
  const labelPadY = 3;
  editorCtx.font = "600 11px 'Noto Sans KR', sans-serif";
  const textWidth = editorCtx.measureText(label).width;

  const boxX = clamp(c.x + 7, c.x + 4, c.x + c.w - textWidth - labelPadX * 2 - 4);
  const boxY = y - 14;
  editorCtx.fillStyle = "rgba(17, 29, 25, 0.72)";
  editorCtx.fillRect(boxX, boxY, textWidth + labelPadX * 2, 16);

  editorCtx.fillStyle = "#ffffff";
  editorCtx.fillText(label, boxX + labelPadX, boxY + 11);
}

function drawGuides() {
  const c = state.crop;

  editorCtx.save();
  editorCtx.beginPath();
  editorCtx.rect(c.x, c.y, c.w, c.h);
  editorCtx.clip();

  editorCtx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  editorCtx.setLineDash([4, 4]);
  editorCtx.beginPath();
  editorCtx.moveTo(c.x + c.w / 2, c.y);
  editorCtx.lineTo(c.x + c.w / 2, c.y + c.h);
  editorCtx.stroke();

  const headTop = c.y + c.h * 0.1;
  const eyes = c.y + c.h * 0.43;
  const nose = c.y + c.h * 0.57;
  const mouth = c.y + c.h * 0.67;
  const shoulder = c.y + c.h * 0.82;
  const chin = c.y + c.h * 0.86;

  const chinMin = headTop + c.h * 0.711;
  const chinMax = headTop + c.h * 0.8;

  editorCtx.fillStyle = "rgba(35, 102, 63, 0.17)";
  editorCtx.fillRect(c.x + 1, chinMin, c.w - 2, chinMax - chinMin);

  drawGuideLine(headTop, "정수리 기준", "#8ed8ab");
  drawGuideLine(eyes, "눈", "#70d5ff");
  drawGuideLine(nose, "코", "#93b8ff");
  drawGuideLine(mouth, "입", "#f6b577");
  drawGuideLine(shoulder, "어깨", "#f7d577");
  drawGuideLine(chin, "턱", "#ff9f94");

  editorCtx.restore();

  editorCtx.fillStyle = "rgba(26, 74, 47, 0.72)";
  editorCtx.fillRect(c.x + c.w - 146, c.y + c.h - 28, 140, 20);
  editorCtx.fillStyle = "#fff";
  editorCtx.font = "600 10px 'Noto Sans KR', sans-serif";
  editorCtx.fillText("머리길이 3.2~3.6cm 보조", c.x + c.w - 139, c.y + c.h - 14);
}

function drawEditor() {
  if (!state.image) {
    drawEmptyEditor();
    return;
  }

  const { w, h } = getCanvasCssSize();
  editorCtx.clearRect(0, 0, w, h);

  editorCtx.fillStyle = "#f4f6f0";
  editorCtx.fillRect(0, 0, w, h);

  editorCtx.drawImage(
    state.image,
    state.imageBounds.x,
    state.imageBounds.y,
    state.imageBounds.w,
    state.imageBounds.h,
  );

  editorCtx.fillStyle = "rgba(20, 26, 24, 0.52)";
  editorCtx.beginPath();
  editorCtx.rect(0, 0, w, h);
  editorCtx.rect(state.crop.x, state.crop.y, state.crop.w, state.crop.h);
  editorCtx.fill("evenodd");

  editorCtx.lineWidth = 2;
  editorCtx.strokeStyle = "#ffffff";
  editorCtx.strokeRect(state.crop.x, state.crop.y, state.crop.w, state.crop.h);

  editorCtx.strokeStyle = "#d7f7e1";
  editorCtx.lineWidth = 1;
  const size = 15;
  const c = state.crop;
  function drawCorner(x, y, xDir, yDir) {
    editorCtx.beginPath();
    editorCtx.moveTo(x, y);
    editorCtx.lineTo(x + size * xDir, y);
    editorCtx.stroke();

    editorCtx.beginPath();
    editorCtx.moveTo(x, y);
    editorCtx.lineTo(x, y + size * yDir);
    editorCtx.stroke();
  }

  drawCorner(c.x, c.y, 1, 1);
  drawCorner(c.x + c.w, c.y, -1, 1);
  drawCorner(c.x, c.y + c.h, 1, -1);
  drawCorner(c.x + c.w, c.y + c.h, -1, -1);

  if (state.showGuides) {
    drawGuides();
  }

  drawOutputPreview();
}

function drawOutputPlaceholder() {
  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  outputCtx.strokeStyle = "#d8ddd1";
  outputCtx.strokeRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

  outputCtx.fillStyle = "#7b8880";
  outputCtx.textAlign = "center";
  outputCtx.font = "600 20px 'Noto Sans KR', sans-serif";
  outputCtx.fillText("결과 미리보기", EXPORT_WIDTH / 2, EXPORT_HEIGHT / 2 - 12);
  outputCtx.font = "500 14px 'Noto Sans KR', sans-serif";
  outputCtx.fillText("413 x 531px", EXPORT_WIDTH / 2, EXPORT_HEIGHT / 2 + 18);
}

function drawOutputPreview() {
  if (!state.image || !state.crop.w) {
    drawOutputPlaceholder();
    return;
  }

  const sourceX = clamp(
    (state.crop.x - state.imageBounds.x) / state.fitScale,
    0,
    state.image.naturalWidth,
  );
  const sourceY = clamp(
    (state.crop.y - state.imageBounds.y) / state.fitScale,
    0,
    state.image.naturalHeight,
  );
  const sourceW = clamp(
    state.crop.w / state.fitScale,
    1,
    state.image.naturalWidth - sourceX,
  );
  const sourceH = clamp(
    state.crop.h / state.fitScale,
    1,
    state.image.naturalHeight - sourceY,
  );

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  outputCtx.drawImage(
    state.image,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    0,
    0,
    EXPORT_WIDTH,
    EXPORT_HEIGHT,
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
  ui.editorCanvas.setPointerCapture(event.pointerId);
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
  const nextX = clamp(
    state.dragStartCrop.x + deltaX,
    bounds.x,
    bounds.x + bounds.w - state.crop.w,
  );
  const nextY = clamp(
    state.dragStartCrop.y + deltaY,
    bounds.y,
    bounds.y + bounds.h - state.crop.h,
  );

  state.crop.x = nextX;
  state.crop.y = nextY;
  drawEditor();
}

function onPointerUp(event) {
  if (!state.image) return;

  if (state.dragging) {
    state.dragging = false;
    ui.editorCanvas.style.cursor = "grab";
    if (ui.editorCanvas.hasPointerCapture(event.pointerId)) {
      ui.editorCanvas.releasePointerCapture(event.pointerId);
    }
  }
}

function onWheel(event) {
  if (!state.image) return;
  event.preventDefault();

  const factor = event.deltaY < 0 ? 1.05 : 0.95;
  const anchorX = state.crop.x + state.crop.w / 2;
  const anchorY = state.crop.y + state.crop.h / 2;

  resizeCrop(state.crop.h * factor, anchorX, anchorY);
  drawEditor();
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function createExportBlob(canvas) {
  let quality = 0.92;
  let blob = await canvasToBlob(canvas, quality);

  while (blob && blob.size > MAX_BYTES && quality > 0.45) {
    quality -= 0.07;
    blob = await canvasToBlob(canvas, quality);
  }

  return { blob, quality };
}

async function exportResult() {
  if (!state.image) {
    ui.fileInfo.textContent = "파일 크기: 사진을 먼저 업로드하세요";
    return;
  }

  drawOutputPreview();

  const { blob, quality } = await createExportBlob(ui.outputCanvas);
  if (!blob) {
    ui.fileInfo.textContent = "파일 크기: 생성 실패";
    return;
  }

  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
  }

  state.downloadUrl = URL.createObjectURL(blob);
  ui.downloadLink.href = state.downloadUrl;
  ui.downloadLink.style.display = "inline-flex";

  const qualityText = quality.toFixed(2);
  const sizeText = formatBytes(blob.size);
  if (blob.size > MAX_BYTES) {
    ui.fileInfo.textContent = `파일 크기: ${sizeText} (500KB 초과, 추가 압축 필요)`;
  } else {
    ui.fileInfo.textContent = `파일 크기: ${sizeText} (JPEG 품질 ${qualityText})`;
  }
}

function resetFrame() {
  if (!state.image) return;
  initCropFromSlider();
  drawEditor();
}

function centerFrame() {
  if (!state.image) return;
  const w = state.crop.w;
  const h = state.crop.h;
  state.crop.x = state.imageBounds.x + (state.imageBounds.w - w) / 2;
  state.crop.y = state.imageBounds.y + (state.imageBounds.h - h) / 2;
  drawEditor();
}

function loadImage(file) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    state.image = image;
    updateImageBounds();
    initCropFromSlider();
    drawEditor();
    ui.fileInfo.textContent = "파일 크기: 생성 전";
    ui.downloadLink.style.display = "none";
    URL.revokeObjectURL(objectUrl);
  };

  image.onerror = () => {
    ui.fileInfo.textContent = "파일 크기: 이미지 로드 실패";
    URL.revokeObjectURL(objectUrl);
  };

  image.src = objectUrl;
}

function bindEvents() {
  ui.photoInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    loadImage(file);
  });

  ui.frameScale.addEventListener("input", () => {
    if (!state.image) return;

    const anchorX = state.crop.x + state.crop.w / 2;
    const anchorY = state.crop.y + state.crop.h / 2;
    resizeCrop(sliderValueToHeight(), anchorX, anchorY);
    drawEditor();
  });

  ui.showGuides.addEventListener("change", (event) => {
    state.showGuides = event.target.checked;
    drawEditor();
  });

  ui.centerFrameBtn.addEventListener("click", centerFrame);
  ui.resetFrameBtn.addEventListener("click", resetFrame);
  ui.exportBtn.addEventListener("click", exportResult);

  ui.editorCanvas.addEventListener("pointerdown", onPointerDown);
  ui.editorCanvas.addEventListener("pointermove", onPointerMove);
  ui.editorCanvas.addEventListener("pointerup", onPointerUp);
  ui.editorCanvas.addEventListener("pointerleave", onPointerUp);
  ui.editorCanvas.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("resize", syncCanvasSize);
}

function init() {
  bindEvents();
  syncCanvasSize();
  drawEmptyEditor();
}

init();
