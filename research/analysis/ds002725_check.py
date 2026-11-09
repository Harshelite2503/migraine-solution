"""Manipulation check for ds002725 generated music: which state numbers (1-9) are high arousal / high valence?
Generator rules (Williams et al. 2017): higher arousal = faster tempo, wider pitch spread, harder (louder) playing;
higher valence = major key (low: minor, medium: chromatic)."""
import sys, os, glob, json, numpy as np, pandas as pd, soundfile as sf
from scipy.signal import stft, find_peaks
MAJ = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]); MIN = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
def feats(x, fs):
    f, t, Z = stft(x, fs, nperseg=2048, noverlap=1536); S = np.abs(Z)
    flux = np.maximum(np.diff(np.log1p(S * 100), axis=1), 0).sum(0); flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    pk, _ = find_peaks(flux, height=1.0, distance=int(0.08 * fs / 512)); onset_rate = len(pk) / (len(x) / fs)
    # pitch spread: spread of spectral peak frequencies (in octaves) between 5th and 95th percentile of energy
    band = (f > 25) & (f < 4200); P = S[band].mean(1); fb = f[band]; c = np.cumsum(P) / P.sum()
    spread = np.log2(fb[np.searchsorted(c, 0.95)] / fb[np.searchsorted(c, 0.05)])
    chroma = np.zeros(12)
    for fi, p in zip(fb, P):
        if fi > 50: chroma[int(np.round(12 * np.log2(fi / 440) + 69)) % 12] += p
    rmaj = max(np.corrcoef(np.roll(MAJ, k), chroma)[0, 1] for k in range(12)); rmin = max(np.corrcoef(np.roll(MIN, k), chroma)[0, 1] for k in range(12))
    return dict(onset_rate=onset_rate, rms_db=20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-9), spread_oct=spread, major_minus_minor=rmaj - rmin,
                centroid=float((f[:, None] * S).sum() / S.sum()))
rows = []
for p in sorted(glob.glob(sys.argv[1] + '/*.wav')):
    n = os.path.basename(p)[:-4]
    if '-' not in n: continue
    a, b = n.split('_')[0].split('-'); x, fs = sf.read(p); x = x.mean(1) if x.ndim == 2 else x; h = len(x) // 2
    for half, st, seg in [(1, int(a), x[:h]), (2, int(b), x[h:])]: rows.append(dict(piece=n, half=half, state=st, **feats(seg, fs)))
D = pd.DataFrame(rows); D.to_csv('ds002725_acoustics.csv', index=False)
g = D.groupby('state')[['onset_rate', 'rms_db', 'spread_oct', 'major_minus_minor', 'centroid']].mean().round(3); print(g)
# within-piece contrasts (removes piece-level offsets such as loudness normalisation)
for k in ['onset_rate', 'rms_db', 'spread_oct', 'major_minus_minor']:
    z = D.groupby('piece')[k].transform(lambda s: s - s.mean()); D[k + '_w'] = z
print(D.groupby('state')[[k + '_w' for k in ['onset_rate', 'rms_db', 'spread_oct', 'major_minus_minor']]].mean().round(3))
