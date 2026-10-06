# 声调钓鱼 (Tone Fishing)

A browser game for practising Mandarin tones. It starts with a short lesson
(声调课堂) that teaches the four tones one at a time; then the player reads characters
aloud, the game tracks the pitch contour (F0) of their voice, compares its shape with
the target tone, charges the fishing rod in real time, and casts. Correct tone → fish.
Wrong tone → trash, with a concrete hint about what to change.

All player-facing text is Chinese. Everything runs locally in the browser: no backend,
no recording, no upload.

## Project layout

```
index.html              page structure (Chinese UI text)
style.css               layout and look
js/
  main.js               wiring, screens (title → lesson → game), main loop
  config.js             ALL tunable thresholds
  diagnostics.js        last 12 attempts as pitch numbers (设置 → 声音诊断)
  audio/
    microphone.js       getUserMedia → 55 Hz high-pass ×2 → 1 kHz low-pass → AudioWorklet tap (10 ms)
    pitchDetector.js    YIN F0 estimator, sub-harmonic guard, minimum-statistics noise gate
    segmenter.js        splits the frame stream into utterances
    toneClassifier.js   continuity tracking, normalisation, DTW over tone variants, shape features, confidence
    toneSynth.js        synthetic voice for 听声调示范 and 示范模式
    speech.js           browser Mandarin voice fallback for words without a recording
    clips.js            native-speaker recordings: decode, play, speaker rotation, listening sets
    sfx.js              synthesised sound effects
  game/
    gameState.js        round flow (listen → charge → verdict → cast → result)
    power.js            live power-bar logic
    fishing.js          canvas lake scene + cast animation
    targetGenerator.js  word choice + random fish/trash placement
    scoring.js          score and combo
  lesson/
    lesson.js           声调课堂 flow: steps × phases (看一看 / 听一听 / 说一说)
    lessonData.js       lesson text, step order, gestures, example words
    hints.js            contour features → one sentence about what to change
  ui/
    ui.js               DOM updates
    toneAnim.js         contour drawn in step with audio + moving hand marker
    pitchGraph.js       目标声调 vs 你的发音 graph
    toneGlyph.js        small SVG tone curves
  data/
    vocabulary.js       words, pinyin, tones, levels
    tones.js            tone models on the Chao 1–5 scale, names, colours
    strings.js          every Chinese UI string
    audioBank.js        generated: native recordings (base64 MP3)
    pinyin.js           numbered → tone-marked pinyin
assets/audio/           the same recordings as files + CREDITS.md
tests/                  offline tests (Node 18+); real-voice tests need tests/fetch-real-data.py
tools/build.mjs         bundles everything into one HTML file
dist/                   built single-file versions
```

## How tone detection works

1. **Filtering** — two 55 Hz high-pass stages remove mains hum and desk rumble; a
   1 kHz low-pass keeps the voice's fundamental and low harmonics.
2. **Fixed analysis rate** — an AudioWorklet hands over every 10 ms of audio, so
   analysis does not depend on the screen's frame rate. (Browsers without
   AudioWorklet fall back to once per animation frame.)
3. **F0 per frame** — YIN on the newest ~45 ms, decimated to ~12 kHz, 60–600 Hz.
   A sub-harmonic guard prefers the true period when a dip at 2×–8× the period
   sneaks under the threshold (this happens at every onset and offset).
4. **Voicing** — a frame counts only if YIN's clarity is high and it is 2.5× louder
   than the background. The background level is tracked by minimum statistics
   (falls fast, rises over ~6 s), and continuous periodic sound longer than 2.5 s
   (a hum, a machine) is learned as background.
5. **Segmentation** — an utterance starts after 3 voiced frames and ends after
   230 ms of silence.
6. **Continuity tracking** — the pitch track is split wherever it jumps more than
   3 semitones between frames (a voice cannot). The loudest run is the anchor;
   neighbouring runs are joined if they line up directly or after an octave
   correction (×2, ×3), otherwise dropped. This removes stray frames and repairs
   the creaky low part of the 3rd tone.
7. **Normalisation** — semitones, resampled to 24 points, mean removed. The
   comparison depends on shape, not the speaker's pitch.
8. **Matching** — each tone has 2–3 accepted variants measured from native speech
   (e.g. a 2nd tone with a small dip before the rise; a "half third" whose rise is
   faint). Each variant is scaled and compared by banded DTW. Shape features (dip
   depth and position, late rise, range, time spent low) add penalties that
   separate the 2nd and 3rd tones and the low 3rd from the 4th.
9. **Decision** — soft posterior over the four tones × signal quality. Below
   `minConfidence` the result is `unknown` and the game says 请再说一次.

### Measured accuracy

On 309 real recordings from three native speakers (`node tests/real.test.mjs`),
judged with the 标准 setting:

| Condition | Before (v1) | Now |
|---|---|---|
| Clean | 53% | 92% |
| Lower voice (pitch ×0.8) | 77% | 92% |
| Higher voice (pitch ×1.25) | 50% | 89% |
| Quiet microphone | 58% | 93% |
| Noisy room | 53% | 92% |

Wrong tones accepted as correct: about 2% of cross-checks. 宽松 accepts ~95% with
~3% false passes; 严格 accepts ~86% with ~1%.

The v1 failures came from four bugs that synthetic test voices did not have:
stray sub-harmonic frames (≈50 Hz) at syllable edges, low-frequency rumble being
treated as voice, the end of falling tones being trimmed away, and a noise gate
that rose above quiet speech.

## 声调课堂 (the lesson)

First press of 开始游戏 runs the lesson; afterwards it is on the title screen as
声调课堂. The design follows a literature review on teaching Mandarin tones to
adult speakers of non-tonal languages (Turkish in particular). How each finding
shows up in the lesson:

| Finding | In the lesson |
|---|---|
| Learners hear *pitch height*, not *movement*; teach where a tone starts, goes and ends | Every tone is introduced as 起点 / 走向 / 终点 and a one-word movement (平 · 降 · 升 · 折). The intro says to listen to how the voice moves, not how high it is. |
| Difficulty order T1 ≈ T4 > T3 > T2; the 2nd/3rd contrast is the hardest and longest-lasting | Order is 第一声 → 第四声 → 第二声 → 第三声 → 二声·三声 → 综合. The 3rd-tone step shows the 2nd/3rd difference side by side ("区别在开头：往上，还是往下？"); its listening set is 2nd vs 3rd only; step 5 is a minimal-pair drill (same syllable, same speaker) plus saying 麻/马 and 鱼/雨. |
| Perception before production | Each tone (after the first) has 听一听 (pick the tone you heard) before 说一说. Below 75% the lesson suggests another set. |
| Visual contours beat audio alone; dynamic contours show movement | 看一看 draws the contour while the recording plays, in step with it. |
| Congruency: a visual that does not match the sound harms learning | Only the tone being heard is ever animated. Listening feedback replays the same clip while its contour is drawn. A failed spoken attempt shows the learner's real pitch curve against the target, then replays the model with its contour. |
| Pitch gestures (embodied cognition) help, even just watching them | A hand marker moves along the contour; each tone has a gesture instruction (e.g. 第三声：手先往下压到腰部，停一下，再慢慢抬起来). Drawing the tone is left to the teacher in class (demonstrating in front of everyone is more practical than having each student draw on a device). |
| Consistent colour as a mnemonic | Fixed colours everywhere: 1 red, 2 orange, 3 green, 4 blue. |
| High-variability perceptual training | Recordings from three native speakers, rotated on every play (发音人一/二/三). |
| Low extraneous load (no split attention, progressive disclosure) | One card per activity with sound, contour, colour and gesture together; only the tones taught so far appear as answer options. |

Phases per tone: 看一看 → 听一听 → 说一说. 说一说 needs one correct word to
continue; after 2 misses 换一个字 appears, after 3 跳过这一步.

Native recordings live in `js/data/audioBank.js` (144 clips, ~500 KB), built by
`node tools/build-audio.mjs ../realdata` from the test recordings. Credits and licences:
`assets/audio/CREDITS.md` (speakers A and C: CC BY-SA, speaker B: public domain).
In 示范模式 the demo buttons play these recordings into the detector.

The same pronunciation hints appear in the game when a cast fails.
`node tests/hints.test.mjs` prints which hint each wrong-tone pairing produces.

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

- **设置 → 声音诊断** shows what the last attempt was heard as (tone, pitch range,
  voiced frames, confidence). **复制诊断数据** copies the last 12 attempts as
  numbers only (pitch track, levels, verdicts; no audio). If recognition is off
  for someone, paste that data to the developer: it is enough to see why.
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
node tests/classifier.test.mjs   # 432 synthetic learner-style voices
node tests/stress.test.mjs       # quiet / noisy / slow synthetic speech, live power bar
node tests/ui-language.test.mjs  # no English in player-facing text (UI, lesson, hints)

python3 tests/fetch-real-data.py ../realdata   # once: 309 real recordings (git + ffmpeg)
node tests/real.test.mjs         # real voices × 5 conditions (STRICT=lenient|strict, -v for misses)
node tests/real-live.test.mjs    # live power bar on real voices
node tests/hints.test.mjs        # which hint each wrong tone produces
```

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

Lesson words live in `js/lesson/lessonData.js` (`LESSON_TONES[n].words`, with a
`syl` field for matching recordings); the first word of each tone is the one the
learner reads first. To add recordings, extend the lists in `tools/build-audio.mjs`
and rerun it.

## 6. Adjusting tone-classification thresholds

All numbers are in `js/config.js`:

| Setting | Effect |
|---|---|
| `strictness.*` | What counts as correct. Players switch between 宽松 / 标准 / 严格 in 设置. |
| `tone.minConfidence` | Higher → more 请再说一次, fewer wrong verdicts on unclear audio. |
| `tone.sigma` | Lower → sharper decisions between tones. |
| `tone.scaleMin` / `scaleMax` | How compressed or exaggerated a contour can be and still match. Raise `scaleMin` to demand clearer pitch movement. |
| `tone` variants in `data/tones.js` | Accepted shapes per tone. Add one if a common pronunciation is rejected. |
| `tone.chaoToSemitone` | Assumed size of one Chao step (1.8 st). Raise for expressive speakers. |
| `pitch.minClarity` | Voicing strictness. Lower for breathy or creaky voices. |
| `pitch.minRms` | Absolute loudness floor (scaled by 麦克风灵敏度). |
| `pitch.noiseRatio` | How far above the background a voice must be. Raise for noisy rooms. |
| `segment.releaseMs` | Silence that ends an utterance. Raise for slow speakers. |
| `power.chargeRate` / `liveCap` | How quickly the bar fills while speaking. |
| `game.attemptsPerRound` | Tries before the cast goes to trash. |

The tone shapes themselves are in `js/data/tones.js`. After any change, run the
tests in section 4.

Known limits: the test speakers are natives; learners vary more. Very short
syllables (under ~0.2 s) with a late, fast rise can still be misread, so ask
students to stretch each syllable a little. The lesson text already says so.
If one student is consistently misread, copy 声音诊断 data from their device.

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
