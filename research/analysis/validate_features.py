import sys, os, numpy as np, pandas as pd, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from features import features
M = pd.read_csv(sys.argv[1]).set_index('masker'); d = sys.argv[2]; rows = []
for f in sorted(os.listdir(d)):
    name = f
    if name not in M.index: continue
    x, fs = sf.read(os.path.join(d, f)); x = x * M.loc[name, 'gain_65dB']
    ft = features(x, fs); ref = M.loc[name]
    rows.append(dict(m=name, LA=ft['LAavg_r'], LA_ref=ref['LAavg_m'], N=ft['Navg_r'], N_ref=ref['Navg_m'], S=ft['Savg_r'], S_ref=ref['Savg_m'],
                     b1k=ft['M01000_0_r'], b1k_ref=ref['M01000_0_m'], b4k=ft['M04000_0_r'], b4k_ref=ref['M04000_0_m'], b125=ft['M00125_0_r'], b125_ref=ref['M00125_0_m']))
R = pd.DataFrame(rows); print(R.round(2).head(8).to_string())
for k in ['LA', 'N', 'S', 'b1k', 'b4k', 'b125']:
    print(k, 'r=%.3f' % np.corrcoef(R[k], R[k+'_ref'])[0,1], 'mean diff=%.3f' % (R[k]-R[k+'_ref']).mean(), 'MAE=%.3f' % (R[k]-R[k+'_ref']).abs().mean())
R.to_csv('feature_validation.csv', index=False)
