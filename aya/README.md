# For Aya

A single-file interactive love letter: a code editor that compiles a universe, a lit 3D heart drawn in neon, the personal messages, an opening heart, an "AYA" constellation, an envelope with a folding letter, and the final proposal scene.

* `index.html` is the entire experience: no build step and no libraries. Fonts come from Google Fonts. The music and sound effects are generated live with the Web Audio API, so there are no audio files and no copyright issues.
* To deploy, upload `index.html` to any static host (GitHub Pages, Netlify Drop, Vercel) and share the URL.
* Sound plays only after a tap ("Begin with music" or the Music button). Reduced-motion preferences are respected.
* Testing helpers: add `?speed=4` to the URL to run the timeline faster. Tapping the screen skips a pause, and tapping the code window finishes the typing.
