// TV view for computers and tablets.
// The page is painted onto a canvas, then the shader in crt-shader.js bends it like an old TV.
// The cursor is painted too, so it bends with everything else.
// Positions and sizes are measured from the hidden page underneath, so style.css stays in charge of layout.
// Uses BULGE from settings.js, the digit shapes from clock.js, FEED_W and FEED_H from channels.js
// and the shaders from crt-shader.js.

const CURSORS = {
  point: { src: "images/cursor-point.svg", hotX: 12, hotY: 3 },
  fist: { src: "images/cursor-fist.svg", hotX: 12, hotY: 15 },
};
const CURSOR_W = 42;
const CURSOR_H = 60;

const MAX_CHANNELS = 12;   // the shader has room for 12
const FEED_COLS = 4;       // channel pictures are packed into a 4 x 3 grid on the GPU
const FEED_ROWS = 3;

const TILE_GROW = 1.04;    // hover sizes, same as style.css
const ORB_GROW = 1.06;

// Starts the TV view. Returns null when it can't run, and the flat page stays.
function startTV(screen, channels, clock) {
  // Browsers block the GPU from reading images on a page opened straight from a file.
  if (location.protocol === "file:") return null;

  const output = document.createElement("canvas");
  output.className = "crt";
  output.setAttribute("aria-hidden", "true");
  screen.append(output);

  const gl = output.getContext("webgl", { antialias: false, alpha: false });
  const program = gl && buildProgram(gl);
  if (!program) {
    output.remove();
    return null;
  }

  const phone = matchMedia("(max-width: 600px) and (orientation: portrait)");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Colors from style.css ----------

  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const COLORS = {
    bg: token("--bg"),
    sideShade: token("--side-shade"),
    pink: token("--pink"),
    pinkGlow: token("--pink-glow"),
    tileFill: token("--tile-fill"),
    tileEdge: token("--tile-edge"),
    dockTop: token("--dock-top"),
    dockBottom: token("--dock-bottom"),
    dockShadow: token("--dock-shadow"),
    orbLight: token("--orb-light"),
    orbShade: token("--orb-shade"),
    orbRing: token("--orb-ring"),
    orbRingEdge: token("--orb-ring-edge"),
    envelope: token("--envelope"),
    envelopeFlap: token("--envelope-flap"),
  };
  const STRIPE_W = parseFloat(token("--stripe-w"));
  const STRIPE_H = parseFloat(token("--stripe-h"));

  // ---------- Images ----------

  const stripes = loadImage("images/stripes.png", () => (baseDirty = true));
  const hands = {
    point: loadImage(CURSORS.point.src, () => (cursorKind = "")),
    fist: loadImage(CURSORS.fist.src, () => (cursorKind = "")),
  };

  // ---------- Canvas layers ----------
  // base:  background, dock, clock and date. Repainted when the size or the minute changes.
  // scene: base plus channel frames and buttons. A hover only repaints the part around it.

  const base = document.createElement("canvas");
  const scene = document.createElement("canvas");
  const patch = document.createElement("canvas");
  const hand = document.createElement("canvas");

  let W = 0, H = 0, ratio = 1;          // screen size in CSS pixels, and pixel ratio
  let layout = null;
  let baseDirty = true;
  let needsResize = true;
  let sendAllFeeds = true;
  let cursorKind = "";
  let minute = "";
  let colonRects = [];
  let lastTime = 0;

  // ---------- Measuring the hidden page ----------

  function rectOf(el) {
    const box = screen.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  }

  // Reads every position from the page. Hover sizes carry over from the last measure.
  function measure() {
    const before = layout;
    const tiles = channels.slice(0, MAX_CHANNELS).map((ch, i) => ({
      ...rectOf(ch.tile),
      grow: before?.tiles[i]?.grow ?? 1,
      hot: before?.tiles[i]?.hot ?? false,
    }));
    const orbs = [...screen.querySelectorAll(".orb")].map((el, i) => {
      const envelope = el.querySelector(".envelope");
      return {
        ...rectOf(el),
        face: rectOf(el.querySelector(".orb-face")),
        envelope: envelope && rectOf(envelope),
        grow: before?.orbs[i]?.grow ?? 1,
      };
    });
    const tileStyle = getComputedStyle(channels[0].tile);
    layout = {
      tiles,
      orbs,
      tileRadius: parseFloat(tileStyle.borderTopLeftRadius),
      dock: rectOf(screen.querySelector(".dock")),
      dockShape: screen.querySelector("#dock-shape").getAttribute("d"),
      dockLine: screen.querySelector("#dock-line").getAttribute("d"),
      cornerRadius: parseFloat(getComputedStyle(screen).borderTopLeftRadius),
    };
  }

  // ---------- Painting ----------

  // An SVG path from the dock, stretched to the dock's size (its viewBox is 1000 x 200).
  function dockPath(d, offsetY = 0) {
    const { x, y, w, h } = layout.dock;
    const path = new Path2D();
    const sy = h / 200;
    path.addPath(new Path2D(d), new DOMMatrix().translate(x, y + offsetY * sy).scale(w / 1000, sy));
    return path;
  }

  function paintBase() {
    measure();
    const c = base.getContext("2d");
    c.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Background color, stripe texture and darker sides.
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, W, H);
    if (stripes.naturalWidth) {
      const pattern = c.createPattern(stripes, "repeat");
      pattern.setTransform(new DOMMatrix().scale(STRIPE_W / stripes.naturalWidth, STRIPE_H / stripes.naturalHeight));
      c.fillStyle = pattern;
      c.fillRect(0, 0, W, H);
    }
    const sides = c.createLinearGradient(0, 0, W, 0);
    sides.addColorStop(0, COLORS.sideShade);
    sides.addColorStop(.32, "transparent");
    sides.addColorStop(.68, "transparent");
    sides.addColorStop(1, COLORS.sideShade);
    c.fillStyle = sides;
    c.fillRect(0, 0, W, H);

    paintDock(c);
    paintClock(c);
    paintText(c, screen.querySelector("#date"));
    baseDirty = false;
  }

  function paintDock(c) {
    const { y, h } = layout.dock;
    const shape = dockPath(layout.dockShape);

    const fill = c.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, COLORS.dockTop);
    fill.addColorStop(1, COLORS.dockBottom);
    c.fillStyle = fill;
    c.fill(shape);

    // Soft shadow under the edge. The line is drawn far off to the side so only its blurred shadow lands here.
    const sy = h / 200;
    c.save();
    c.clip(shape);
    c.translate(-10000, 0);
    c.shadowOffsetX = 10000 * ratio;
    c.shadowBlur = 14 * sy * ratio;
    c.shadowColor = COLORS.dockShadow;
    c.lineWidth = 26 * sy;
    c.strokeStyle = "#000";
    c.stroke(dockPath(layout.dockLine, 14));
    c.restore();

    c.lineWidth = 3;
    c.strokeStyle = COLORS.pink;
    c.stroke(dockPath(layout.dockLine));
  }

  // Paints the clock from the digit shapes in the hidden page.
  // The colon is left to the shader so it can blink.
  function paintClock(c) {
    const clockEl = screen.querySelector("#clock");
    c.fillStyle = getComputedStyle(clockEl).color;
    colonRects = [];

    for (const el of clockEl.children) {
      const r = rectOf(el);
      if (el.matches(".colon")) {
        colonRects = COLON_DOTS.map(([x, y, w, h]) => [r.x + x * r.w / 12, r.y + y * r.h / 100, w * r.w / 12, h * r.h / 100]);
      } else if (el.matches(".seg")) {
        if (el.dataset.digit === "") continue;
        for (const s of DIGITS[el.dataset.digit]) fillShape(c, SEGMENTS[s], r.x, r.y, r.w / 50, r.h / 100);
      } else {
        paintText(c, el);   // AM or PM
      }
    }
  }

  // Paints an element's text in its own font and color, centered in its box.
  function paintText(c, el) {
    const r = rectOf(el);
    const style = getComputedStyle(el);
    c.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    c.fillStyle = style.color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(el.textContent, r.x + r.w / 2, r.y + r.h / 2);
  }

  // A channel's frame. The shader fills in the picture.
  function paintTile(c, t) {
    const r = layout.tileRadius;
    c.save();
    c.translate(t.x + t.w / 2, t.y + t.h / 2);
    c.scale(t.grow, t.grow);
    c.translate(-t.w / 2, -t.h / 2);

    const hot = t.grow > 1.001;
    if (hot) {
      c.shadowColor = COLORS.pinkGlow;
      c.shadowBlur = 18 * ratio;
      c.beginPath();
      c.roundRect(-3, -3, t.w + 6, t.h + 6, r + 3);
      c.fillStyle = COLORS.pink;
      c.fill();
      c.shadowColor = "transparent";
    }
    c.beginPath();
    c.roundRect(0, 0, t.w, t.h, r);
    c.fillStyle = COLORS.tileFill;
    c.fill();
    c.beginPath();
    c.roundRect(1, 1, t.w - 2, t.h - 2, r - 1);
    c.lineWidth = 2;
    c.strokeStyle = hot ? COLORS.pink : COLORS.tileEdge;
    c.stroke();
    c.restore();
  }

  function paintOrb(c, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const ring = o.w / 2;
    const face = o.face.w / 2;
    c.save();
    c.translate(cx, cy);
    c.scale(o.grow, o.grow);

    // Ring with its thin edge and drop shadow.
    c.shadowColor = "rgba(0, 0, 0, .15)";
    c.shadowBlur = 10 * ratio;
    c.shadowOffsetY = 4 * ratio;
    circle(c, ring + 2, COLORS.orbRingEdge);
    c.shadowColor = "transparent";
    circle(c, ring, COLORS.orbRing);

    // Face with its pink border.
    const shine = c.createRadialGradient(0, -face * .3, 0, 0, -face * .3, face * 1.2);
    shine.addColorStop(0, COLORS.orbLight);
    shine.addColorStop(.7, COLORS.orbShade);
    circle(c, face, shine);
    c.beginPath();
    c.arc(0, 0, face - 1.5, 0, Math.PI * 2);
    c.lineWidth = 3;
    c.strokeStyle = COLORS.pink;
    c.stroke();

    if (o.envelope) {
      const { w, h } = o.envelope;
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, 3);
      c.fillStyle = COLORS.envelope;
      c.fill();
      c.clip();
      // The flap: a square turned 45 degrees, mostly above the envelope.
      const side = w * .72;
      c.translate(0, -h / 2 - .6 * h + side / 2);
      c.rotate(Math.PI / 4);
      c.lineWidth = 2;
      c.strokeStyle = COLORS.envelopeFlap;
      c.strokeRect(-side / 2, -side / 2, side, side);
    }
    c.restore();
  }

  // Channel frames and buttons on top of the base. The hovered tile goes last so it sits on top.
  function paintParts(c) {
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    layout.tiles.filter((t) => !t.hot).forEach((t) => paintTile(c, t));
    layout.tiles.filter((t) => t.hot).forEach((t) => paintTile(c, t));
    layout.orbs.forEach((o) => paintOrb(c, o));
  }

  function paintScene() {
    const c = scene.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(base, 0, 0);
    paintParts(c);
    sendTexture(sceneTexture, 0, scene);
  }

  // Repaints one rectangle (in CSS pixels) and sends only that part to the GPU.
  function paintPatch(x, y, w, h) {
    const sx = Math.max(0, Math.floor(x * ratio));
    const sy = Math.max(0, Math.floor(y * ratio));
    const sw = Math.min(scene.width, Math.ceil((x + w) * ratio)) - sx;
    const sh = Math.min(scene.height, Math.ceil((y + h) * ratio)) - sy;
    if (sw <= 0 || sh <= 0) return;

    const c = scene.getContext("2d");
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    c.rect(sx, sy, sw, sh);
    c.clip();
    c.drawImage(base, sx, sy, sw, sh, sx, sy, sw, sh);
    paintParts(c);
    c.restore();

    patch.width = sw;
    patch.height = sh;
    patch.getContext("2d").drawImage(scene, sx, sy, sw, sh, 0, 0, sw, sh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx, sy, gl.RGBA, gl.UNSIGNED_BYTE, patch);
  }

  // ---------- GPU setup ----------

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {};
  const u = (name) => (uniforms[name] ??= gl.getUniformLocation(program, name));

  const sceneTexture = makeTexture(gl, 0, 1, 1);
  const feedTexture = makeTexture(gl, 1, FEED_W * FEED_COLS, FEED_H * FEED_ROWS);
  const cursorTexture = makeTexture(gl, 2, 1, 1);

  gl.uniform1i(u("uScene"), 0);
  gl.uniform1i(u("uFeeds"), 1);
  gl.uniform1i(u("uCursor"), 2);
  gl.uniform1f(u("uBulge"), BULGE);
  gl.uniform2f(u("uFeedGrid"), FEED_COLS, FEED_ROWS);

  // Replaces a whole texture with a canvas.
  function sendTexture(texture, unit, source) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  // Copies one channel's picture into its cell of the feed grid.
  function sendFeed(channel) {
    if (channel.index >= MAX_CHANNELS) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, feedTexture);
    const x = (channel.index % FEED_COLS) * FEED_W;
    const y = Math.floor(channel.index / FEED_COLS) * FEED_H;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, channel.canvas);
  }

  function sendCursor(kind) {
    const img = hands[kind];
    if (!img.naturalWidth) return;
    hand.width = CURSOR_W * ratio;
    hand.height = CURSOR_H * ratio;
    const c = hand.getContext("2d");
    c.clearRect(0, 0, hand.width, hand.height);
    c.drawImage(img, 0, 0, hand.width, hand.height);
    sendTexture(cursorTexture, 2, hand);
    cursorKind = kind;
  }

  // ---------- Size ----------

  function resize() {
    const box = screen.getBoundingClientRect();
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    W = box.width;
    H = box.height;
    for (const canvas of [output, base, scene]) {
      canvas.width = Math.round(W * ratio);
      canvas.height = Math.round(H * ratio);
    }
    measure();

    gl.viewport(0, 0, output.width, output.height);
    gl.uniform2f(u("uResolution"), output.width, output.height);
    gl.uniform1f(u("uPixelRatio"), ratio);
    gl.uniform1f(u("uCornerRadius"), layout.cornerRadius * ratio);
    gl.uniform1f(u("uTileRadius"), layout.tileRadius * ratio);

    needsResize = false;
    baseDirty = true;
    sendAllFeeds = true;
    cursorKind = "";
  }

  new ResizeObserver(() => (needsResize = true)).observe(screen);
  document.fonts?.ready.then(() => (baseDirty = true));

  // ---------- Mouse ----------
  // The real mouse is passed through the same bend as the picture,
  // so the cursor and hovering line up with what you see.

  const mouse = { x: 0, y: 0, on: false };

  addEventListener("pointermove", (e) => {
    const box = screen.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width * 2 - 1;
    const py = (e.clientY - box.top) / box.height * 2 - 1;
    const bend = 1 + BULGE * (px * px + py * py);
    mouse.on = Math.abs(px * bend) <= 1 && Math.abs(py * bend) <= 1;
    mouse.x = (px * bend * .5 + .5) * W;
    mouse.y = (py * bend * .5 + .5) * H;
  });
  document.addEventListener("pointerleave", () => (mouse.on = false));

  const overRect = (r) => mouse.on && mouse.x >= r.x && mouse.y >= r.y && mouse.x <= r.x + r.w && mouse.y <= r.y + r.h;
  const overCircle = (r) => mouse.on && Math.hypot(mouse.x - (r.x + r.w / 2), mouse.y - (r.y + r.h / 2)) <= r.w / 2;

  // Eases hover sizes toward their targets. Returns the areas that need repainting.
  function updateHover(dt) {
    const ease = 1 - Math.exp(-dt / 60);
    const changed = [];
    const step = (item, target, margin) => {
      if (item.grow === target) return;
      item.grow = Math.abs(target - item.grow) < .0005 ? target : item.grow + (target - item.grow) * ease;
      changed.push([item.x - margin, item.y - margin, item.w + margin * 2, item.h + margin * 2]);
    };
    for (const t of layout.tiles) {
      t.hot = overRect(t);
      step(t, t.hot ? TILE_GROW : 1, t.w * .03 + 30);
    }
    for (const o of layout.orbs) step(o, overCircle(o) ? ORB_GROW : 1, o.w * .04 + 20);
    return changed;
  }

  // ---------- Each frame ----------

  function render(now, changedChannels) {
    const active = !phone.matches;
    screen.classList.toggle("tv", active);
    if (!active) {
      sendAllFeeds = true;
      return;
    }
    if (needsResize) resize();

    const dt = Math.min(64, now - lastTime || 16);
    lastTime = now;
    const changed = updateHover(dt);

    if (clock.minute !== minute) {
      minute = clock.minute;
      baseDirty = true;
    }
    if (baseDirty) {
      paintBase();
      paintScene();
    } else if (changed.length) {
      const x0 = Math.min(...changed.map((r) => r[0]));
      const y0 = Math.min(...changed.map((r) => r[1]));
      const x1 = Math.max(...changed.map((r) => r[0] + r[2]));
      const y1 = Math.max(...changed.map((r) => r[1] + r[3]));
      paintPatch(x0, y0, x1 - x0, y1 - y0);
    }

    (sendAllFeeds ? channels : changedChannels).forEach(sendFeed);
    sendAllFeeds = false;

    const kind = document.documentElement.classList.contains("pressing") ? "fist" : "point";
    if (kind !== cursorKind) sendCursor(kind);

    setUniforms(now, kind);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function setUniforms(now, kind) {
    const tiles = new Float32Array(MAX_CHANNELS * 4);
    layout.tiles.forEach((t, i) => {
      const w = t.w * t.grow, h = t.h * t.grow;
      tiles.set([(t.x + (t.w - w) / 2) / W, (t.y + (t.h - h) / 2) / H, w / W, h / H], i * 4);
    });
    gl.uniform4fv(u("uTiles[0]"), tiles);
    gl.uniform1f(u("uRoll"), still ? .5 : (now % 3200) / 3200);

    const colon = new Float32Array(8);
    colonRects.forEach(([x, y, w, h], i) => colon.set([x / W, y / H, w / W, h / H], i * 4));
    gl.uniform4fv(u("uColon[0]"), colon);
    gl.uniform3fv(u("uColonColor"), parseRgb(getComputedStyle(screen.querySelector("#clock")).color));
    const colonDim = !still && Math.floor(now / 500) % 2 === 1;
    gl.uniform1f(u("uColonAlpha"), colonDim ? .15 : 1);

    const c = CURSORS[kind];
    gl.uniform4f(u("uCursorRect"), (mouse.x - c.hotX) / W, (mouse.y - c.hotY) / H, CURSOR_W / W, CURSOR_H / H);
    gl.uniform1f(u("uCursorOn"), mouse.on && cursorKind ? 1 : 0);

    // A tiny dip in brightness twice every 4 seconds.
    const t = (now % 4000) / 4000;
    const flicker = still ? 1 : t >= .47 && t < .48 ? .97 : t >= .81 && t < .82 ? .98 : 1;
    gl.uniform1f(u("uFlicker"), flicker);
  }

  return { render };
}

// ---------- Small helpers ----------

function buildProgram(gl) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

// An empty texture of the given size, bound to a texture slot.
function makeTexture(gl, unit, width, height) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function loadImage(src, onload) {
  const img = new Image();
  img.onload = onload;
  img.src = src;
  return img;
}

function circle(c, radius, fill) {
  c.beginPath();
  c.arc(0, 0, radius, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function fillShape(c, points, x, y, sx, sy) {
  c.beginPath();
  points.forEach(([px, py], i) => (i ? c.lineTo : c.moveTo).call(c, x + px * sx, y + py * sy));
  c.closePath();
  c.fill();
}

// "rgb(181, 183, 188)" becomes [0.71, 0.72, 0.74]
function parseRgb(text) {
  return text.match(/\d+(\.\d+)?/g).slice(0, 3).map((n) => n / 255);
}
