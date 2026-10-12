// The channel tiles and what plays on them.
// Each channel paints its picture onto its own small canvas.
// The flat page shows that canvas directly. The TV view copies it to the GPU.
// Uses STATIC_FPS from settings.js.

// Size of each channel's canvas.
const FEED_W = 288;
const FEED_H = 162;

// Makes one tile per source and adds it to the grid.
// Each channel gets an update(now, still) function that returns true when its picture changed.
function createChannels(grid, sources) {
  return sources.map((source, index) => {
    const tile = document.createElement("div");
    tile.className = "tile";

    const canvas = document.createElement("canvas");
    canvas.width = FEED_W;
    canvas.height = FEED_H;
    tile.append(canvas);
    grid.append(tile);

    const ctx = canvas.getContext("2d");
    return { index, tile, canvas, update: makeFeed(source, ctx) };
  });
}

// Picks the kind of feed from the source text.
// If a picture or video can't be found, the channel shows static instead.
function makeFeed(source, ctx) {
  if (source === "static") return staticFeed(ctx);

  let feed;
  const useStatic = () => {
    console.warn(`Channel file not found: ${source}. Showing static instead.`);
    feed = staticFeed(ctx);
  };
  feed = /\.(mp4|webm|ogv|mov)$/i.test(source)
    ? videoFeed(source, ctx, useStatic)
    : imageFeed(source, ctx, useStatic);
  return (now, still) => feed(now, still);
}

// TV static: grey noise at a low resolution, blown up into square pixels.
function staticFeed(ctx) {
  const small = document.createElement("canvas");
  small.width = FEED_W / 3;
  small.height = FEED_H / 3;
  const smallCtx = small.getContext("2d");
  const noise = smallCtx.createImageData(small.width, small.height);
  let last = -Infinity;

  return (now, still) => {
    const drawnOnce = last > -Infinity;
    if (still ? drawnOnce : now - last < 1000 / STATIC_FPS) return false;
    last = now;

    const px = noise.data;
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.random() * 255 | 0;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    smallCtx.putImageData(noise, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, FEED_W, FEED_H);
    return true;
  };
}

// A picture, cropped to fill the channel.
function imageFeed(src, ctx, onError) {
  const img = new Image();
  let fresh = false;
  img.onload = () => {
    drawCover(ctx, img, img.naturalWidth, img.naturalHeight);
    fresh = true;
  };
  img.onerror = onError;
  img.src = src;

  return () => {
    if (!fresh) return false;
    fresh = false;
    return true;
  };
}

// A muted looping video, cropped to fill the channel.
function videoFeed(src, ctx, onError) {
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.onerror = onError;
  video.src = src;
  video.play().catch(() => {});

  return () => {
    if (video.readyState < 2) return false;
    drawCover(ctx, video, video.videoWidth, video.videoHeight);
    return true;
  };
}

// Draws a picture so it covers the whole canvas, trimming the edges if needed.
function drawCover(ctx, source, w, h) {
  const scale = Math.max(FEED_W / w, FEED_H / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, (FEED_W - dw) / 2, (FEED_H - dh) / 2, dw, dh);
}
