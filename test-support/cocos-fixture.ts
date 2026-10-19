import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

// Only the unavailable cc event/render boundary is doubled. Production controller,
// HUD, InputManager, DragCommand and bundled core all execute unchanged.
export function fixture(real=false,platform?:unknown,diagnostics:{console:unknown;globals?:Record<string,unknown>}={console:{warn(){}}},initialViewport?:{origin:{x:number;y:number};size:{width:number;height:number};safe?:{x:number;y:number;width:number;height:number}},atMenu=false,transform?:(code:string)=>string) {
  const listeners=new Map<string,{fn:Function;owner:any}[]>();
  const input={on(type:string,fn:Function,owner:any){listeners.set(type,[...(listeners.get(type)??[]),{fn,owner}]);},
    off(type:string,fn:Function,owner:any){listeners.set(type,(listeners.get(type)??[]).filter(l=>l.fn!==fn||l.owner!==owner));}};
  class Node {
    children:Node[]=[]; components:any[]=[]; position={x:0,y:0}; scale={x:1,y:1}; active=true; name:string;
    constructor(name=''){this.name=name;}
    set parent(p:Node){p.children.push(this);}
    addComponent(C:any){const c=new C();c.node=this;this.components.push(c);return c;}
    setPosition(x:number,y:number){this.position={x,y};}
    setScale(x:number,y=x){this.scale={x,y};}
    getChildByName(name:string){return this.children.find(n=>n.name===name);}
    getComponent(C:any){return this.components.find(component=>component instanceof C);}
  }
  class Graphics {
    calls:any[]=[];fillColor:any;strokeColor:any;lineWidth=1;
    clear(){this.calls=[];} rect(...args:any[]){this.calls.push({kind:'rect',args,color:this.fillColor});}
    roundRect(...args:any[]){this.calls.push({kind:'roundRect',args,color:this.fillColor});}
    fill(){} stroke(){this.calls.push({kind:'stroke',color:this.strokeColor,width:this.lineWidth});}
    circle(...args:any[]){this.calls.push({kind:'circle',args,fill:this.fillColor,stroke:this.strokeColor});} moveTo(x:number,y:number){this.calls.push({kind:'moveTo',args:[x,y]});}
    lineTo(x:number,y:number){this.calls.push({kind:'lineTo',args:[x,y]});} close(){}
  }
  class Color {a=255;hex='';static fromHEX(c:Color,h:string){c.hex=h;}}
  class Label {string='';node:any;}
  const viewport=initialViewport??{origin:{x:0,y:0},size:{width:1080,height:2400}};
  const gameListeners=new Map<string,{fn:Function;owner:any}[]>();
  const game={frameRate:60,on(type:string,fn:Function,owner:any){gameListeners.set(type,[...(gameListeners.get(type)??[]),{fn,owner}]);},
    off(type:string,fn:Function,owner:any){gameListeners.set(type,(gameListeners.get(type)??[]).filter(l=>l.fn!==fn||l.owner!==owner));}};
  const cc={input,Input:{EventType:{TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',TOUCH_CANCEL:'cancel'}},
    _decorator:{ccclass:()=> (C:any)=>C},Component:function(){},Node,Graphics,Label,Color,
    Camera:class {static ProjectionType={ORTHO:0};},Canvas:class {},ResolutionPolicy:{SHOW_ALL:0},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},game,
    HorizontalTextAlignment:{LEFT:0,CENTER:1,RIGHT:2},VerticalTextAlignment:{TOP:0,CENTER:1,BOTTOM:2},
    Layers:{Enum:{UI_2D:1}},UITransform:class {width=0;height=0;setContentSize(width:number,height:number){this.width=width;this.height=height;}},
    view:{setDesignResolutionSize(){},on(){},off(){},getVisibleOrigin:()=>viewport.origin,getVisibleSize:()=>viewport.size},
    sys:{getSafeAreaRect:()=>initialViewport?.safe??({x:0,y:0,width:1080,height:2400})}};
  const code=buildSync({stdin:{contents:`export {BattleSceneController} from './assets/scripts/adapter/BattleSceneController'; export {InputManager} from './assets/scripts/adapter/InputManager'; export {HudController} from './assets/scripts/adapter/HudController'; export {UnitView} from './assets/scripts/adapter/UnitView';`,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',target:'es2020',tsconfigRaw:{compilerOptions:{experimentalDecorators:true}},external:['cc']}).outputFiles[0].text;
  const module={exports:{} as any};let now=1000;
  const runtime=vm.createContext({module,require:(id:string)=>{assert.equal(id,'cc');return cc;},wx:platform,performance:{now:()=>now},console:diagnostics.console,...diagnostics.globals});
  vm.runInContext(transform?transform(code):code,runtime);
  const exports=module.exports;
  const controller=new exports.BattleSceneController();
  if(real){controller.node=new Node('Battle');controller.onLoad();}
  else {controller.session.restart();controller.session.confirmRoster();}
  const root=real?controller.root:new Node('HUD');
  const hud=real?controller.hud:new exports.HudController(root,controller.session,()=>controller.restart());hud.layout(cc.sys.getSafeAreaRect());
  const controls=real?controller.controls:new exports.InputManager(controller.session,hud,()=>({x:0,y:0,width:1080,height:2400,scale:1}));
  if(!real)Object.assign(controller,{controls,hud,units:{clear(){}},projectiles:{clear(){}},draw:()=>hud.render()});
  const touch=(type:string,id:number,x:number,y:number)=>{for(const l of listeners.get(type)??[])l.fn.call(l.owner,{getID:()=>id,getUILocation:()=>({x,y})});};
  const button=(index:number,type:string,id=1)=>{const b=hud.boxes[index];touch(type,id,b.x+b.width/2,b.y+b.height/2);};
  // Existing combat regressions enter through the production story button.
  // New flow regressions opt into the untouched initial menu with atMenu=true.
  if(real&&!atMenu){button(0,'start');button(0,'end');button(11,'start');button(11,'end');}
  const group=()=>{const u=controller.session.battle.getUnits().find((u:any)=>u.faction==='human');return {x:u.position.x,y:2400-u.position.y};};
  const emitGame=(type:string)=>{for(const l of gameListeners.get(type)??[])l.fn.call(l.owner);};
  const confirm=()=>{button(11,'start');button(11,'end');};
  return {confirm,viewport,controller,hud,controls,root,touch,button,group,unitView:new exports.UnitView(new Node('Field')),platform,runtime,emitGame,setTime:(ms:number)=>{now=ms;},advanceTime:(ms:number)=>{now+=ms;}};
}

