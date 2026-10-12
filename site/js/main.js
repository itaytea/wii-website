// Starts everything. Runs last, after the other scripts.

const screenEl = document.querySelector(".screen");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

// What each channel shows. Channels not set in settings.js get static.
const sources = Array.from({ length: CHANNEL_COUNT }, (_, i) => CHANNELS[i + 1] ?? "static");

const clock = startClock(document.getElementById("clock"), document.getElementById("date"));
const channels = createChannels(document.getElementById("channels"), sources);
const tv = startTV(screenEl, channels, clock);   // null when the TV view can't run

// Fist cursor while the mouse button is held down.
const root = document.documentElement;
addEventListener("pointerdown", () => root.classList.add("pressing"));
for (const type of ["pointerup", "pointercancel", "blur"]) {
  addEventListener(type, () => root.classList.remove("pressing"));
}

// One loop for everything: update the channel pictures, then draw the TV view.
function frame(now) {
  const changed = channels.filter((channel) => channel.update(now, still));
  tv?.render(now, changed);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
