import json,copy,uuid,base64
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sample=json.loads((root/'.superpowers/sdd/implementation-plan/official-graphics.scene.json').read_text())
# Derived from official scene's SceneAsset/Scene/Node/Component/SceneGlobals graph.
# Preserve original defaults, removing all sample asset and prefab references.
asset=copy.deepcopy(sample[0]); scene=copy.deepcopy(sample[1]); node=copy.deepcopy(sample[19]); component=copy.deepcopy(sample[22])
scene_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'zombie-defense/Battle.scene'))
script_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'zombie-defense/BattleSceneController.ts'))
hexid=script_id.replace('-',''); alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
compressed=hexid[:5]+''.join(alphabet[int(hexid[i:i+3],16)>>6]+alphabet[int(hexid[i:i+3],16)&63] for i in range(5,32,3))
objects=[asset,scene,node,component]
asset['_name']='Battle'; scene['_name']='Battle';scene['_children']=[{'__id__':2}];scene['_components']=[];scene['_prefab']=None;scene['_id']=scene_id
node['_name']='Battle';node['_parent']={'__id__':1};node['_children']=[];node['_components']=[{'__id__':3}];node['_lpos']={'__type__':'cc.Vec3','x':0,'y':0,'z':0};node['_layer']=1;node['_id']='battle-root'
component['__type__']=compressed;component['node']={'__id__':2};component['_id']='battle-controller'
# Recursively copy global defaults and remap every serialized index.
remap={}
def add(index):
    if index in remap:return remap[index]
    new=len(objects);remap[index]=new;objects.append(None)
    def rewrite(v):
        if isinstance(v,dict):
            if '__id__' in v:return {'__id__':add(v['__id__'])}
            if '__uuid__' in v:return None
            return {k:rewrite(x) for k,x in v.items()}
        if isinstance(v,list):return [rewrite(x) for x in v]
        return v
    objects[new]=rewrite(sample[index]);return new
scene['_globals']={'__id__':add(sample[1]['_globals']['__id__'])}
(root/'assets/scenes').mkdir(parents=True,exist_ok=True)
(root/'assets/scenes/Battle.scene').write_text(json.dumps(objects,indent=2)+'\n')
for path,kind,ver,uid,files in [(root/'assets/scenes/Battle.scene','scene','1.1.38',scene_id,['.json']),*[(p,'typescript','4.0.23',script_id if p.name=='BattleSceneController.ts' else str(uuid.uuid5(uuid.NAMESPACE_URL,'zombie-defense/'+p.name)),[]) for p in (root/'assets/scripts/adapter').glob('*.ts')]]:
    Path(str(path)+'.meta').write_text(json.dumps({'ver':ver,'importer':kind,'imported':True,'uuid':uid,'files':files,'subMetas':{},'userData':{}},indent=2)+'\n')
print('Authored Battle.scene graph from official sample; controller type',compressed)
