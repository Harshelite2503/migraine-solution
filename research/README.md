# Still comfort study (November 2026)

Can we tell, without a lab, whether Still's sounds feel comfortable to the human ear and brain?
This folder holds the code, result tables and report for that question.

- **Report:** `report/still-evidence.html` (open in a browser)
- **What changed in the app because of it:** no hum by default, soft rain as the default texture

## The four parts

| Part | Script | Data | Output |
|---|---|---|---|
| Migraine sound tolerance by frequency | `analysis/migraine_layer.py` | Mourgela, Vikelis & Reiss 2023, raw data (github.com/amourgela/supplementalmaterial) | `results/migraine_layer.json` |
| Comfort model from human ratings | `analysis/comfort_model.py`, `analysis/masker_effects.py` | ARAUS (Ooi et al. 2023, CC BY-NC 4.0) `responses.csv`, `maskers.csv` | `results/araus_model.json`, `results/masker_effects.csv` |
| Acoustic features, checked against ARAUS | `analysis/features.py`, `analysis/validate_features.py` | ARAUS masker audio | `results/feature_validation.csv`, `results/band_correction.json` |
| Hearing and brain models | `vm/setup.sh`, `vm/job.py` (on a 16-core VM), then `analysis/brain_analysis.py` | TRIBE v2 (facebook/tribev2, CC BY-NC 4.0), Wav2Vec-BERT 2.0, OpenNeuro ds002725 | `results/brain_results.json`, `results/still_brain_comfort.csv`, `results/ds002725_brain_comfort.csv` |
| Music label check | `analysis/ds002725_check.py` | ds002725 generated music | `results/ds002725_acoustics.csv` |
| Still's sounds | `analysis/render_grid.mjs`, `analysis/apply_comfort.py` | rendered by the app's own engine | `results/still_features.csv`, `results/still_comfort_predictions.csv` |

## Reproduce

1. Python 3.11+ with `numpy scipy pandas scikit-learn joblib soundfile mosqito openpyxl`; Node 20+ for `render_grid.mjs`.
2. Download the data above into `data/` (it is not stored here; ARAUS and TRIBE v2 are non-commercial licences).
3. `node analysis/render_grid.mjs <out-dir>` renders the 34 Still sounds.
4. Brain models: on a Linux VM with 16 cores and 64 GB RAM, run `vm/setup.sh` with the stimuli in place (it installs TRIBE v2 audio-only and runs `vm/job.py`). About 3.5 machine-hours on CPU.
5. `analysis/brain_analysis.py <results-pass-1> <results-pass-2>`, with `destrieux_fsavg5.npz` (Destrieux atlas on fsaverage5, from nilearn) beside it and `ARAUS_MASKERS` pointing at `maskers.csv`.

## Limits

No dataset measured pain, and the models predict an average listener without migraine. See the report's limits section.
