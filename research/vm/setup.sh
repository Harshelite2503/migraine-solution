#!/bin/bash
# Runs as root on the VM. Installs the toolchain, fetches stimuli and models, then runs job.py.
set -x; exec > /data/setup.log 2>&1
SAS="$1"; BLOB="https://stillbuildad9dcaca.blob.core.windows.net/research"
put() { curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" --data-binary @"$1" "$BLOB/$2?$SAS"; }
mkdir -p /data/stim /data/out; cd /data
apt-get update -q && apt-get install -y -q ffmpeg git unzip >/dev/null
curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH=/root/.local/bin:$PATH
uv venv -p 3.11 /data/venv; . /data/venv/bin/activate
git clone -q https://github.com/facebookresearch/tribev2 /data/tribev2
uv pip install -q "torch==2.6.0" "torchvision==0.21.0" "torchaudio==2.6.0" --index-url https://download.pytorch.org/whl/cpu
uv pip install -q -e /data/tribev2 scipy
put /data/setup.log setup.log
# Stimuli: Still grid (from blob), ARAUS maskers (NTU), ds002725 music (OpenNeuro)
curl -sS "$BLOB/still16k.tgz?$SAS" | tar xz -C /data/stim
curl -sS -L -o /data/maskers.zip "https://researchdata.ntu.edu.sg/api/access/datafile/89458?gbrecs=true" && unzip -q /data/maskers.zip -d /data/raw_maskers
python - <<'PY'
import glob, os, numpy as np, soundfile as sf
from scipy.signal import resample_poly
os.makedirs('/data/stim/araus', exist_ok=True)
for f in sorted(glob.glob('/data/raw_maskers/**/*.wav', recursive=True)):
    x, fs = sf.read(f); x = x.mean(1) if x.ndim == 2 else x
    y = resample_poly(x, 160, 441) if fs == 44100 else resample_poly(x, 16000, fs)
    r = np.sqrt(np.mean(y**2)); 
    if r > 0: sf.write('/data/stim/araus/' + os.path.basename(f), (y / r * 0.05).astype(np.float32), 16000, subtype='PCM_16')
PY
python - <<'PY'
import urllib.request, re, os, subprocess
keys, tok = [], ''
while True:
    u = 'https://s3.amazonaws.com/openneuro.org?list-type=2&prefix=ds002725/' + (f'&continuation-token={urllib.parse.quote(tok)}' if tok else '')
    t = urllib.request.urlopen(u).read().decode(); keys += re.findall(r'<Key>([^<]+)</Key>', t)
    m = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', t)
    if not m: break
    tok = m.group(1)
import urllib.parse
open('/data/out/ds002725_keys.txt', 'w').write('\n'.join(keys))
os.makedirs('/data/ds002725', exist_ok=True); os.makedirs('/data/stim/ds002725', exist_ok=True)
for k in keys:
    low = k.lower()
    if low.endswith(('.wav', '.mp3', '.flac', '.ogg', '.mid', '.midi')) or (low.endswith(('events.tsv', '.json', '.md', '.txt', 'participants.tsv')) and '/func/' not in low.split('sub-')[0] + 'x') or low.endswith('_events.tsv'):
        d = '/data/ds002725/' + k[len('ds002725/'):]; os.makedirs(os.path.dirname(d), exist_ok=True)
        urllib.request.urlretrieve('https://s3.amazonaws.com/openneuro.org/' + urllib.parse.quote(k), d)
import glob, numpy as np, soundfile as sf
from scipy.signal import resample_poly
for f in glob.glob('/data/ds002725/**/*', recursive=True):
    if f.lower().endswith(('.wav', '.mp3', '.flac', '.ogg')):
        out = '/data/stim/ds002725/' + os.path.splitext(os.path.basename(f))[0] + '.wav'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f, '-ac', '1', '-ar', '16000', out])
        x, fs = sf.read(out); r = np.sqrt(np.mean(x**2))
        if r > 0: sf.write(out, (x / r * 0.05).astype(np.float32), 16000, subtype='PCM_16')
PY
ls /data/stim/* | head; find /data/stim -name '*.wav' | wc -l
tar czf /data/out/ds002725_meta.tgz -C /data ds002725 --exclude='*.wav' --exclude='*.mp3' 2>/dev/null
put /data/setup.log setup.log
python /data/job.py > /data/out/job_stdout.txt 2>&1
cd /data/out && tar czf /data/results.tgz . && put /data/results.tgz results.tgz
put /data/setup.log setup.log; echo FINISHED > /data/out/FINISHED; put /data/out/FINISHED FINISHED
