const mosaic = document.querySelector("#mosaic");
const subdivideButton = document.querySelector("#subdivide");
const sampler = document.querySelector("#sampler");
const samplerContext = sampler.getContext("2d", { willReadFrequently: true });

const GRID_SIZE = 64;
const PORTRAIT_RENDER_SIZE = 512;
const MAX_DEPTH = 5;
const SPLIT_LOCK_MS = 150;
const TOUCH_DRAG_THRESHOLD = 6;
const TOUCH_SPLIT_DISTANCE = 5;
const TOUCH_SPLIT_LOCK_MS = 55;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const destinations = [
  {
    label: "CV",
    href: "assets/cv.pdf",
    target: "_self",
    accent: "#f7f5ed",
  },
  {
    label: "IN",
    href: "https://www.linkedin.com/in/sumanth-gurram/",
    target: "_blank",
    accent: "#f7f5ed",
  },
  {
    label: "GH",
    href: "https://github.com/sumanthgenz",
    target: "_blank",
    accent: "#f7f5ed",
  },
  {
    label: "X",
    href: "https://x.com/sumantheg?s=11",
    target: "_blank",
    accent: "#f7f5ed",
  },
];

let pixelData = null;
let portraitDataUrl = "";
let interactionsEnabled = false;
let lastSplitX = Number.NaN;
let lastSplitY = Number.NaN;
let lastSplitTime = 0;
let guidedDepth = 0;
let guidedRenderFrame = 0;
let touchGesture = null;
let suppressClickUntil = 0;

function averageColor(x, y, size) {
  if (!pixelData) return "#171715";

  const startX = Math.round(x * GRID_SIZE);
  const startY = Math.round(y * GRID_SIZE);
  const cellSpan = Math.max(1, Math.round(size * GRID_SIZE));
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let row = startY; row < Math.min(GRID_SIZE, startY + cellSpan); row += 1) {
    for (let column = startX; column < Math.min(GRID_SIZE, startX + cellSpan); column += 1) {
      const offset = (row * GRID_SIZE + column) * 4;
      red += pixelData[offset];
      green += pixelData[offset + 1];
      blue += pixelData[offset + 2];
      count += 1;
    }
  }

  const lift = 0.9;
  const floor = 5;
  const r = Math.round((red / count) * lift + floor);
  const g = Math.round((green / count) * lift + floor);
  const b = Math.round((blue / count) * lift + floor);
  return `rgb(${r} ${g} ${b})`;
}

function textColor(background) {
  const channels = background.match(/\d+/g)?.map(Number) ?? [23, 23, 21];
  const luminance =
    (channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114) / 255;
  return luminance > 0.56 ? "#090909" : "#f7f5ed";
}

function makeTile({ x, y, size, depth, destinationIndex, locked = false }) {
  const destination = destinations[destinationIndex];
  const tile = document.createElement("a");
  const background = depth === 0 ? "#11110f" : averageColor(x, y, size);

  tile.className = "tile";
  tile.href = destination.href;
  tile.target = destination.target;
  tile.rel = destination.target === "_blank" ? "noreferrer" : "";
  tile.tabIndex = -1;
  tile.dataset.depth = depth;
  tile.dataset.x = x;
  tile.dataset.y = y;
  tile.dataset.size = size;
  tile.dataset.destination = destinationIndex;
  tile.dataset.label = destination.label;
  tile.setAttribute("aria-label", destination.label);
  tile.style.left = `${x * 100}%`;
  tile.style.top = `${y * 100}%`;
  tile.style.width = `${size * 100}%`;
  tile.style.height = `${size * 100}%`;
  tile.style.setProperty("--tile-size", size * 100);
  tile.style.setProperty("--depth", depth);
  tile.style.setProperty("--accent", destination.accent);
  tile.style.setProperty("--label-opacity", Math.max(0.3, 1 - depth * 0.13));
  tile.style.backgroundColor = background;
  tile.style.color = depth === 0 ? destination.accent : textColor(background);

  if (locked) tile.style.pointerEvents = "none";
  return tile;
}

function splitTile(tile, unlockDelay = SPLIT_LOCK_MS) {
  if (!tile.isConnected) return;

  const depth = Number(tile.dataset.depth);
  if (depth >= MAX_DEPTH) return;

  const x = Number(tile.dataset.x);
  const y = Number(tile.dataset.y);
  const size = Number(tile.dataset.size);
  const destinationIndex = Number(tile.dataset.destination);
  const childSize = size / 2;
  const fragment = document.createDocumentFragment();
  const children = [];

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const child = makeTile({
        x: x + column * childSize,
        y: y + row * childSize,
        size: childSize,
        depth: depth + 1,
        destinationIndex,
        locked: true,
      });
      child.style.opacity = "0";
      child.style.transform = "scale(0.84)";
      fragment.append(child);
      children.push(child);
    }
  }

  tile.replaceWith(fragment);

  children.forEach((child, index) => {
    const animation = child.animate(
      [
        { opacity: 0, transform: "scale(0.84)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      {
        duration: reduceMotion ? 0 : 170,
        delay: reduceMotion ? 0 : index * 18,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "forwards",
      },
    );
    animation.addEventListener(
      "finish",
      () => {
        child.style.opacity = "1";
        child.style.transform = "none";
        animation.cancel();
      },
      { once: true },
    );
  });

  window.setTimeout(() => {
    children.forEach((child) => {
      child.style.pointerEvents = "auto";
    });
  }, unlockDelay);
}

function renderInitialTiles() {
  destinations.forEach((_, destinationIndex) => {
    const column = destinationIndex % 2;
    const row = Math.floor(destinationIndex / 2);
    mosaic.append(
      makeTile({
        x: column * 0.5,
        y: row * 0.5,
        size: 0.5,
        depth: 0,
        destinationIndex,
      }),
    );
  });
}

function clearRasterizedMosaic() {
  mosaic.classList.remove("mosaic--rasterized");
  mosaic.style.removeProperty("background-image");
}

function updateSubdivideButton() {
  if (guidedDepth >= MAX_DEPTH) {
    subdivideButton.textContent = "RESET";
    subdivideButton.setAttribute("aria-label", "Reset the portrait tiles");
    return;
  }

  subdivideButton.textContent = `${guidedDepth}/${MAX_DEPTH}`;
  subdivideButton.setAttribute("aria-label", "Subdivide all tiles one level");
}

function resetMosaic() {
  if (guidedRenderFrame) {
    window.cancelAnimationFrame(guidedRenderFrame);
    guidedRenderFrame = 0;
  }
  clearRasterizedMosaic();
  mosaic.replaceChildren();
  guidedDepth = 0;
  lastSplitX = Number.NaN;
  lastSplitY = Number.NaN;
  lastSplitTime = 0;
  renderInitialTiles();
  updateSubdivideButton();
}

function renderUniformDepth(depth) {
  if (depth === MAX_DEPTH) {
    if (!portraitDataUrl) {
      renderUniformDepth(MAX_DEPTH - 1);
      return;
    }

    const fragment = document.createDocumentFragment();
    destinations.forEach((_, destinationIndex) => {
      const column = destinationIndex % 2;
      const row = Math.floor(destinationIndex / 2);
      const tile = makeTile({
        x: column * 0.5,
        y: row * 0.5,
        size: 0.5,
        depth,
        destinationIndex,
      });
      tile.classList.add("tile--hit-area");
      fragment.append(tile);
    });

    mosaic.classList.add("mosaic--rasterized");
    if (portraitDataUrl) {
      mosaic.style.backgroundImage = `url("${portraitDataUrl}")`;
    }
    mosaic.replaceChildren(fragment);
    return;
  }

  clearRasterizedMosaic();
  const cellsPerSide = 2 ** (depth + 1);
  const size = 1 / cellsPerSide;
  const midpoint = cellsPerSide / 2;
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < cellsPerSide; row += 1) {
    for (let column = 0; column < cellsPerSide; column += 1) {
      const destinationIndex =
        (row >= midpoint ? 2 : 0) + (column >= midpoint ? 1 : 0);
      fragment.append(
        makeTile({
          x: column * size,
          y: row * size,
          size,
          depth,
          destinationIndex,
        }),
      );
    }
  }

  mosaic.replaceChildren(fragment);
}

async function loadPortraitSamples() {
  const image = new Image();
  image.src = "assets/profile.jpg";
  await image.decode();

  // A tight square crop keeps the mosaic focused on the face and shoulders.
  samplerContext.drawImage(image, 220, 310, 900, 900, 0, 0, GRID_SIZE, GRID_SIZE);
  pixelData = samplerContext.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;

  const portraitCanvas = document.createElement("canvas");
  portraitCanvas.width = PORTRAIT_RENDER_SIZE;
  portraitCanvas.height = PORTRAIT_RENDER_SIZE;
  const portraitContext = portraitCanvas.getContext("2d");
  portraitContext.imageSmoothingEnabled = false;
  portraitContext.drawImage(
    sampler,
    0,
    0,
    PORTRAIT_RENDER_SIZE,
    PORTRAIT_RENDER_SIZE,
  );
  portraitDataUrl = portraitCanvas.toDataURL("image/png");
  if (guidedDepth === MAX_DEPTH) {
    renderUniformDepth(MAX_DEPTH);
  }
}

renderInitialTiles();
loadPortraitSamples().catch(() => {});

function tileAtPoint(clientX, clientY) {
  const tile = document.elementFromPoint(clientX, clientY)?.closest(".tile");
  return tile && mosaic.contains(tile) ? tile : null;
}

function splitAtPoint(clientX, clientY, minimumDistance, minimumDelay) {
  const tile = tileAtPoint(clientX, clientY);
  if (!tile || Number(tile.dataset.depth) >= MAX_DEPTH) return false;

  const distance = Math.hypot(clientX - lastSplitX, clientY - lastSplitY);
  const enoughMovement = Number.isNaN(distance) || distance >= minimumDistance;
  const enoughTime = performance.now() - lastSplitTime >= minimumDelay;
  if (!enoughMovement || !enoughTime) return false;

  lastSplitX = clientX;
  lastSplitY = clientY;
  lastSplitTime = performance.now();
  splitTile(tile, minimumDelay);
  return true;
}

function isTouchPointer(event) {
  return event.pointerType === "touch";
}

mosaic.addEventListener("pointerdown", (event) => {
  if (!isTouchPointer(event) || !interactionsEnabled) return;

  touchGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    didSplit: false,
  };
  lastSplitX = Number.NaN;
  lastSplitY = Number.NaN;
  lastSplitTime = 0;
  mosaic.setPointerCapture(event.pointerId);
});

mosaic.addEventListener("pointermove", (event) => {
  if (!interactionsEnabled) return;

  if (isTouchPointer(event)) {
    if (!touchGesture || event.pointerId !== touchGesture.pointerId) return;

    const dragDistance = Math.hypot(
      event.clientX - touchGesture.startX,
      event.clientY - touchGesture.startY,
    );
    if (!touchGesture.dragging && dragDistance < TOUCH_DRAG_THRESHOLD) return;

    touchGesture.dragging = true;
    event.preventDefault();
    if (
      splitAtPoint(
        event.clientX,
        event.clientY,
        TOUCH_SPLIT_DISTANCE,
        TOUCH_SPLIT_LOCK_MS,
      )
    ) {
      touchGesture.didSplit = true;
    }
    return;
  }

  splitAtPoint(event.clientX, event.clientY, 11, SPLIT_LOCK_MS);
});

function finishTouchGesture(event) {
  if (!touchGesture || event.pointerId !== touchGesture.pointerId) return;

  if (touchGesture.dragging || touchGesture.didSplit) {
    suppressClickUntil = performance.now() + 700;
  }
  if (mosaic.hasPointerCapture(event.pointerId)) {
    mosaic.releasePointerCapture(event.pointerId);
  }
  touchGesture = null;
}

mosaic.addEventListener("pointerup", finishTouchGesture);
mosaic.addEventListener("pointercancel", finishTouchGesture);
mosaic.addEventListener(
  "click",
  (event) => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

subdivideButton.addEventListener("click", () => {
  if (guidedDepth >= MAX_DEPTH) {
    resetMosaic();
    return;
  }

  guidedDepth += 1;
  updateSubdivideButton();
  if (guidedRenderFrame) window.cancelAnimationFrame(guidedRenderFrame);
  const targetDepth = guidedDepth;
  guidedRenderFrame = window.requestAnimationFrame(() => {
    renderUniformDepth(targetDepth);
    guidedRenderFrame = 0;
  });
});

window.setTimeout(() => {
  interactionsEnabled = true;
}, 500);
