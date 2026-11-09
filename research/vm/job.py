"""Runs on the Azure VM. For every stimulus: TRIBE v2 audio-only predicted cortical response (fsaverage5)
and Wav2Vec-BERT 2.0 mean embeddings (all layers). Results are written to /data/out."""
import os, sys, glob, json, time, traceback, numpy as np, pandas as pd, soundfile as sf, torch
torch.set_num_threads(os.cpu_count())
OUT = '/data/out'; os.makedirs(OUT, exist_ok=True)
files = sorted(glob.glob('/data/stim/**/*.wav', recursive=True))
log = open(f'{OUT}/log.txt', 'a'); P = lambda *a: (print(*a, file=log, flush=True), print(*a, flush=True))
P('stimuli', len(files))
# 1) Wav2Vec-BERT embeddings (fallback representation, and an auditory-model baseline)
from transformers import AutoFeatureExtractor, Wav2Vec2BertModel
fe = AutoFeatureExtractor.from_pretrained('facebook/w2v-bert-2.0'); wm = Wav2Vec2BertModel.from_pretrained('facebook/w2v-bert-2.0').eval()
emb = {}
t0 = time.time()
for i, f in enumerate(files):
    x, fs = sf.read(f, dtype='float32'); x = x.mean(1) if x.ndim == 2 else x
    with torch.inference_mode():
        inp = fe(x, sampling_rate=16000, return_tensors='pt')
        hs = wm(**inp, output_hidden_states=True).hidden_states
    emb[os.path.relpath(f, '/data/stim')] = np.stack([h[0].mean(0).numpy() for h in hs]).astype(np.float16)
    if i % 20 == 0: P('w2v', i, round(time.time() - t0))
np.savez_compressed(f'{OUT}/w2v_embeddings.npz', **{k.replace('/', '__'): v for k, v in emb.items()})
P('w2v done', round(time.time() - t0)); del wm
# 2) TRIBE v2
sys.path.insert(0, '/data/tribev2')
from tribev2.demo_utils import TribeModel, get_audio_and_text_events
upd = {'data.audio_feature.device': 'cpu', 'data.video_feature.image.device': 'cpu'}
try:
    model = TribeModel.from_pretrained('facebook/tribev2', cache_folder='/data/cache', device='cpu', config_update=upd)
except Exception:
    P('load with video override failed, retrying', traceback.format_exc()[-800:])
    model = TribeModel.from_pretrained('facebook/tribev2', cache_folder='/data/cache', device='cpu', config_update={'data.audio_feature.device': 'cpu'})
res = {}; t0 = time.time()
for i, f in enumerate(files):
    try:
        ev = get_audio_and_text_events(pd.DataFrame([{'type': 'Audio', 'filepath': f, 'start': 0, 'timeline': f'tl{i}', 'subject': 'default'}]), audio_only=True)
        preds, segs = model.predict(events=ev, verbose=False)
        k = os.path.relpath(f, '/data/stim').replace('/', '__')
        res[k + '__mean'] = preds.mean(0).astype(np.float32); res[k + '__ts'] = preds.astype(np.float16)
    except Exception:
        P('tribe fail', f, traceback.format_exc()[-1500:])
    if i % 10 == 0: P('tribe', i, round(time.time() - t0)); np.savez_compressed(f'{OUT}/tribe_preds.npz', **res)
np.savez_compressed(f'{OUT}/tribe_preds.npz', **res)
P('ALL DONE', len(res) // 2)
