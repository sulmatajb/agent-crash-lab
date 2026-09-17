"""Original deterministic 120 BPM electronic score, authored for this edit. MIT."""
from pathlib import Path
import numpy as np
import wave
S=48000; D=24; mix=np.zeros((S*D,2),dtype=np.float64);rng=np.random.default_rng(43)
def add(sig, at, gain=1, pan=0):
 a=int(at*S);n=min(len(sig),len(mix)-a)
 if n<=0:return
 mix[a:a+n,0]+=sig[:n]*gain*np.sqrt((1-pan)/2)
 mix[a:a+n,1]+=sig[:n]*gain*np.sqrt((1+pan)/2)
def time(d):return np.arange(int(d*S))/S
def kick():
 t=time(.38);phase=2*np.pi*(47*t+100*.035*(1-np.exp(-t/.035)))
 return np.sin(phase)*np.exp(-t*12)+.12*rng.normal(size=len(t))*np.exp(-t*140)
def hat(d=.09):
 t=time(d);n=rng.normal(size=len(t));n=np.r_[0,np.diff(n)]
 return n*np.exp(-t*65)*.18
def clap():
 t=time(.22);n=rng.normal(size=len(t));env=sum(np.exp(-np.maximum(t-a,0)*45)*(t>=a) for a in [0,.012,.026]);return n*env*.13
notes=[41,41,44,39,41,41,48,46,41,44,39,41]
for bar in range(12):
 start=bar*2;root=440*2**((notes[bar]-69)/12)
 for b in range(4):
  at=start+b*.5
  if 14<=at<15:continue
  add(kick(),at,.84 if bar>=2 else .5)
  if b%2:add(clap(),at,.48)
 for step in range(8):
  at=start+step*.25
  if 14<=at<15:continue
  add(hat(),at,.24 if step%2 else .14,(-1 if step%2 else 1)*.35)
  t=time(.22);f=root*(2 if step in [3,7] else 1)
  bass=(np.sin(2*np.pi*f*t)+.25*np.sin(4*np.pi*f*t)+.12*np.sin(6*np.pi*f*t))*np.minimum(t/.008,1)*np.exp(-t*13)
  add(bass,at+.03,.48)
 # glassy arpeggio: minor chord, evolves with bass
 for step in range(8):
  at=start+step*.25;semi=[0,7,12,15,12,7,19,15][step];f=root*4*2**(semi/12)
  t=time(.5);tone=(np.sin(2*np.pi*f*t)+.15*np.sin(2*np.pi*2*f*t))*np.minimum(t/.005,1)*np.exp(-t*10)
  gain=.11 if bar<2 else .17
  if 14<=at<16:gain*=.25
  add(tone,at,gain,.5*np.sin(step));add(tone,at+.1875,gain*.3,-.5*np.sin(step))
# No noise risers or swooshes: transitions ride the existing musical beat.
for at in [4,6,9,14,16,19,21]:
 t=time(.65);hit=np.sin(2*np.pi*(36*t+10*(1-np.exp(-t*9))))*np.exp(-t*7)
 add(hit,at,.20)
# The timeout interrupts the groove; two short descending digital notes mark the fault.
for at,f in [(14,440),(14.25,220)]:
 t=time(.2);add(np.sin(2*np.pi*f*t)*np.exp(-t*22),at,.22)
fade=np.minimum(np.arange(len(mix))/(S*.012),1)*np.minimum((len(mix)-np.arange(len(mix)))/(S*.7),1)
mix=np.tanh(mix*1.25)*fade[:,None];mix*=.88/max(abs(mix).max(),.01)
p=Path('assets/crash-beat.wav')
with wave.open(str(p),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(S);w.writeframes((mix*32767).astype('<i2').tobytes())
print(p)
