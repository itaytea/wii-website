// The clock and date in the dock.
// Digits are seven-segment shapes, like an LCD. js/tv.js uses the same shapes.

// Segment shapes inside a 50 x 100 box.
// T is the thickness and G the gap between segments.
const T = 7.5, G = 1.2, E = T / 2;

function across(y) {
  const a = E + G, b = 50 - E - G;
  return [[a, y], [a + E, y - E], [b - E, y - E], [b, y], [b - E, y + E], [a + E, y + E]];
}

function down(x, y1, y2) {
  return [[x, y1], [x + E, y1 + E], [x + E, y2 - E], [x, y2], [x - E, y2 - E], [x - E, y1 + E]];
}

const SEGMENTS = {
  a: across(E),               // top
  g: across(50),              // middle
  d: across(100 - E),         // bottom
  f: down(E, E + G, 50 - G),  // top left
  b: down(50 - E, E + G, 50 - G),
  e: down(E, 50 + G, 100 - E - G),
  c: down(50 - E, 50 + G, 100 - E - G),
};

// Which segments light up for each digit, 0 to 9.
const DIGITS = ["abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgedc", "abc", "abcdefg", "abcdfg"];

// The colon's two dots inside a 12 x 100 box, as [x, y, width, height].
const COLON_DOTS = [[2, 26, 8, 8], [2, 66, 8, 8]];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function digitSvg(n) {
  const shapes = n == null ? "" : [...DIGITS[n]]
    .map((s) => `<polygon points="${SEGMENTS[s].join(" ")}"/>`)
    .join("");
  return `<svg class="seg" data-digit="${n ?? ""}" viewBox="0 0 50 100" aria-hidden="true">${shapes}</svg>`;
}

function colonSvg() {
  const dots = COLON_DOTS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join("");
  return `<svg class="seg colon" viewBox="0 0 12 100" aria-hidden="true">${dots}</svg>`;
}

// Fills in the clock and date, then keeps them up to date.
// Returns an object whose "minute" changes every minute, so other code can tell when to redraw.
function startClock(clockEl, dateEl) {
  const state = { minute: "" };

  function tick() {
    const now = new Date();
    const h24 = now.getHours();
    const h = h24 % 12 || 12;
    const m = now.getMinutes();
    const ampm = h24 >= 12 ? "PM" : "AM";
    const minute = `${h}:${String(m).padStart(2, "0")} ${ampm}`;
    if (minute === state.minute) return;

    state.minute = minute;
    // A blank first digit keeps the clock the same width for hours below 10.
    clockEl.innerHTML =
      digitSvg(h >= 10 ? 1 : null) + digitSvg(h % 10) + colonSvg() +
      digitSvg(Math.floor(m / 10)) + digitSvg(m % 10) +
      `<small>${ampm}</small>`;
    clockEl.setAttribute("aria-label", minute);
    dateEl.textContent = `${DAYS[now.getDay()]} ${now.getMonth() + 1}/${now.getDate()}`;
  }

  tick();
  setInterval(tick, 1000);
  return state;
}
