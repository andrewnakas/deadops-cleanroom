"""Placeholder announcer lines with Piper TTS (no cloning; replace with your own recordings later).
usage: python tools/make_voices.py <voice.onnx> export/web/audio/voice [key-prefix]   (prefix = only render those keys)
Writes <key>.ogg (Opus) + manifest.json, and voice_lines.csv for the recording practice pack."""
import sys, os, json, wave, io, csv
import numpy as np, av
from piper import PiperVoice
LINES = {
    'round_1': 'Round one.', 'round_2': 'Round two.', 'round_3': 'Round three.', 'round_4': 'Round four.', 'round_5': 'Round five.',
    'round_6': 'Round six.', 'round_7': 'Round seven.', 'round_8': 'Round eight.', 'round_9': 'Round nine.', 'round_10': 'Round ten. They will not stop.',
    'hounds': 'Release the hounds!', 'power_on': 'The power is on. The show goes on.', 'game_over': 'The show is over.',
    'pu_blackout': 'Blackout!', 'pu_onehit': 'One hit!', 'pu_double': 'Double cash!', 'pu_supply': 'Full supply!', 'pu_rebuild': 'Rebuild!', 'pu_clearance': 'Clearance sale!',
    # multiplayer
    'mp_start': 'Match begins.', 'mp_win': 'Victory.', 'mp_lose': 'Defeat.', 'mp_draw': 'Draw.',
    'mp_lead': 'You have the lead.', 'mp_behind': 'You have lost the lead.', 'mp_near': 'Almost there. Finish it.', 'mp_near_them': 'They are close to winning.',
    'mp_zone': 'The zone has moved.', 'mp_scan': 'Scan online.', 'mp_strike': 'Airstrike inbound.', 'mp_drone': 'Drone deployed.',
    'mp_enemy_strike': 'Enemy airstrike. Take cover.', 'mp_host': 'Host changed. The match continues.',
}
voice_path, out, only = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ''
os.makedirs(out, exist_ok=True)
voice = PiperVoice.load(voice_path)
rate = voice.config.sample_rate
for key, text in LINES.items():
    if not key.startswith(only): continue
    chunks = [np.frombuffer(c.audio_int16_bytes, dtype=np.int16) for c in voice.synthesize(text)]
    pcm = np.concatenate(chunks).astype(np.float32) / 32768
    pad = np.zeros(int(rate * .08), np.float32); pcm = np.concatenate([pad, pcm, pad])
    c = av.open(os.path.join(out, key + '.ogg'), 'w', format='ogg'); st = c.add_stream('libopus', rate=48000); st.layout = 'mono'
    rs = av.AudioResampler(format='fltp', layout='mono', rate=48000)
    fr = av.AudioFrame.from_ndarray(pcm.reshape(1, -1), format='fltp', layout='mono'); fr.sample_rate = rate
    for r in rs.resample(fr):
        for p in st.encode(r): c.mux(p)
    for r in rs.resample(None) or []:
        for p in st.encode(r): c.mux(p)
    for p in st.encode(None): c.mux(p)
    c.close()
json.dump(list(LINES), open(os.path.join(out, 'manifest.json'), 'w'))
with open(os.path.join(out, 'voice_lines.csv'), 'w', newline='', encoding='utf8') as f:
    w = csv.writer(f); w.writerow(['key', 'line', 'direction']); [w.writerow([k, t, 'Old cinema announcer: theatrical, slow, slightly ominous']) for k, t in LINES.items()]
print(len(LINES), 'lines ->', out)
