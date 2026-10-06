# 声调钓鱼 (Tone Fishing)

A browser game for practising Mandarin tones. The player reads a character aloud; the
game tracks the pitch contour (F0) of their voice, compares its shape with the target
tone, charges the fishing rod in real time, and casts. Correct tone → fish. Wrong tone → trash.

All player-facing text is Chinese. Everything runs locally in the browser: no backend,
no recording, no upload.

## Project layout

```
index.html              page structure (Chinese UI text)
style.css               layout and look
js/
  main.js               wiring + main loop
  config.js             ALL tunable thresholds
  audio/
    microphone.js       getUserMedia → 1 kHz low-pass → AnalyserNode
    pitchDetector.js    YIN F0 estimator + adaptive noise gate
    segmenter.js        splits the frame stream into utterances
    toneClassifier.js   contour cleanup, normalisation, DTW tone matching, confidence
    toneSynth.js        synthetic voice for 听声调示范 and 示范模式
    sfx.js              synthesised sound effects
  game/
    gameState.js        round flow (listen → charge → verdict → cast → result)
    power.js            live power-bar logic
    fishing.js          canvas lake scene + cast animation
    targetGenerator.js  word choice + random fish/trash placement
    scoring.js          score and combo
  ui/
    ui.js               DOM updates
    pitchGraph.js       目标声调 vs 你的发音 graph
    toneGlyph.js        small SVG tone curves
  data/
    vocabulary.js       words, pinyin, tones, levels
    tones.js            tone models on the Chao 1–5 scale, names, colours
    strings.js          every Chinese UI string
tests/                  offline tests (Node 18+)
tools/build.mjs         bundles everything into one HTML file
dist/                   built single-file versions
```

## How tone detection works

1. **F0 per frame** — YIN on the newest ~45 ms of audio, decimated to ~12 kHz,
   60 times per second. Range 50–600 Hz.
2. **Voicing** — a frame counts only if it is louder than an adaptive noise floor and
   YIN's clarity (1 − CMND) is above `minClarity`.
3. **Segmentation** — an utterance starts after 3 voiced frames and ends after
   230 ms of silence.
4. **Cleanup** — weak onset/tail frames dropped, octave jumps repaired, 5-point
   median filter.
5. **Normalisation** — F0 converted to semitones, resampled to 24 points in time,
   mean removed. The comparison depends on shape, not on the speaker's pitch.
6. **Matching** — each tone template (55, 35, 214, 51 on the Chao scale) is scaled
   within limits, then compared by banded DTW. A turning-point feature separates
   the 2nd tone (rises from the start) from the 3rd (dips first).
7. **Decision** — soft posterior over the four tones, multiplied by signal quality.
   Below `minConfidence` the result is `unknown` and the game says 请再说一次
   instead of guessing.

While the player is still speaking, the same comparison runs against the *opening
part* of each template to drive the power bar. Live charging stops at 86%; only a
confirmed correct tone at the end of the utterance fills it and casts.

---

## 1. Running the game locally

The modular version uses ES modules, so it needs a local web server (browsers block
modules from `file://`):

```bash
cd tone-fishing
python3 -m http.server 8000
# open http://localhost:8000
```

Or with Node: `npx serve .`

**No server at all:** open `dist/tone-fishing.html` by double-clicking it. It is the
same game bundled into one file. Rebuild it after code changes with
`node tools/build.mjs`.

## 2. Granting microphone permission

Click 开始游戏. The browser asks for the microphone; choose Allow.

- Browsers only allow the microphone on `https://` pages, `http://localhost`, or a
  local file. On a plain `http://` address on your network, the game shows
  当前页面无法使用麦克风 instead.
- If you clicked Block, re-enable it from the padlock / site-settings icon in the
  address bar, then press 重新尝试.
- With no microphone, 使用示范声音 starts 示范模式: buttons make a synthetic voice
  say the right or a wrong tone, so you can demonstrate the game on a projector.

## 3. Deploying as a static website

Upload the folder as-is (`index.html`, `style.css`, `js/`) or just
`dist/tone-fishing.html` renamed to `index.html`. No build step is required.

- **GitHub Pages:** push to a repo → Settings → Pages → deploy from the branch root.
- **Netlify / Cloudflare Pages:** drag the folder into the dashboard, or connect the
  repo with no build command and the root as the output directory.

All of these serve over https, so the microphone works.

Fonts load from Google Fonts with system fallbacks (PingFang SC, Microsoft YaHei,
Songti SC). Where Google Fonts is blocked (e.g. mainland China networks) the game
looks slightly different but works the same. To make it fully self-contained,
download the font files into `assets/` and replace the Google Fonts `<link>`
with `@font-face` rules.

## 4. Testing microphone functionality

- The five bars next to 得分 are a live level meter. They turn green when sound
  passes the gate and orange when the frame is recognised as voiced (pitch found).
- Hum a steady note: bars go orange and the graph draws a flat line.
- Say 妈 / 马 and watch the 你的发音 curve follow the 目标声调 curve.
- If bars never light: check the OS input device and site permission.
- If bars light but never turn orange: noise is too high or the voice too quiet.
  Try 设置 → 麦克风灵敏度 → 高.
- If background noise triggers 正在听……: set 麦克风灵敏度 to 低.

Offline tests (no browser, no mic):

```bash
node tests/classifier.test.mjs   # 432 synthetic voices: tone accuracy + false passes
node tests/stress.test.mjs       # quiet / noisy / slow speech, live power bar
node tests/ui-language.test.mjs  # no English in player-facing text
```

Current results: 99.3% correct on the synthetic set, zero false passes, noise bursts
never classified as a tone.

## 5. Adding new vocabulary

Edit `js/data/vocabulary.js`:

```js
one('猫', 'māo', 1, 2),   // hanzi, pinyin with tone mark, tone 1-4, level
```

Levels 1 and 2 are single syllables and playable. Level 2 includes all level 1
words. Multi-syllable entries use the `syllables` array form (see 你好); levels 3–4
are locked in the menu until per-syllable segmentation is added.

Run `node tests/ui-language.test.mjs` afterwards; it knows every pinyin in the
vocabulary, so new pinyin is accepted automatically.

## 6. Adjusting tone-classification thresholds

All numbers are in `js/config.js`:

| Setting | Effect |
|---|---|
| `strictness.*` | What counts as correct. Players switch between 宽松 / 标准 / 严格 in 设置. |
| `tone.minConfidence` | Higher → more 请再说一次, fewer wrong verdicts on unclear audio. |
| `tone.sigma` | Lower → sharper decisions between tones. |
| `tone.scaleMin` / `scaleMax` | How compressed or exaggerated a contour can be and still match. Raise `scaleMin` to demand clearer pitch movement. |
| `tone.chaoToSemitone` | Assumed size of one Chao step (1.8 st). Raise for expressive speakers. |
| `pitch.minClarity` | Voicing strictness. Lower for breathy or creaky voices. |
| `pitch.minRms` | Absolute loudness floor (scaled by 麦克风灵敏度). |
| `segment.releaseMs` | Silence that ends an utterance. Raise for slow speakers. |
| `power.chargeRate` / `liveCap` | How quickly the bar fills while speaking. |
| `game.attemptsPerRound` | Tries before the cast goes to trash. |

The tone shapes themselves are in `js/data/tones.js`. After any change, run the
tests in section 4.

Known limits: real learner speech varies more than the synthetic test set. A creaky
3rd tone from low voices can lose its low point (voicing drops out), and a very short
3rd tone may read as 2nd. Tune with real students, starting from 宽松.

## 7. Testing on mobile browsers

- Deploy over https first (section 3). Phones will not grant the microphone on
  plain `http://` LAN addresses.
- For quick testing from a laptop, `npx localtunnel --port 8000` or
  `cloudflared tunnel --url http://localhost:8000` gives an https URL to open on
  the phone.
- **iOS Safari:** audio starts only after a tap, which 开始游戏 provides. If the
  phone is in silent mode, effects and 听声调示范 are muted but detection still works.
- **Android Chrome:** permission prompt appears on first start; manage it later under
  Site settings → Microphone.
- Hold the phone 20–30 cm from your mouth. Headphones avoid the demo tone leaking
  back into the microphone (the game also ignores the microphone while it plays).
- Layout stacks to one column below 860 px wide.
