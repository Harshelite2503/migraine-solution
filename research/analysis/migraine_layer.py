"""Migraine layer: per-frequency sound tolerance from Mourgela et al. 2023 (Ear and Hearing), raw data.
Dependent variable: range between just-audible and mildly-uncomfortable slider positions (0-1 units).
Only numeric measurement columns are read."""
import json, sys, numpy as np, openpyxl
from scipy import stats
X = sys.argv[1]; OUT = sys.argv[2]
F = [100,200,400,500,800,1000,2000,3000,4000,6000,8000,10000,12000]
wb = openpyxl.load_workbook(X, read_only=True, data_only=True)
def rows(name):
    rs = [r[:13] for r in wb[name].iter_rows(values_only=True) if sum(isinstance(c,(int,float)) for c in r[:13]) == 13]
    rs = np.array(rs[:-2], float)   # last two rows are the sheet's mean and SE
    keep = []
    for r in rs:
        if np.all(np.isin(np.round(r, 3), [0, 0.5, 1])): continue   # slider never moved / quantised junk
        if np.ptp(r) == 0 or np.any(r < 0): continue                # paper's exclusion rules
        keep.append(r)
    return np.array(keep), len(rs)
on, n_on = rows('All Migraineur On attack'); off, n_off = rows('All Migraineur Off attack')
lo, _ = rows('All Migraineur Low Sev'); hi, _ = rows('All Migraineur High Sev')
nm, n_nm = rows('UK+ Prolific -Non Migraineur'); m_ukp, _ = rows('UK + Prolific - Migraineur')
mig = np.vstack([on, off])
def holm(p):
    p = np.asarray(p); o = np.argsort(p); adj = np.empty_like(p); run = 0
    for i, k in enumerate(o): run = max(run, (len(p)-i)*p[k]); adj[k] = min(1, run)
    return adj
def boot_ci(a, b, n=4000, seed=0):
    r = np.random.default_rng(seed); d = [r.choice(a, len(a)).mean() - r.choice(b, len(b)).mean() for _ in range(n)]
    return np.percentile(d, [2.5, 97.5]).tolist()
def compare(a, b, la, lb):
    out = []
    t = [stats.ttest_ind(a[:,j], b[:,j], equal_var=False) for j in range(13)]
    u = [stats.mannwhitneyu(a[:,j], b[:,j]) for j in range(13)]
    ph = holm([x.pvalue for x in t])
    for j, f in enumerate(F):
        sd = np.sqrt((a[:,j].var(ddof=1) + b[:,j].var(ddof=1)) / 2)
        out.append(dict(hz=f, mean_a=a[:,j].mean(), se_a=stats.sem(a[:,j]), mean_b=b[:,j].mean(), se_b=stats.sem(b[:,j]),
                        diff=a[:,j].mean()-b[:,j].mean(), ci95=boot_ci(a[:,j], b[:,j], seed=j), d=(a[:,j].mean()-b[:,j].mean())/sd,
                        p_welch=t[j].pvalue, p_holm=ph[j], p_mwu=u[j].pvalue))
    # overall: per-person mean range across frequencies
    ta = stats.ttest_ind(a.mean(1), b.mean(1), equal_var=False)
    # shape: each person's range relative to their own mean, which removes headphone/volume offsets
    sa, sb = a / a.mean(1, keepdims=True), b / b.mean(1, keepdims=True)
    shape = [dict(hz=f, rel_a=sa[:,j].mean(), rel_b=sb[:,j].mean(), p=stats.ttest_ind(sa[:,j], sb[:,j], equal_var=False).pvalue) for j, f in enumerate(F)]
    # permutation test on the frequency x group interaction (shape difference), 5000 shuffles
    pooled = np.vstack([sa, sb]); na = len(sa); r = np.random.default_rng(1)
    stat = lambda A, B: np.sum((A.mean(0) - B.mean(0))**2)
    obs = stat(sa, sb); perm = [stat(*np.split(pooled[r.permutation(len(pooled))], [na])) for _ in range(5000)]
    return dict(a=la, b=lb, n_a=len(a), n_b=len(b), per_freq=out, overall=dict(mean_a=a.mean(), mean_b=b.mean(), p=ta.pvalue,
                d=(a.mean(1).mean()-b.mean(1).mean())/np.sqrt((a.mean(1).var(ddof=1)+b.mean(1).var(ddof=1))/2)),
                shape=shape, shape_perm_p=(1+sum(p >= obs for p in perm))/5001)
res = dict(
  source='Mourgela, Vikelis & Reiss 2023, Ear and Hearing 44(5):1007; raw data github.com/amourgela/supplementalmaterial',
  excluded=dict(on=n_on-len(on), off=n_off-len(off), nonmigraine=n_nm-len(nm)),
  migraine_vs_none=compare(mig, nm, 'migraine (all)', 'no migraine (UK+Prolific)'),
  on_vs_off_attack=compare(on, off, 'during attack', 'between attacks'),
  high_vs_low_severity=compare(hi, lo, 'severity >=70', 'severity <=30'),
)
json.dump(res, open(OUT, 'w'), indent=1, default=float)
for k in ['migraine_vs_none', 'on_vs_off_attack', 'high_vs_low_severity']:
    c = res[k]; print(f"\n== {c['a']} (n={c['n_a']}) vs {c['b']} (n={c['n_b']}): overall {c['overall']['mean_a']:.3f} vs {c['overall']['mean_b']:.3f}, p={c['overall']['p']:.4f}, d={c['overall']['d']:.2f}; shape perm p={c['shape_perm_p']:.4f}")
    for r_, s in zip(c['per_freq'], c['shape']):
        print(f"{r_['hz']:>6} {r_['mean_a']:.3f}±{r_['se_a']:.3f} {r_['mean_b']:.3f}±{r_['se_b']:.3f} d={r_['d']:+.2f} p={r_['p_welch']:.4f} holm={r_['p_holm']:.3f} | rel {s['rel_a']:.2f} vs {s['rel_b']:.2f} p={s['p']:.3f}")
print('excluded', res['excluded'])
