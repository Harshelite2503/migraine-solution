cd /data && . /data/venv/bin/activate && mkdir -p /data/ttest && cp /data/stim/still16k/control_brown.wav /data/ttest/ && cat > /data/tribe_test.py <<'PY'
import sys, torch, pandas as pd, numpy as np, traceback, time
torch.set_num_threads(4); sys.path.insert(0, '/data/tribev2')
from tribev2.demo_utils import TribeModel, get_audio_and_text_events
t=time.time()
try:
    m = TribeModel.from_pretrained('facebook/tribev2', cache_folder='/data/cache_test', device='cpu', config_update={'data.audio_feature.device': 'cpu', 'data.video_feature.image.device': 'cpu'})
except Exception:
    print('override failed', traceback.format_exc()[-600:]); m = TribeModel.from_pretrained('facebook/tribev2', cache_folder='/data/cache_test', device='cpu', config_update={'data.audio_feature.device': 'cpu'})
print('loaded', time.time()-t, flush=True)
ev = get_audio_and_text_events(pd.DataFrame([{'type': 'Audio', 'filepath': '/data/ttest/control_brown.wav', 'start': 0, 'timeline': 't0', 'subject': 'default'}]), audio_only=True)
print(ev[['type','start','duration']].to_string(), flush=True)
p, s = m.predict(events=ev, verbose=False); print('PRED', p.shape, float(p.mean()), float(p.std()), time.time()-t)
PY
nohup python /data/tribe_test.py > /data/tribe_test.log 2>&1 &
echo started
