"""Original procedural NullChannel sounds; no samples or external recordings."""
from pathlib import Path
import math, wave, struct
root = Path(__file__).resolve().parents[1] / 'android/app/src/main/res/raw'
root.mkdir(parents=True, exist_ok=True)
patterns = {
 'nc_incoming': [(440,.16),(660,.16),(880,.25),(0,.65)],
 'nc_ringback': [(440,.45),(480,.45),(0,1.1)],
 'nc_message': [(880,.07),(1174,.11)],
 'nc_connected': [(523,.08),(784,.13)],
 'nc_ended': [(392,.09),(261,.17)],
}
for name, notes in patterns.items():
    samples=[]
    for hz, duration in notes:
        count=int(16000*duration)
        for i in range(count):
            envelope=min(1,i/160,(count-i)/320)
            samples.append(int(6000*envelope*math.sin(2*math.pi*hz*i/16000)) if hz else 0)
    with wave.open(str(root/(name+'.wav')), 'wb') as out:
        out.setparams((1,2,16000,len(samples),'NONE','not compressed'))
        out.writeframes(b''.join(struct.pack('<h',s) for s in samples))
