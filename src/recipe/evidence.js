// The research each recipe rule rests on. Condensed from Still's fact-checked strategy
// (still-sound-lab docs/product-strategy.md). Strength: strong | moderate | weak | preliminary.
// These describe group findings; Still uses them as cautious starting points, then measures you.

export const EVIDENCE = {
  ashkenazi2009: {
    finding: 'People with migraine found tones unpleasant at about 90 dB vs 106 dB in controls, and at about 76 dB during attacks: roughly 15 dB lower in an attack.',
    citation: 'Ashkenazi et al. 2009, Cephalalgia',
    strength: 'moderate',
  },
  vingen1998: {
    finding: 'Sound tolerance was lower during and between attacks, and did not track attack frequency, duration or severity, so tolerance has to be measured per person.',
    citation: 'Vingen et al. 1998, Cephalalgia',
    strength: 'moderate',
  },
  mourgela2023: {
    finding: 'In a browser headphone test, the comfortable range was narrower at 12 of 13 tones from 100 Hz to 12 kHz in migraine, most in the mid-high range; 100 Hz was the exception.',
    citation: 'Mourgela, Vikelis & Reiss 2023, Ear and Hearing',
    strength: 'moderate',
  },
  kumar2008: {
    finding: 'Among unpleasant sounds, unpleasantness concentrates at about 2.5–5.5 kHz with 1–16 Hz modulation.',
    citation: 'Kumar et al. 2008, JASA',
    strength: 'moderate',
  },
  hongisto2015: {
    finding: 'At a quiet level, a noise sloping about −7 dB per octave (slightly darker than brown noise) was rated most satisfying; other studies conflict, so tilt is personalised.',
    citation: 'Hongisto et al. 2015, JASA',
    strength: 'weak',
  },
  virjonen2019: {
    finding: 'Loudness fluctuation at 1–16 Hz added annoyance equal to 4–12 dB more level; only about 0.25 Hz at 1 dB depth carried no penalty.',
    citation: 'Virjonen et al. 2019, JASA; Schäffer et al. 2018',
    strength: 'moderate',
  },
  roughness: {
    finding: 'Roughness (partials beating 30–150 Hz apart within one hearing band) is disliked across cultures; consonance preference is learned.',
    citation: 'Arnal et al. 2015, Current Biology; McDermott et al. 2016, Nature',
    strength: 'moderate',
  },
  ambrosini2003: {
    finding: 'Between attacks, the brain\'s response grows more steeply with loudness, which supports slow onsets and avoiding sudden level changes.',
    citation: 'Ambrosini et al. 2003, Brain (mechanism contested)',
    strength: 'weak',
  },
  jaimes2025: {
    finding: 'People sensitive in several senses more often reported dizziness and vertigo; a narrower, more centred stereo image is a cautious choice for them.',
    citation: 'Jaimes et al. 2025, Brain and Behavior',
    strength: 'preliminary',
  },
  ikumi2024: {
    finding: 'In a small diary study, sound sensitivity rose with headache intensity mainly when anxiety was high.',
    citation: 'Ikumi et al. 2024, Cephalalgia (n=6)',
    strength: 'preliminary',
  },
  munjal2020: {
    finding: 'Sound was the single most bothersome migraine symptom for about 23% of people; those people need a more conservative start.',
    citation: 'Munjal et al. 2020, Headache (MAST, n=6,045)',
    strength: 'strong',
  },
  ichd3: {
    finding: 'Sound sensitivity is part of migraine for many people but not required for the diagnosis, so some people tolerate more sound than others.',
    citation: 'ICHD-3, International Headache Society 2018',
    strength: 'strong',
  },
  aras: {
    finding: 'Acoustic features explained only a modest share of how pleasant listeners found a sound; personal differences are large.',
    citation: 'Ooi et al. 2023 (ARAUS, 25,440 ratings)',
    strength: 'moderate',
  },
  nielsen2015: {
    finding: 'Pairwise preference learning tuned four audio settings in about 10–20 comparisons, and listeners preferred the result over a clinical fit.',
    citation: 'Nielsen, Nielsen & Larsen 2015, IEEE/ACM TASLP',
    strength: 'moderate',
  },
  whoSafeListening: {
    finding: 'Safe listening: about 80 dB(A) for 40 hours a week for adults, 75 dB(A) for sensitive groups; use sleep timers and low levels.',
    citation: 'WHO–ITU H.870 (2022)',
    strength: 'strong',
  },
  jespersen2022: {
    finding: 'Daily music listening of 25–60 minutes improved self-rated sleep in insomnia.',
    citation: 'Jespersen et al. 2022, Cochrane',
    strength: 'moderate',
  },
  buxton2021: {
    finding: 'Across many studies, natural sounds lowered stress and annoyance, and water sounds showed the largest health and mood benefits, though results varied widely between studies.',
    citation: 'Buxton et al. 2021, PNAS (meta-analysis)',
    strength: 'weak',
  },
  arausWater: {
    finding: 'Added to city noise, birdsong raised pleasantness for most listeners but water sounds did for only about one in five, so whether water soothes depends on the person.',
    citation: 'Ooi et al. 2023 (ARAUS); Still strategy review',
    strength: 'moderate',
  },
  stillLab2026: {
    finding: 'Scored against 287 natural sounds rated by 685 people, at equal loudness, soft rain was the most comfortable of Still\'s sounds and adding a steady hum made any sound clearly less pleasant.',
    citation: 'Still comfort study 2026 (ARAUS ratings, Wav2Vec-BERT and TRIBE v2 models)',
    strength: 'weak',
  },
  personal: {
    finding: 'Measured from your own choices in Still.',
    citation: 'Your listening tests',
    strength: 'personal',
  },
};
