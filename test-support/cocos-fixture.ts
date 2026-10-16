import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

// Only the unavailable cc event/render boundary is doubled. Production controller,
// HUD, InputManager, DragCommand and bundled core all execute unchanged.
export function fixture(real=false,platform?:unknown) {
  const listeners=new Map<string,{fn:Function;owner:any}[]>();
  const input={on(type:string,fn:Function,owner:any){listeners.set(type,[...(listeners.get(type)??[]),{fn,owner}]);},
    off(type:string,fn:Function,owner:any){listeners.set(type,(listeners.get(type)??[]).filter(l=>l.fn!==fn||l.owner!==owner));}};
  class Node {
    children:Node[]=[]; position={x:0,y:0}; scale={x:1,y:1}; active=true; name:string;
    constructor(name=''){this.name=name;}
    set parent(p:Node){p.children.push(this);}
    addComponent(C:any){const c=new C();c.node=this;return c;}
    setPosition(x:number,y:number){this.position={x,y};}
    setScale(x:number,y=x){this.scale={x,y};}
    getChildByName(name:string){return this.children.find(n=>n.name===name);}
  }
  class Graphics {
    calls:any[]=[];fillColor:any;strokeColor:any;
    clear(){this.calls=[];} rect(...args:any[]){this.calls.push({kind:'rect',args,color:this.fillColor});}
    roundRect(...args:any[]){this.calls.push({kind:'roundRect',args,color:this.fillColor});}
    fill(){} stroke(){}
    circle(...args:any[]){this.calls.push({kind:'circle',args});} moveTo(x:number,y:number){this.calls.push({kind:'moveTo',args:[x,y]});}
    lineTo(x:number,y:number){this.calls.push({kind:'lineTo',args:[x,y]});} close(){}
  }
  class Color {a=255;hex='';static fromHEX(c:Color,h:string){c.hex=h;}}
  class Label {string='';node:any;}
  const viewport={origin:{x:0,y:0},size:{width:1080,height:2400}};
  const cc={input,Input:{EventType:{TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',TOUCH_CANCEL:'cancel'}},
    _decorator:{ccclass:()=> (C:any)=>C},Component:class {},Node,Graphics,Label,Color,
    Camera:class {static ProjectionType={ORTHO:0};},Canvas:class {},ResolutionPolicy:{SHOW_ALL:0},Game:{EVENT_HIDE:'hide'},game:{on(){},off(){}},
    Layers:{Enum:{UI_2D:1}},UITransform:class {setContentSize(){}},
    view:{setDesignResolutionSize(){},on(){},off(){},getVisibleOrigin:()=>viewport.origin,getVisibleSize:()=>viewport.size},
    sys:{getSafeAreaRect:()=>({x:0,y:0,width:1080,height:2400})}};
  const code=buildSync({stdin:{contents:`export {BattleSceneController} from './assets/scripts/adapter/BattleSceneController'; export {InputManager} from './assets/scripts/adapter/InputManager'; export {HudController} from './assets/scripts/adapter/HudController'; export {UnitView} from './assets/scripts/adapter/UnitView';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',target:'es2020',tsconfigRaw:{compilerOptions:{experimentalDecorators:true}},external:['cc']}).outputFiles[0].text;
  const module={exports:{} as any};let now=1000;
  vm.runInNewContext(code,{module,require:(id:string)=>{assert.equal(id,'cc');return cc;},wx:platform,performance:{now:()=>now},console:{warn(){}}});
  const exports=module.exports;
  const controller=new exports.BattleSceneController();
  if(real){controller.node=new Node('Battle');controller.onLoad();}
  else controller.session.restart();
  const root=real?controller.root:new Node('HUD');
  const hud=real?controller.hud:new exports.HudController(root,controller.session,()=>controller.restart());hud.layout(cc.sys.getSafeAreaRect());
  const controls=real?controller.controls:new exports.InputManager(controller.session,hud,()=>({x:0,y:0,width:1080,height:2400,scale:1}));
  if(!real)Object.assign(controller,{controls,hud,units:{clear(){}},projectiles:{clear(){}},draw:()=>hud.render()});
  const touch=(type:string,id:number,x:number,y:number)=>{for(const l of listeners.get(type)??[])l.fn.call(l.owner,{getID:()=>id,getUILocation:()=>({x,y})});};
  const button=(index:number,type:string,id=1)=>{const b=hud.boxes[index];touch(type,id,b.x+b.width/2,b.y+b.height/2);};
  const group=()=>{const u=controller.session.battle.getUnits().find((u:any)=>u.faction==='human');return {x:u.position.x,y:2400-u.position.y};};
  return {viewport,controller,hud,controls,root,touch,button,group,unitView:new exports.UnitView(new Node('Field')),platform,setTime:(ms:number)=>{now=ms;},advanceTime:(ms:number)=>{now+=ms;}};
}

