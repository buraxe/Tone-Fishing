// Central tuning knobs. Every threshold the game uses lives here so a teacher
// or developer can retune detection without touching the DSP code.

export const CONFIG = {
  pitch: {
    fMin: 50,            // Hz, lowest F0 searched (low male voice, creaky 3rd tone)
    fMax: 600,           // Hz, highest F0 searched (child / high female voice)
    yinThreshold: 0.15,  // YIN absolute threshold on the CMND function
    minClarity: 0.55,    // 1 - CMND at the chosen lag; below this the frame is unvoiced
    minRms: 0.004,       // absolute level gate (~ -48 dBFS); scaled by the sensitivity setting
    noiseRatio: 3.0,     // frame must be this many times louder than the adaptive noise floor
    targetRate: 12000,   // analysis rate after decimation
  },

  segment: {
    onsetFrames: 3,      // consecutive voiced frames needed to start an utterance
    releaseMs: 230,      // silence after the last voiced frame that ends an utterance
    maxMs: 1800,         // hard stop for one utterance
    minVoicedMs: 110,    // shorter voiced runs are rejected as "请再说一次"
  },

  tone: {
    points: 24,          // contour resample length
    chaoToSemitone: 1.8, // one step on the Chao 1-5 scale, in semitones
    scaleMin: 0.7,       // allowed compression of a template (narrow speakers)
    scaleMax: 1.8,       // allowed expansion (expressive speakers)
    dtwBand: 3,          // Sakoe-Chiba band, in resampled points
    sigma: 0.45,         // semitones; softness of the tone posterior
    scoreWidth: 1.5,     // semitones; how fast the 0-100 match score decays
    maxFitDistance: 2.6, // if no template fits better than this, return unknown
    minConfidence: 0.42, // below this the verdict is "unknown"
  },

  // Pass rules per strictness level (设置 → 判定标准)
  strictness: {
    lenient:  { minTargetProb: 0.34, minScore: 52, requireTop: false },
    standard: { minTargetProb: 0.50, minScore: 62, requireTop: true },
    strict:   { minTargetProb: 0.66, minScore: 76, requireTop: true },
  },

  // Microphone sensitivity presets (设置 → 麦克风灵敏度): multiplier on minRms
  sensitivity: { high: 0.5, medium: 1, low: 2 },

  power: {
    minLiveMs: 130,      // voiced time before live charging starts
    chargeRate: 0.9,     // max fill per second while the live match is strong
    drainRate: 0.12,     // drain per second while the contour clearly conflicts
    liveCap: 0.86,       // live charging stops here; the final verdict fills the rest
    wrongKeep: 0.5,      // fraction of power kept after a wrong attempt
  },

  game: {
    attemptsPerRound: 3,
    basePoints: 100,
    comboBonus: 20,      // extra points per combo step
    comboBonusCap: 5,    // bonus stops growing after this many steps
    autoNextMs: 2600,
  },
};
