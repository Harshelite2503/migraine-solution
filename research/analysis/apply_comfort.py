"""Predict comfort (ARAUS models) for Still's sounds at several playback levels, with an applicability check."""
import sys, os, json, numpy as np, pandas as pd, soundfile as sf, joblib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from features import features, calibrate_la
D = sys.argv[1]; LEVELS = [45, 55, 65]; rows = []
for f in sorted(os.listdir(D)):
    if not f.endswith('.wav'): continue
    x, fs = sf.read(os.path.join(D, f)); x = x.mean(1) if x.ndim == 2 else x; x = x[fs*2: fs*12]
    for L in LEVELS:
        ft = features(calibrate_la(x, fs, L), fs); ft.update(sound=f[:-4], level=L); rows.append(ft)
    print(f, flush=True, file=sys.stderr)
F = pd.DataFrame(rows); F.to_csv('still_features.csv', index=False)
out = F[['sound', 'level', 'LAavg_r', 'Navg_r', 'Savg_r']].copy()
for target in ['ISOPl', 'calm']:
    for m in ['ridge', 'gbm']:
        M = joblib.load(f'araus_model_{target}_{m}.joblib'); out[f'{target}_{m}'] = M['model'].predict(F[M['features']])
    # applicability: distance to the training set in standardised feature space (percentile of training self-distances)
    Xt = M['X_train']; mu, sd = Xt.mean(0), Xt.std(0) + 1e-9; Z = (Xt - mu) / sd
    U, S, Vt = np.linalg.svd(Z - Z.mean(0), full_matrices=False); k = 10; P = Z @ Vt[:k].T; var = P.var(0)
    d_train = np.sqrt(((P / np.sqrt(var))**2).sum(1)); q = (F[M['features']].values - mu) / sd @ Vt[:k].T
    d = np.sqrt(((q / np.sqrt(var))**2).sum(1)); out['domain_pct'] = [float((d_train < v).mean() * 100) for v in d]
out.to_csv('still_comfort_predictions.csv', index=False)
pd.set_option('display.width', 200); print(out.round(2).to_string())
