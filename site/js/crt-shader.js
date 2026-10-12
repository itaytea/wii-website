// GPU code for the TV view. It runs once for every pixel on the screen.

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = vec2(aPosition.x, -aPosition.y) * .5 + .5;  // 0,0 is the top left
    gl_Position = vec4(aPosition, 0., 1.);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uScene;    // the painted page
  uniform sampler2D uFeeds;    // every channel's picture, packed in a grid
  uniform sampler2D uCursor;   // the hand

  uniform vec2 uResolution;    // canvas size in pixels
  uniform float uPixelRatio;
  uniform float uBulge;
  uniform float uCornerRadius;

  uniform vec4 uTiles[12];     // channel rectangles (x, y, width, height from 0 to 1)
  uniform float uTileRadius;
  uniform vec2 uFeedGrid;      // columns and rows in uFeeds
  uniform float uRoll;         // where the light band is, 0 to 1

  uniform vec4 uColon[2];      // the clock colon's two dots
  uniform vec3 uColonColor;
  uniform float uColonAlpha;

  uniform vec4 uCursorRect;
  uniform float uCursorOn;
  uniform float uFlicker;

  // Distance to the edge of a rounded box centered on 0. Negative means inside.
  float roundedBox(vec2 p, vec2 halfSize, float radius) {
    vec2 d = abs(p) - halfSize + radius;
    return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - radius;
  }

  // Where a point sits inside a rectangle, from 0 to 1 on each side.
  vec2 local(vec2 uv, vec4 rect) {
    return (uv - rect.xy) / rect.zw;
  }

  bool inside(vec2 p) {
    return p.x >= 0. && p.y >= 0. && p.x <= 1. && p.y <= 1.;
  }

  void main() {
    // Bend: pixels near the edge read from further out, so the middle bulges.
    vec2 p = vUv * 2. - 1.;
    vec2 uv = p * (1. + uBulge * dot(p, p)) * .5 + .5;
    vec2 px = uv * uResolution;
    float edge = roundedBox(px - uResolution * .5, uResolution * .5, uCornerRadius);

    vec3 color = texture2D(uScene, clamp(uv, 0., 1.)).rgb;

    // Channels: the picture plus a light band, scanlines and darker corners.
    for (int i = 0; i < 12; i++) {
      vec4 tile = uTiles[i];
      if (tile.z <= 0.) continue;
      vec2 lp = local(uv, tile);
      if (!inside(lp)) continue;

      vec2 size = tile.zw * uResolution;
      float border = 2. * uPixelRatio;
      if (roundedBox((lp - .5) * size, size * .5 - border, uTileRadius - border) > 0.) continue;

      float n = float(i);
      vec2 cell = vec2(mod(n, uFeedGrid.x), floor(n / uFeedGrid.x));
      vec3 picture = texture2D(uFeeds, (cell + clamp(lp, .002, .998)) / uFeedGrid).rgb;

      float band = 1. - abs(lp.y - (2.44 - 3. * uRoll)) / .24;
      picture = mix(picture, vec3(1.), .12 * max(band, 0.));
      if (mod(floor(px.y / uPixelRatio), 3.) == 2.) picture *= .84;
      float fromCenter = length((lp - .5) * size) / (.5 * length(size));
      picture *= 1. - .28 * clamp((fromCenter - .55) / .45, 0., 1.);

      color = picture;
    }

    // Clock colon. Drawn here so it can blink without repainting the page.
    for (int i = 0; i < 2; i++) {
      if (inside(local(uv, uColon[i]))) color = mix(color, uColonColor, uColonAlpha);
    }

    // Cursor.
    vec2 cp = local(uv, uCursorRect);
    if (uCursorOn > .5 && inside(cp)) {
      vec4 hand = texture2D(uCursor, cp);
      color = mix(color, hand.rgb, hand.a);
    }

    // Glass: scanlines, colored phosphor stripes, darker edges, glare and flicker.
    if (mod(px.y / uPixelRatio, 3.) < 1.) color *= .96;

    float stripe = mod(floor(gl_FragCoord.x / uPixelRatio), 3.);
    color *= stripe < 1. ? vec3(1.02, .99, .99) : stripe < 2. ? vec3(.99, 1.02, .99) : vec3(.99, .99, 1.02);

    color *= 1. - .2 * smoothstep(.66, 1., length(p / vec2(1.5, 1.4)));
    color *= 1. - .2 * exp(edge / (.05 * uResolution.y));

    float aspect = uResolution.x / uResolution.y;
    float glare = (vUv.x * .342 * aspect + vUv.y * .94) / (.342 * aspect + .94);
    color += .06 * (1. - smoothstep(0., .38, glare));

    color *= uFlicker;

    // Black outside the rounded screen.
    gl_FragColor = vec4(color * (1. - smoothstep(-1., 1., edge)), 1.);
  }
`;
