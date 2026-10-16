import { _decorator, Camera, Canvas, Color, Component, Game, Graphics, Layers, Node, ResolutionPolicy, UITransform, game, sys, view } from 'cc';
import { BattleSession } from '../generated/core.js';
import { fitMap, type Frame } from './contracts';
import { arrow, graphics, uiNode } from './drawing';
import { MapView } from './MapView';
import { UnitView } from './UnitView';
import { ProjectileViewPool } from './ProjectileViewPool';
import { HudController } from './HudController';
import { PerfBudget } from './PerfBudget';
import { InputManager } from './InputManager';
import { optionalWeChatVibration, VibrationAdapter } from './VibrationAdapter';
const {ccclass}=_decorator;
const diagnosticLog=(...args:unknown[]):void=>globalThis.console?.log?.(...args);
@ccclass('BattleSceneController')
export class BattleSceneController extends Component {
  public readonly performance=new PerfBudget();
  private readonly session=new BattleSession();
  private root!:Node;private field!:Node;private map!:MapView;private units!:UnitView;
  private projectiles!:ProjectileViewPool;private hud!:HudController;private controls!:InputManager;private preview!:Graphics;
  private frame!:Frame;
  private diagnosticFrames=0;
  public vibration=new VibrationAdapter(optionalWeChatVibration(),()=>performance.now());
  public onLoad():void {
    diagnosticLog('[ZombieDefense] BattleSceneController.onLoad:start',this.node?.name);
    // SHOW_ALL keeps the whole 1080x2400 design visible. The field is contained again
    // within the safe area with HUD reserves; no route is cropped on wide screens.
    view.setDesignResolutionSize(1080,2400,ResolutionPolicy.SHOW_ALL);
    this.root=uiNode('BattleCanvas',this.node);
    // Map drawing uses bottom-left design coordinates and flips y to -0..-2400.
    // Keep the camera in that same coordinate space; otherwise the whole field
    // is outside the camera and Creator shows only its preview clear color.
    const cameraNode=new Node('UICamera');cameraNode.parent=this.node;cameraNode.setPosition(540,-1200,1000);
    const camera=cameraNode.addComponent(Camera);camera.projection=Camera.ProjectionType.ORTHO;camera.orthoHeight=2400;
    camera.clearColor=new Color(11,11,15,255);
    camera.near=1;camera.far=2000;camera.visibility=Layers.Enum.UI_2D;
    const canvas=this.root.addComponent(Canvas);canvas.cameraComponent=camera;canvas.alignCanvasWithScreen=true;
    this.field=uiNode('Battlefield',this.root);this.map=new MapView(this.field);this.units=new UnitView(this.field);
    this.projectiles=new ProjectileViewPool(this.field);this.preview=graphics('CommandPreview',this.field);
    // Canvas origin is its center. This child exposes bottom-left design coordinates.
    const hudRoot=uiNode('HUD',this.root);hudRoot.setPosition(-540,-1200);
    this.hud=new HudController(hudRoot,this.session,()=>this.restart());
    this.controls=new InputManager(this.session,this.hud,()=>this.frame,this.performance);
    view.on('canvas-resize',this.layout,this);game.on(Game.EVENT_HIDE,this.hide,this);
    this.layout();this.restart();
    diagnosticLog('[ZombieDefense] BattleSceneController.onLoad:complete',{
      camera:cameraNode.name,
      visible:view.getVisibleSize(),
      frame:this.frame,
      deployment:this.session.deploymentRemaining,
    });
  }
  private layout():void {
    const visible=view.getVisibleSize();
    const visibleWidth=Number.isFinite(visible.width)&&visible.width>0?visible.width:1080;
    const visibleHeight=Number.isFinite(visible.height)&&visible.height>0?visible.height:2400;
    const reportedSafe=sys.getSafeAreaRect();
    const safe=Number.isFinite(reportedSafe.width)&&Number.isFinite(reportedSafe.height)&&reportedSafe.width>0&&reportedSafe.height>0
      ? reportedSafe
      : {x:0,y:0,width:visibleWidth,height:visibleHeight};
    const bottomReserve=150,topReserve=220;
    this.frame=fitMap({x:safe.x+20,y:safe.y+bottomReserve,width:Math.max(1,safe.width-40),height:Math.max(1,safe.height-topReserve-bottomReserve)},1080,2400);
    this.field.setPosition(0,0);
    this.field.setScale(1,1,1);
    this.hud.layout(safe);this.controls?.cancel();
    diagnosticLog('[ZombieDefense] layout',{
      visible:{width:visibleWidth,height:visibleHeight},
      safe,
      frame:this.frame,
      field:{x:this.field.position.x,y:this.field.position.y,scale:this.field.scale.x},
    });
  }
  private hide():void {this.performance.suspend();this.session.paused=true;this.controls.cancel();}
  private restart():void {
    this.performance.reset();this.controls.reset();this.session.restart();this.vibration.reset();this.hud.reset();this.units.clear();this.projectiles.clear();this.draw();
    diagnosticLog('[ZombieDefense] restart',{
      result:this.session.snapshot.result,
      deployment:this.session.deploymentRemaining,
      units:this.session.battle.getUnits().length,
    });
  }
  public update(dt:number):void {
    if(this.diagnosticFrames<3){
      this.diagnosticFrames++;
      diagnosticLog('[ZombieDefense] update',{
        frame:this.diagnosticFrames,
        dt,
        result:this.session.snapshot.result,
        deployment:this.session.deploymentRemaining,
        visible:view.getVisibleSize(),
      });
    }
    const measuring=!this.session.paused&&this.session.snapshot.result==='running';
    if(!measuring)this.performance.suspend();
    const start=this.performance.now();
    this.session.tick(Math.min(Math.max(dt,0),.05));
    const afterCore=this.performance.now();
    this.vibration.consume(this.session.events,!this.session.paused,this.session.snapshot.result!=='running');
    if(this.session.paused||this.session.snapshot.result!=='running')this.controls.cancelBattlefield();
    this.draw();
    const afterDraw=this.performance.now();
    if(measuring){this.performance.feedback();this.performance.frame(afterCore-start,afterDraw-afterCore);}
  }
  private draw():void {
    const s=this.session.snapshot,time=s.time_s+(3-this.session.deploymentRemaining);
    this.map.render(s.breachedRoutes,time);
    this.units.render(this.session.battle.getUnits().filter(u=>s.result==='running'||u.hp>0),this.controls.drag.preview?.unitIds??null,time);
    this.projectiles.render(this.session.events,s.time_s);
    if(s.result!=='running'){this.projectiles.clear();this.units.releaseTransient();}
    const pools=this.projectiles.counts;
    this.performance.recordPools(pools.active,pools.hits,this.units.retainedDeaths);
    this.preview.clear();
    const p=this.controls.drag.preview;if(p)arrow(this.preview,p.start,p.target,true);
    this.hud.render();
  }
  public onDestroy():void {
    view.off('canvas-resize',this.layout,this);game.off(Game.EVENT_HIDE,this.hide,this);this.controls?.destroy();
  }
}
