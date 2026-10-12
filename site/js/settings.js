// Things you might want to change.

// How many channels there are. The grid fits 12.
const CHANNEL_COUNT = 12;

// Channels that show something other than static.
// Channels are numbered 1 to 12, left to right, top to bottom.
// Any channel not listed here shows static.
// Use a path to a picture or video. Videos play muted and loop.
// Remove the // in front of a line to use it.
const CHANNELS = {
  1: "images/cat.png",
  2: "videos/intro.mp4",
};

// How much the TV screen bulges. 0 is flat.
const BULGE = 0.03;

// How many times a second the static changes.
const STATIC_FPS = 20;
