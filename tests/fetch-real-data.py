#!/usr/bin/env python3
"""Download the real-voice test set used by tests/real*.test.mjs and tests/hints.test.mjs.

309 isolated Mandarin syllables and characters from three native speakers:
  A  Chen Wang, syllables      github.com/hugolpz/audio-cmn (CC BY-SA)
  B  pinyin sound set          github.com/davinfifield/mp3-chinese-pinyin-sound
  C  Yue Tan, HSK characters   github.com/hugolpz/audio-cmn (CC BY-SA)

Needs git and ffmpeg. Usage:
  python3 tests/fetch-real-data.py ../realdata
  REALDATA=../realdata node tests/real.test.mjs
"""
import json, os, subprocess, sys

out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'realdata')
os.makedirs(os.path.join(out, 'pcm'), exist_ok=True)
os.chdir(out)

repos = {'A': 'hugolpz/audio-cmn', 'C': 'hugolpz/audio-cmn', 'B': 'davinfifield/mp3-chinese-pinyin-sound'}
for r in set(repos.values()):
    d = r.split('/')[1]
    if not os.path.isdir(d):
        subprocess.run(['git', 'clone', '--depth', '1', '--filter=blob:none', '--no-checkout', f'https://github.com/{r}', d], check=True)

def files(d):
    return set(subprocess.run(['git', '-C', d, '-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', 'HEAD'],
                              capture_output=True, text=True, check=True).stdout.split('\n'))

a, b = files('audio-cmn'), files('mp3-chinese-pinyin-sound')
syl = 'ma ba da yi wu yu shi hao mai ni li tang shu qu gao tian cha fei guo xue zhong mao wan yan lao bao pan hu tu ji'.split()
chars = {1: '妈天书高飞家他车开三听东风花说喝吃猫冬', 2: '麻人鱼茶十来学回名年钱白红门头时糖',
         3: '马好水五我你小九很老买雨手米草想表', 4: '骂大去是爱看四六二坐用饭会气对菜笑'}
want = []
for s in syl:
    for t in range(1, 5):
        if f'64k/syllabs/cmn-{s}{t}.mp3' in a: want.append(('A', f'64k/syllabs/cmn-{s}{t}.mp3', t, f'{s}{t}'))
        if f'mp3/{s}{t}.mp3' in b: want.append(('B', f'mp3/{s}{t}.mp3', t, f'{s}{t}'))
for t, cs in chars.items():
    for c in cs:
        if f'64k/hsk/cmn-{c}.mp3' in a: want.append(('C', f'64k/hsk/cmn-{c}.mp3', t, c))

for src, repo in (('AC', 'audio-cmn'), ('B', 'mp3-chinese-pinyin-sound')):
    paths = [w[1] for w in want if w[0] in src]
    subprocess.run(['git', '-C', repo, '-c', 'core.quotepath=false', 'checkout', 'HEAD', '--'] + paths, check=True)

manifest = []
for src, p, t, label in want:
    f = os.path.join('audio-cmn' if src != 'B' else 'mp3-chinese-pinyin-sound', p)
    dst = f'pcm/{src}_{label}_{t}.f32'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-ac', '1', '-ar', '48000', '-f', 'f32le', dst], check=True)
    manifest.append({'src': src, 'label': label, 'tone': t, 'file': dst})
json.dump(manifest, open('manifest.json', 'w'), ensure_ascii=False)
print(f'{len(manifest)} recordings ready in {out}')
