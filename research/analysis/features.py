"""ARAUS-compatible acoustic features for any sound (see ARAUS README for definitions).
x is a signal in pascals. Returns 1/3-octave A-weighted band levels (FFT, Hann 8192, 50% overlap),
LAeq, ISO 532-1 loudness (mean, N05, N95) and DIN 45692 sharpness (mean, S05)."""
import numpy as np, warnings
from mosqito.sq_metrics import loudness_zwtv, sharpness_din_from_loudness
warnings.filterwarnings('ignore')
CENTRES = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000,
           2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]
def a_weight_db(f):
    f = np.maximum(f, 1e-6); f2 = f * f
    ra = (12194**2 * f2**2) / ((f2 + 20.6**2) * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + 12194**2))
    return 20 * np.log10(ra) + 2.0
def band_levels(x, fs, n=8192):
    hop = n // 2; win = np.hanning(n); frames = [x[i:i+n] * win for i in range(0, len(x) - n + 1, hop)]
    P = np.mean([np.abs(np.fft.rfft(fr))**2 for fr in frames], axis=0) * 2 / (fs * np.sum(win**2))   # PSD, Pa^2/Hz
    f = np.fft.rfftfreq(n, 1/fs); df = f[1] - f[0]; PA = P * 10**(a_weight_db(f)/10)
    out = {}
    for c in CENTRES:
        lo, hi = c / 2**(1/6), c * 2**(1/6); m = (f >= lo) & (f < hi)
        out[c] = 10*np.log10(max(PA[m].sum() * df, 1e-20) / 4e-10)
    la = 10*np.log10(PA[(f > 10)].sum() * df / 4e-10)
    return out, la
def features(x, fs):
    bands, la = band_levels(x, fs)
    N, N_spec, bark, t = loudness_zwtv(x, fs, field_type='free')
    S = sharpness_din_from_loudness(N, N_spec, weighting='din')
    k = t > 0.5; Nt, St = N[k], S[k]
    feat = {f"M{int(c):05d}_{int(round((c % 1) * 10))}_r": v for c, v in bands.items()}
    feat.update(LAavg_r=la, Navg_r=Nt.mean(), N05_r=np.percentile(Nt, 95), N95_r=np.percentile(Nt, 5), Savg_r=St.mean(), S05_r=np.percentile(St, 95))
    return feat
def calibrate_la(x, fs, target):
    _, la = band_levels(x, fs); return x * 10**((target - la)/20)
