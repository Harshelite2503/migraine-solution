"""Brain-model tests.
A) Do model 'brain responses' predict how much a sound changes comfort? Target: ARAUS per-masker comfort effects
   (287 natural sounds, ~120 ratings each). Predictors: psychoacoustics (baseline), Wav2Vec-BERT (auditory deep net),
   TRIBE v2 predicted cortical response (fsaverage5). Out-of-fold r, plus within-class r (does it beat 'bird vs traffic'?).
B) Transfer: apply the comfort readouts to Still's sounds (level-matched) and to ds002725 music halves with targeted
   valence/arousal (independent data, never used in training)."""
import os, sys, json, numpy as np, pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.model_selection import KFold
from scipy import stats
R1, R2 = sys.argv[1], sys.argv[2]   # result folders (pass 1: Still + ds002725, pass 2: ARAUS maskers)
def load(folder):
    w = dict(np.load(f'{folder}/w2v_embeddings.npz')); 
    try: t = dict(np.load(f'{folder}/tribe_preds.npz'))
    except Exception: t = {}
    return w, t
w1, t1 = load(R1); w2, t2 = load(R2)
E = pd.read_csv('masker_effects.csv', index_col=0); M = pd.read_csv(os.environ.get('ARAUS_MASKERS', 'data/araus/datav2/maskers.csv')).set_index('masker')
names = [n for n in E.index if f'araus16k__{n}' in w2]; E = E.loc[names]; print('maskers with embeddings', len(names))
BANDS = [c for c in M.columns if c.startswith('M') and c.endswith('_m') and float(c[1:6] + '.' + c[7]) >= 20]
PSY = BANDS + ['LAavg_m', 'Navg_m', 'N05_m', 'N95_m', 'Savg_m', 'S05_m']
X = {'psychoacoustic': M.loc[names, PSY].values.astype(float)}
L = w2[f'araus16k__{names[0]}'].shape[0]
for l in range(L): X[f'w2v_L{l}'] = np.stack([w2[f'araus16k__{n}'][l] for n in names]).astype(float)
has_tribe = all(f'araus16k__{n}__mean' in t2 for n in names)
A = np.load('destrieux_fsavg5.npz'); LAB = A['labels']; PARC = np.concatenate([A['left'], A['right'] + 1000])
ROIS = [r for r in np.unique(PARC) if r % 1000 != 0]
ROI_NAMES = [('lh_' if r < 1000 else 'rh_') + LAB[r % 1000] for r in ROIS]
def roi(v): return np.array([v[PARC == r].mean() for r in ROIS])
if has_tribe:
    X['tribe'] = np.stack([t2[f'araus16k__{n}__mean'] for n in names]).astype(float)
    X['tribe_roi'] = np.stack([roi(x) for x in X['tribe']])
cls = E['class'].values
def model(name): 
    steps = [StandardScaler()] + ([PCA(50, random_state=0)] if name == 'tribe' else []) + [RidgeCV(alphas=np.logspace(-2, 6, 30))]
    return make_pipeline(*steps)
def oof(Xm, y, name, reps=5):
    P = np.zeros((reps, len(y)))
    for r in range(reps):
        for tr, te in KFold(10, shuffle=True, random_state=r).split(Xm):
            m = model(name).fit(Xm[tr], y[tr]); P[r, te] = m.predict(Xm[te])
    return P.mean(0)
def within(p, y): 
    d = pd.DataFrame(dict(p=p, y=y, c=cls)); d[['p', 'y']] = d[['p', 'y']] - d.groupby('c')[['p', 'y']].transform('mean'); return stats.pearsonr(d.p, d.y)[0]
res = {'A': {}}
for target in ['ISOPl_effect', 'calm_effect']:
    y = E[target].values; out = {}
    # class-only baseline: predicting each masker by its class mean (out of fold)
    cb = np.zeros(len(y))
    for tr, te in KFold(10, shuffle=True, random_state=0).split(y):
        mu = pd.Series(y[tr]).groupby(cls[tr]).mean(); cb[te] = [mu.get(c, y[tr].mean()) for c in cls[te]]
    out['class_only'] = dict(r=stats.pearsonr(cb, y)[0], r_within=0.0)
    # Wav2Vec layer chosen on a separate half of the data, then evaluated out of fold on all (mild optimism noted)
    lay = {}
    for l in range(L): p = oof(X[f'w2v_L{l}'], y, 'w2v', reps=1); lay[l] = stats.pearsonr(p, y)[0]
    best = max(lay, key=lay.get); out['w2v_by_layer'] = lay
    for name in ['psychoacoustic', f'w2v_L{best}'] + (['tribe', 'tribe_roi'] if has_tribe else []):
        p = oof(X[name], y, name); out[name] = dict(r=stats.pearsonr(p, y)[0], r_within=within(p, y))
    if has_tribe:
        Xc = np.hstack([X['psychoacoustic'], PCA(50, random_state=0).fit_transform(StandardScaler().fit_transform(X['tribe']))])
        p = oof(Xc, y, 'combo'); out['psy+tribe'] = dict(r=stats.pearsonr(p, y)[0], r_within=within(p, y))
    out['best_w2v_layer'] = best; out['noise_ceiling_r'] = float(np.sqrt(max(0, 1 - (E[target.replace('effect', 'se')]**2).mean() / y.var())))
    if has_tribe:   # which predicted regions track this sound's comfort effect (partial r controlling for loudness)
        lo = M.loc[names, 'Navg_m'].values; rr = []
        for j, nm in enumerate(ROI_NAMES):
            a = X['tribe_roi'][:, j]; ra = a - np.polyval(np.polyfit(lo, a, 1), lo); ry = y - np.polyval(np.polyfit(lo, y, 1), lo)
            rr.append((nm, stats.pearsonr(ra, ry)[0]))
        rr.sort(key=lambda t: -abs(t[1])); out['top_rois'] = rr[:12]; print(target, 'top ROIs', [(n, round(v, 2)) for n, v in rr[:8]])
    res['A'][target] = out
    print(target, {k: (round(v['r'], 3), round(v['r_within'], 3)) for k, v in out.items() if isinstance(v, dict) and 'r' in v}, 'best layer', best, 'ceiling', round(out['noise_ceiling_r'], 3))
# B) transfer: fit on all maskers, predict Still sounds and ds002725 halves
rep = 'tribe' if has_tribe else f"w2v_L{res['A']['ISOPl_effect']['best_w2v_layer']}"
fit = {t: model(rep).fit(X[rep], E[t].values) for t in ['ISOPl_effect', 'calm_effect']}
still_keys = sorted(k for k in w1 if k.startswith('still16k__'))
def rep_vec(store_w, store_t, k):
    return store_t[k + '__mean'] if rep == 'tribe' else store_w[k][int(rep.split('L')[1])]
S = pd.DataFrame({'sound': [k.split('__')[1][:-4] for k in still_keys]})
for t in fit: S[t] = fit[t].predict(np.stack([rep_vec(w1, t1, k) for k in still_keys]).astype(float))
# reference: where do these sit relative to the maskers' range?
for t in fit: S[t + '_pct_of_maskers'] = [float((E[t] < v).mean() * 100) for v in S[t]]
if has_tribe:
    KEY = ['G_temp_sup-G_T_transv', 'G_temp_sup-Plan_tempo', 'G_insular_short', 'S_circular_insula_sup', 'G_and_S_cingul-Ant', 'G_and_S_cingul-Mid-Ant']
    allv = np.stack([roi(t2[f'araus16k__{n}__mean']) for n in names]); mu, sd = allv.mean(0), allv.std(0) + 1e-9
    for k in KEY:
        for h in ['lh_', 'rh_']:
            j = ROI_NAMES.index(h + k); S[h + k] = [float((roi(t1[k_ + '__mean'])[j] - mu[j]) / sd[j]) for k_ in still_keys]   # z vs natural sounds
bl = res['A']['ISOPl_effect']['best_w2v_layer']; bl2 = res['A']['calm_effect']['best_w2v_layer']
for t, l in [('ISOPl_effect', bl), ('calm_effect', bl2)]:
    mw = model('w2v').fit(X[f'w2v_L{l}'], E[t].values); S[t + '_w2v'] = mw.predict(np.stack([w1[k][l] for k in still_keys]).astype(float))
    S[t + '_w2v_pct'] = [float((E[t] < v).mean() * 100) for v in S[t + '_w2v']]
    # clip-level ds002725 check with the auditory net: predicted comfort vs mean targeted arousal / valence of the clip
    import re
    ks = [k for k in w1 if k.startswith('ds002725__') and re.fullmatch(r'\d-\d_\d\.wav', k.split('__')[1])]
    pr = mw.predict(np.stack([w1[k][l] for k in ks]).astype(float)); st = [tuple(map(int, k.split('__')[1].split('_')[0].split('-'))) for k in ks]
    ar = np.array([((a - 1) // 3 + (b - 1) // 3) / 2 + 1 for a, b in st]); va = np.array([((a - 1) % 3 + (b - 1) % 3) / 2 + 1 for a, b in st])
    res.setdefault('ds_w2v', {})[t] = dict(r_arousal=list(map(float, stats.pearsonr(ar, pr))), r_valence=list(map(float, stats.pearsonr(va, pr))), n=len(ks))
    print('ds002725 w2v clip-level', t, res['ds_w2v'][t])
S.to_csv('still_brain_comfort.csv', index=False); pd.set_option('display.width', 200); print(S.round(3).to_string())
res['B_still'] = S.to_dict('records'); res['representation'] = rep
if has_tribe:
    rows = []
    for k in t1:
        if not (k.startswith('ds002725__') and k.endswith('__ts')): continue
        n = k.split('__')[1][:-4]
        import re
        if not re.fullmatch(r'\d-\d_\d', n): continue
        a, b = n.split('_')[0].split('-'); ts = t1[k].astype(float); h = len(ts) // 2
        for half, st, seg in [(1, int(a), ts[:h]), (2, int(b), ts[h:])]:
            v, ar = (st - 1) % 3 + 1, (st - 1) // 3 + 1
            rows.append(dict(piece=n, half=half, state=st, valence=v, arousal=ar, **{t: float(fit[t].predict(seg.mean(0, keepdims=True))[0]) for t in fit}))
    D = pd.DataFrame(rows); D.to_csv('ds002725_brain_comfort.csv', index=False)
    # within-piece test: change in predicted comfort between halves vs change in targeted arousal / valence
    W = D.pivot_table(index='piece', columns='half', values=['ISOPl_effect', 'calm_effect', 'valence', 'arousal'])
    out = {}
    for t in fit:
        dy = W[(t, 2)] - W[(t, 1)]; da = W[('arousal', 2)] - W[('arousal', 1)]; dv = W[('valence', 2)] - W[('valence', 1)]
        A = np.column_stack([np.ones(len(dy)), da, dv]); beta, *_ = np.linalg.lstsq(A, dy, rcond=None)
        out[t] = dict(r_arousal=stats.pearsonr(da, dy), r_valence=stats.pearsonr(dv, dy), beta_arousal=beta[1], beta_valence=beta[2], n=len(dy))
        print('ds002725', t, 'r(arousal change)=%.3f p=%.2g' % out[t]['r_arousal'], 'r(valence change)=%.3f p=%.2g' % out[t]['r_valence'])
    res['B_ds002725'] = {t: {k: (list(map(float, v)) if isinstance(v, tuple) or hasattr(v, 'statistic') else float(v)) for k, v in o.items()} for t, o in out.items()}
    print(D.groupby(['arousal', 'valence'])['calm_effect'].mean().unstack().round(3))
json.dump(res, open('brain_results.json', 'w'), indent=1, default=lambda o: float(o) if np.isscalar(o) else list(map(float, o)))
