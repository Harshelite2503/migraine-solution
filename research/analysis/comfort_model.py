"""Comfort model trained on ARAUS (Ooi et al. 2023, IEEE Trans. Affective Computing; CC BY-NC 4.0, research use).
Targets: ISO 12913 pleasantness (ISOPl, -1..1) and the 'calm' rating (1..5).
Features are restricted to those defined by standards that MoSQITo implements the same way
(A-weighted 1/3-octave levels, LAeq, ISO 532-1 loudness, DIN 45692 sharpness), so the model can be
applied to new sounds. A 'full' model with tool-specific roughness/fluctuation/tonality is a reference."""
import sys, json, numpy as np, pandas as pd, joblib
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_absolute_error
R = pd.read_csv(sys.argv[1]); OUT = sys.argv[2]
R = R[R.fold_r.between(0, 5)]                 # ARAUSv1 folds: 0 = test, 1..5 = cross-validation
W = dict(pleasant=1, chaotic=-np.sqrt(.5), vibrant=np.sqrt(.5), calm=np.sqrt(.5), annoying=-1, monotonous=-np.sqrt(.5))
R['ISOPl'] = sum(R[k]*w for k, w in W.items()) / (4 + np.sqrt(32))
BANDS = [c for c in R.columns if c.startswith('M') and c.endswith('_r') and float(c[1:6]+'.'+c[7]) >= 20]
PORT = BANDS + ['LAavg_r', 'Navg_r', 'N05_r', 'N95_r', 'Savg_r', 'S05_r']
FULL = PORT + ['Ravg_r', 'R05_r', 'Favg_r', 'F05_r', 'Tavg_r', 'LCavg_r']
def per_stimulus(df, target): return df.groupby(['soundscape', 'masker', 'smr'])[[target] + FULL].mean().reset_index()
def models():
    return dict(ridge=make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-2, 4, 25))),
                gbm=HistGradientBoostingRegressor(max_iter=400, learning_rate=0.04, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0, random_state=0))
res = {}
for target in ['ISOPl', 'calm']:
    test = per_stimulus(R[R.fold_r == 0], target)
    # noise ceiling: split the test raters in half, correlate the halves' per-stimulus means
    t0 = R[R.fold_r == 0]; parts = sorted(t0.participant.unique()); rng = np.random.default_rng(0); ceil = []
    for _ in range(200):
        p = rng.permutation(parts); a, b = p[:len(p)//2], p[len(p)//2:]
        ma = t0[t0.participant.isin(a)].groupby(['soundscape','masker','smr'])[target].mean()
        mb = t0[t0.participant.isin(b)].groupby(['soundscape','masker','smr'])[target].mean()
        r = np.corrcoef(ma, mb.loc[ma.index])[0, 1]; ceil.append(2*r/(1+r))   # Spearman-Brown
    res[target] = dict(n_train_responses=int((R.fold_r > 0).sum()), n_test_stimuli=len(test), noise_ceiling_r=float(np.mean(ceil)))
    for fs_name, FS in [('portable', PORT), ('full', FULL)]:
        for mname, m in models().items():
            cv = []
            for k in range(1, 6):
                tr, va = R[(R.fold_r > 0) & (R.fold_r != k)], per_stimulus(R[R.fold_r == k], target)
                m.fit(tr[FS], tr[target]); cv.append(np.corrcoef(m.predict(va[FS]), va[target])[0, 1])
            tr = R[R.fold_r > 0]; m.fit(tr[FS], tr[target]); p = m.predict(test[FS])
            res[target][f'{fs_name}_{mname}'] = dict(cv_r=float(np.mean(cv)), cv_r_sd=float(np.std(cv)), test_r=float(np.corrcoef(p, test[target])[0, 1]),
                                                     test_r2=float(r2_score(test[target], p)), test_mae=float(mean_absolute_error(test[target], p)))
            if fs_name == 'portable': joblib.dump(dict(model=m, features=FS, target=target, X_train=tr[FS].values), f'{OUT}_{target}_{mname}.joblib')
            print(target, fs_name, mname, {k: round(v, 3) for k, v in res[target][f'{fs_name}_{mname}'].items()}, flush=True)
    print(target, 'noise ceiling r', round(res[target]['noise_ceiling_r'], 3))
# what drives comfort: ridge coefficients (standardised) for the portable model, calm target
m = models()['ridge']; tr = R[R.fold_r > 0]; m.fit(tr[PORT], tr['calm'])
coef = dict(zip(PORT, m[-1].coef_)); res['calm_ridge_coef'] = {k: float(v) for k, v in sorted(coef.items(), key=lambda kv: -abs(kv[1]))[:15]}
json.dump(res, open(OUT + '.json', 'w'), indent=1)
