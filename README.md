# Channel Menu

A channel menu that looks like an old TV. Everything in the `site` folder is the website.

## Files

- `site/index.html` is the page.
- `site/style.css` has the colors, sizes and layout.
- `site/js/settings.js` has the things you are most likely to change.
- `site/js/channels.js` makes the channel tiles and plays what is on them.
- `site/js/clock.js` runs the clock and date.
- `site/js/tv.js` and `site/js/crt-shader.js` draw the bulging TV screen on computers and tablets.
- `site/images` holds the background texture, the cursors and the tab icon.

## Changing what a channel shows

Every channel shows static unless you say otherwise. To change one, open `site/js/settings.js` and add it to `CHANNELS` by its number. Channels are numbered 1 to 12, left to right, top to bottom.

```js
export const CHANNELS = {
  1: "images/cat.png",
  2: "videos/intro.mp4",
};
```

With those two lines, channel 1 shows the picture, channel 2 plays the video (muted and looping), and the other 10 show static.

Put the picture or video inside the `site` folder and use its path from there.

If a file can't be found, that channel shows static and the browser console says which file is missing.

## Viewing it on your computer

You can double-click `site/index.html` to open it. Browsers block the bulging TV effect on files opened this way, so you get the flat version.

To see the full effect, run a small local server from this folder and open http://localhost:8000:

```
python3 -m http.server 8000 --directory site
```

## Publishing to Neocities

Upload everything inside `site`, keeping the folders as they are. `index.html` should end up at the top level of your Neocities site.

In the browser: open your Neocities dashboard, then drag the contents of `site` into the file area.

From the terminal, with the Neocities command line tool:

```
gem install neocities
neocities push site
```

The first push asks you to log in.

Neocities free accounts may not allow video files. Pictures work on every plan.
