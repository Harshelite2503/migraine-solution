"""Per-masker causal effect on comfort in ARAUS: rating = participant + soundscape + masker (+ SMR), sparse least squares.
'silence' (no masker added) is the reference, so each effect is the change from adding that sound."""
import sys, numpy as np, pandas as pd, scipy.sparse as sp
from scipy.sparse.linalg import lsqr
R = pd.read_csv(sys.argv[1]); R = R[R.fold_r.between(0, 5)].copy()
W = dict(pleasant=1, chaotic=-np.sqrt(.5), vibrant=np.sqrt(.5), calm=np.sqrt(.5), annoying=-1, monotonous=-np.sqrt(.5))
R['ISOPl'] = sum(R[k]*w for k, w in W.items()) / (4 + np.sqrt(32))
R['masker'] = R.masker.astype(str); masks = sorted(m for m in R.masker.unique() if not m.startswith('silence'))
def design(df):
    cols, blocks = [], []
    for col, levels in [('participant', sorted(df.participant.unique())), ('soundscape', sorted(df.soundscape.unique())[1:]), ('masker', masks)]:
        idx = {v: j for j, v in enumerate(levels)}; j = df[col].map(idx)
        ok = j.notna().values; m = sp.csr_matrix((np.ones(ok.sum()), (np.where(ok)[0], j[ok].astype(int))), shape=(len(df), len(levels)))
        blocks.append(m); cols += [(col, v) for v in levels]
    return sp.hstack(blocks + [sp.csr_matrix(df[['smr']].values.astype(float))]).tocsr(), cols
out = {}
for target in ['ISOPl', 'calm']:
    X, cols = design(R); b = lsqr(X, R[target].values, atol=1e-10, btol=1e-10)[0]
    eff = {c[1]: b[i] for i, c in enumerate(cols) if c[0] == 'masker'}
    # bootstrap over participants for standard errors
    parts = R.participant.unique(); rng = np.random.default_rng(0); boots = []
    for _ in range(30):
        pick = rng.choice(parts, len(parts)); D = pd.concat([R[R.participant == p].assign(participant=f'{p}_{k}') for k, p in enumerate(pick)])
        Xb, cb = design(D); bb = lsqr(Xb, D[target].values)[0]; boots.append({c[1]: bb[i] for i, c in enumerate(cb) if c[0] == 'masker'})
    se = pd.DataFrame(boots).std()
    out[target] = pd.DataFrame({'effect': pd.Series(eff), 'se': se})
E = pd.concat({k: v for k, v in out.items()}, axis=1); E.columns = ['_'.join(c) for c in E.columns]
E['n'] = R.masker.value_counts().reindex(E.index); E['class'] = [m.split('_')[0] for m in E.index]
E.to_csv('masker_effects.csv')
print(E.groupby('class')[['ISOPl_effect', 'calm_effect']].agg(['mean', 'count']).round(3))
print('reliability (mean SE vs SD of effects):', E.ISOPl_se.mean().round(3), E.ISOPl_effect.std().round(3), E.calm_se.mean().round(3), E.calm_effect.std().round(3))
