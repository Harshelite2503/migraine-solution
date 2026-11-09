#!/bin/bash
set -x; exec > /data/setup2.log 2>&1
SAS="$1"; BLOB="https://stillbuildad9dcaca.blob.core.windows.net/research"
put() { curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -T "$1" "$BLOB/$2?$SAS"; }
cd /data; apt-get update -q && apt-get install -y -q ffmpeg git >/dev/null
curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH=/root/.local/bin:$PATH
uv venv -p 3.11 /data/venv; . /data/venv/bin/activate
git clone -q https://github.com/facebookresearch/tribev2 /data/tribev2
uv pip install -q "torch==2.6.0" "torchvision==0.21.0" "torchaudio==2.6.0" --index-url https://download.pytorch.org/whl/cpu
uv pip install -q -e /data/tribev2 scipy
mkdir -p /data/stim2; curl -sS "$BLOB/araus16k.tgz?$SAS" | tar xz -C /data/stim2; find /data/stim2 -name '*.wav' | wc -l
put /data/setup2.log setup2.log
python /data/job2.py > /data/out2_stdout.txt 2>&1
cd /data/out2 && tar czf /data/results2.tgz . && put /data/results2.tgz results2.tgz
put /data/setup2.log setup2.log; put /data/out2_stdout.txt out2_stdout.txt; echo done > /data/F2; put /data/F2 FINISHED2
