"""Empaqueta la base humana CC0 de Quaternius como futbolista GLB.
Malla y locomoción importadas; materiales de equipación y gestos de fútbol horneados.
No genera primitivas ni animación procedural durante el partido.
"""
from pathlib import Path
import copy,json,math,struct,urllib.request,urllib.parse
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'tools/source-assets'
OUT=ROOT/'public/models'
PROVENANCE=json.loads((ROOT/'tools/player-assets-source.json').read_text())

def read_glb(path):
 data=path.read_bytes(); length=struct.unpack_from('<I',data,12)[0]
 g=json.loads(data[20:20+length]); start=20+length
 return g,data[start+8:]

def write_glb(path,g,binary):
 binary=bytes(binary);binary+=b'\0'*(-len(binary)%4)
 g['buffers']=[{'byteLength':len(binary)}]
 header=json.dumps(g,separators=(',',':')).encode();header+=b' '*(-len(header)%4)
 data=struct.pack('<III',0x46546c67,2,12+8+len(header)+8+len(binary))+struct.pack('<II',len(header),0x4e4f534a)+header+struct.pack('<II',len(binary),0x004e4942)+binary
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
 print(path.relative_to(ROOT),len(data))

def values(g,b,idx):
 a=g['accessors'][idx];v=g['bufferViews'][a['bufferView']]
 fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']]
 n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 size=struct.calcsize(fmt)*n;stride=v.get('byteStride',size);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+fmt*n,b,offset+i*stride) for i in range(a['count'])]

class Pack:
 def __init__(self,g=None,b=b''):
  self.g=copy.deepcopy(g) if g else {'asset':{'version':'2.0','generator':'Garra FC / Quaternius CC0'},'bufferViews':[],'accessors':[]}
  self.b=bytearray(b)
 def add(self,rows,kind='VEC4',component=5126):
  rows=[tuple(r) if isinstance(r,(tuple,list)) else (r,) for r in rows]
  self.b.extend(b'\0'*(-len(self.b)%4));offset=len(self.b)
  fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[component]
  flat=[v for r in rows for v in r];self.b.extend(struct.pack('<'+fmt*len(flat),*flat))
  vi=len(self.g['bufferViews']);self.g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(self.b)-offset})
  ai=len(self.g['accessors']);self.g['accessors'].append({'bufferView':vi,'componentType':component,'count':len(rows),'type':kind,'min':[min(r[i] for r in rows) for i in range(len(rows[0]))],'max':[max(r[i] for r in rows) for i in range(len(rows[0]))]})
  return ai
 def copy_accessor(self,src,raw,index):
  a=src['accessors'][index];return self.add(values(src,raw,index),a['type'],a['componentType'])

CACHE.mkdir(exist_ok=True)
for path in PROVENANCE['paths']:
 target=CACHE/path.split('/')[-1]
 if not target.exists():
  url='https://raw.githubusercontent.com/'+PROVENANCE['repo']+'/'+PROVENANCE['revision']+'/'+urllib.parse.quote(path)
  target.write_bytes(urllib.request.urlopen(url,timeout=60).read())
base=json.loads((CACHE/'Superhero_Male_FullBody.gltf').read_text());raw=(CACHE/'Superhero_Male_FullBody.bin').read_bytes()
# Quitar texturas externas y colores de vértice originales para tintes de kit neutros.
pack=Pack(base,raw);g=pack.g
for key in ['images','textures','samplers','extensionsUsed','extensionsRequired']:g.pop(key,None)
roles=['hair','eyes','skin','shirt','shorts','socks','boots']
g['materials']=[{'name':role,'extras':{'kitRole':role},'pbrMetallicRoughness':{'baseColorFactor':([.09,.06,.035,1] if role=='eyes' else [.06,.065,.07,1] if role=='boots' else [1,1,1,1]),'metallicFactor':0,'roughnessFactor':.8 if role!='eyes' else .35}} for role in roles]
for mesh in g['meshes']:
 for pr in mesh['primitives']:
  pr['attributes']={k:v for k,v in pr['attributes'].items() if k in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']}
body=g['meshes'][2]['primitives'][0];pos=values(g,pack.b,body['attributes']['POSITION']);indices=[r[0] for r in values(g,pack.b,body['indices'])]
groups={role:[] for role in ['skin','shirt','shorts','socks','boots']}
for i in range(0,len(indices),3):
 tri=indices[i:i+3];x,y,z=[sum(pos[j][k] for j in tri)/3 for k in range(3)]
 role='skin'
 if y<.115:role='boots'
 elif y<.43:role='socks'
 elif .65<y<1.015 and abs(x)<.28:role='shorts'
 elif 1.005<=y<1.55 and (abs(x)<.23 or (y>1.36 and abs(x)<.43)):role='shirt'
 groups[role].extend(tri)
g['meshes'][2]['primitives']=[{**copy.deepcopy(body),'indices':pack.add(ind,'SCALAR',5123),'material':roles.index(role)} for role,ind in groups.items() if ind]
g['meshes'][2]['name']='FootballPlayer'
# Añadir pelo real, riggeado al mismo esqueleto (la piel del origen está en el mismo orden de huesos).
hair=json.loads((CACHE/'Hair_Buzzed.gltf').read_text());hb=(CACHE/'Hair_Buzzed.bin').read_bytes()
hpr=hair['meshes'][0]['primitives'][0];hp={'attributes':{},'material':0}
basejointnames=[g['nodes'][i]['name'] for i in g['skins'][0]['joints']]
hairjointnames=[hair['nodes'][i]['name'] for i in hair['skins'][0]['joints']]
for key,idx in hpr['attributes'].items():
 if key not in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:continue
 if key=='JOINTS_0':
  rows=[[basejointnames.index(hairjointnames[j]) for j in row] for row in values(hair,hb,idx)]
  hp['attributes'][key]=pack.add(rows,'VEC4',hair['accessors'][idx]['componentType'])
 else:hp['attributes'][key]=pack.copy_accessor(hair,hb,idx)
hp['indices']=pack.copy_accessor(hair,hb,hpr['indices'])
g['meshes'].append({'name':'Hair','primitives':[hp]});g['nodes'].append({'name':'Hair','mesh':len(g['meshes'])-1,'skin':0})
g['nodes'][68]['children'].append(len(g['nodes'])-1)
g['asset']['copyright']='Quaternius, Universal Base Characters and Universal Animation Libraries, CC0 1.0; football adaptation Garra FC.'
g['asset']['extras']={'source':'https://quaternius.com/packs/universalbasecharacters.html','license':'CC0-1.0','sourceRevision':PROVENANCE['revision']}
write_glb(OUT/'player.glb',g,pack.b)
name_to_index={n.get('name'):i for i,n in enumerate(g['nodes'])}
libs=[read_glb(CACHE/'UAL1_Standard.glb'),read_glb(CACHE/'UAL2_Standard.glb')]

def anim_pack(name):
 p=Pack();p.g['nodes']=copy.deepcopy(g['nodes']);p.g['scenes']=copy.deepcopy(g['scenes']);p.g['scene']=0
 for n in p.g['nodes']:
  n.pop('mesh',None);n.pop('skin',None)
 p.g['asset']['copyright']=g['asset']['copyright'];p.g['animations']=[{'name':name,'channels':[],'samplers':[]}]
 return p

def source_clip(name,source):
 lib,b=next((lib,b) for lib,b in libs if any(a['name']==source for a in lib['animations']))
 a=next(a for a in lib['animations'] if a['name']==source);p=anim_pack(name);dest=p.g['animations'][0]
 for ch in a['channels']:
  target=lib['nodes'][ch['target']['node']].get('name')
  if target not in name_to_index:continue
  sample=a['samplers'][ch['sampler']]
  new={'input':p.copy_accessor(lib,b,sample['input']),'output':p.copy_accessor(lib,b,sample['output']),'interpolation':sample.get('interpolation','LINEAR')}
  dest['channels'].append({'sampler':len(dest['samplers']),'target':{'node':name_to_index[target],'path':ch['target']['path']}});dest['samplers'].append(new)
 dest['extras']={'sourceClip':source,'author':'Quaternius','license':'CC0-1.0'}
 write_glb(OUT/'anims'/f'{name}.glb',p.g,p.b)
 return p
idle=source_clip('idle','Idle_Loop')
for name,source in [('jog','Jog_Fwd_Loop'),('sprint','Sprint_Loop'),('slide','Slide_Start'),('celebrate','Dance_Loop')]:source_clip(name,source)
# Base de pose de reposo importada; gestos de fútbol propios, almacenados como canales glTF.
rest={}
for ch in idle.g['animations'][0]['channels']:
 sm=idle.g['animations'][0]['samplers'][ch['sampler']]
 rest[(ch['target']['node'],ch['target']['path'])]=values(idle.g,idle.b,sm['output'])[0]

def multiply(a,b):
 x,y,z,w=a;X,Y,Z,W=b
 return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]
def rotation(axis,angle):
 q=[0,0,0,math.cos(angle/2)];q[axis]=math.sin(angle/2);return q

def football_clip(name,duration,poses):
 p=anim_pack(name);a=p.g['animations'][0]
 times=[duration*phase for phase,angles in poses];input_idx=p.add(times,'SCALAR')
 for (node,path),baseline in rest.items():
  rows=[];bone=g['nodes'][node]['name']
  for phase,angles in poses:
   v=list(baseline)
   if path=='rotation':
    for axis,angle in angles.get(bone,[]):v=multiply(rotation(axis,angle),v) if bone=='root' else multiply(v,rotation(axis,angle))
   if path=='translation' and bone=='root' and name=='gk_dive':v[1]+=math.sin(phase*math.pi)*.45
   rows.append(v)
  out=p.add(rows,{'rotation':'VEC4','translation':'VEC3','scale':'VEC3'}[path])
  a['channels'].append({'sampler':len(a['samplers']),'target':{'node':node,'path':path}});a['samplers'].append({'input':input_idx,'output':out,'interpolation':'LINEAR'})
 a['extras']={'author':'Garra FC','description':'Football action baked on Quaternius humanoid rig','license':'CC0-1.0'}
 write_glb(OUT/'anims'/f'{name}.glb',p.g,p.b)
football_clip('kick',.65,[(0,{}),(.25,{'thigh_r':[(0,-.45)],'calf_r':[(0,1.0)],'upperarm_l':[(0,-.35)]}),(.5,{'thigh_r':[(0,1.0)],'calf_r':[(0,.08)],'foot_r':[(0,-.3)],'upperarm_r':[(0,-.4)]}),(.75,{'thigh_r':[(0,.5)]}),(1,{})])
football_clip('pass',.5,[(0,{}),(.3,{'thigh_r':[(0,-.25)],'calf_r':[(0,.45)]}),(.6,{'thigh_r':[(0,.55),(1,-.25)],'calf_r':[(0,.05)],'foot_r':[(1,-.5)]}),(1,{})])
football_clip('gk_dive',.85,[(0,{}),(.25,{'root':[(2,-.4)],'upperarm_l':[(2,-1.1)],'upperarm_r':[(2,1.1)]}),(.6,{'root':[(2,-1.4)],'upperarm_l':[(2,-1.5)],'upperarm_r':[(2,1.5)],'calf_r':[(0,.5)]}),(1,{'root':[(2,-1.5)],'upperarm_l':[(2,-1.5)],'upperarm_r':[(2,1.5)]})])
(CACHE/'License_Standard.txt').read_text();
(OUT/'LICENSE-Quaternius.txt').write_text((CACHE/'License_Standard.txt').read_text()+'\n'+(CACHE/'License.txt').read_text())
