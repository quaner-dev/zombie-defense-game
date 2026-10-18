import { _decorator, Camera, Canvas, Color, Component, Game, Graphics, Layers, Node, ResolutionPolicy, UITransform, game, sys, view } from 'cc';
import { BattleSession, CORE_BUILD_ID, unitConfig } from '../generated/core.js';
import { fitMap, type Frame } from './contracts';
import { arrow, color, graphics, palette, uiNode } from './drawing';
import { MapView } from './MapView';
import { UnitView } from './UnitView';
import { ProjectileViewPool } from './ProjectileViewPool';
import { HudController } from './HudController';
import { PerfBudget } from './PerfBudget';
import { InputManager } from './InputManager';
import { optionalWeChatVibration, VibrationAdapter } from './VibrationAdapter';
import { diagnostics } from './RuntimeDiagnostics';
const {ccclass}=_decorator;
diagnostics.install();
diagnostics.info('bootstrap.controller-module-ready',{coreBuild:CORE_BUILD_ID});
@ccclass('BattleSceneController')
export class BattleSceneController extends Component {
  public readonly performance=new PerfBudget();
  public readonly diagnostics=diagnostics;
  private readonly session=diagnostics.run('session.create',()=>new BattleSession());
  private root!:Node;private field!:Node;private map!:MapView;private units!:UnitView;
  private projectiles!:ProjectileViewPool;private hud!:HudController;private controls!:InputManager;private preview!:Graphics;
  private frame!:Frame;
  private diagnosticFrames=0;
  private stage='created';
  private lastFrameAt=diagnostics.now();
  private hidden=false;
  private watchdog:ReturnType<typeof setInterval>|undefined;
  private eventCounts:Record<string,number>={};
  public vibration=new VibrationAdapter(optionalWeChatVibration(),()=>performance.now());
  public onLoad():void {
    diagnostics.install();diagnostics.bindState(()=>this.diagnosticState());
    if(typeof globalThis.setInterval==='function')this.watchdog=globalThis.setInterval(()=>{
      const age=diagnostics.now()-this.lastFrameAt;
      if(!this.hidden&&age>=5000)diagnostics.warn('runtime.update-stalled',{lastFrameAgeMs:age,state:diagnostics.state()});
    },5000);
    diagnostics.run('BattleSceneController.onLoad',()=>this.initialize(),{node:this.node?.name});
  }
  private diagnosticState(){
    return {stage:this.stage,screen:this.session.screen,mode:this.session.mode,scene:this.session.activeScene.id,
      paused:this.session.paused,hidden:this.hidden,deployment:this.session.deploymentRemaining,snapshot:this.session.snapshot,
      frames:this.diagnosticFrames,configuredFrameRate:game.frameRate,frame:this.frame,
      fieldActive:this.field?.active,hud:this.hud?.diagnosticState(),input:this.controls?.diagnosticState()};
  }
  private step<T>(stage:string,work:()=>T):T {this.stage=stage;return diagnostics.run(stage,work);}
  private initialize():void {
    // SHOW_ALL keeps the whole 1080x2400 design visible. The field is contained again
    // within the safe area with HUD reserves; no route is cropped on wide screens.
    view.setDesignResolutionSize(1080,2400,ResolutionPolicy.SHOW_ALL);
    this.root=this.step('scene.canvas-create',()=>uiNode('BattleCanvas',this.node));
    // Canvas children are center-relative. Keep the camera at the Canvas center;
    // Canvas alignment maintains the physical-window frustum on resize (half-height).
    this.stage='scene.camera-create';
    const cameraNode=new Node('UICamera');cameraNode.parent=this.root;cameraNode.setPosition(0,0,1000);
    const camera=cameraNode.addComponent(Camera);camera.projection=Camera.ProjectionType.ORTHO;camera.orthoHeight=1200;
    camera.clearColor=new Color(11,11,15,255);
    camera.near=1;camera.far=2000;camera.visibility=Layers.Enum.UI_2D;
    const canvas=this.root.addComponent(Canvas);canvas.cameraComponent=camera;canvas.alignCanvasWithScreen=true;
    this.step('scene.views-create',()=>{
      this.field=uiNode('Battlefield',this.root);this.map=new MapView(this.field);this.units=new UnitView(this.field);
      this.projectiles=new ProjectileViewPool(this.field);this.preview=graphics('CommandPreview',this.field);
    });
    // Canvas origin is its center. This child exposes bottom-left design coordinates.
    const hudRoot=uiNode('HUD',this.root);hudRoot.setPosition(-540,-1200);
    this.hud=this.step('scene.hud-create',()=>new HudController(hudRoot,this.session,()=>this.restart(),()=>this.sceneChanged()));
    this.controls=this.step('scene.input-create',()=>new InputManager(this.session,this.hud,()=>this.frame,this.performance));
    view.on('canvas-resize',this.layout,this);game.on(Game.EVENT_HIDE,this.hide,this);game.on(Game.EVENT_SHOW,this.show,this);
    this.sceneChanged();
    diagnostics.info('scene.ready',{
      camera:cameraNode.name,
      visible:view.getVisibleSize(),
      frame:this.frame,
      deployment:this.session.deploymentRemaining,
      screen:this.session.screen,configuredFrameRate:game.frameRate,
    });
  }
  private layout():void {
    this.step('layout',()=>this.applyLayout());
  }
  private applyLayout():void {
    const visible=view.getVisibleSize();
    const visibleWidth=Number.isFinite(visible.width)&&visible.width>0?visible.width:1080;
    const visibleHeight=Number.isFinite(visible.height)&&visible.height>0?visible.height:2400;
    const reportedSafe=sys.getSafeAreaRect();
    const safe=Number.isFinite(reportedSafe.width)&&Number.isFinite(reportedSafe.height)&&reportedSafe.width>0&&reportedSafe.height>0
      ? reportedSafe
      : {x:0,y:0,width:visibleWidth,height:visibleHeight};
    const bottomReserve=150,topReserve=220;
    const {width,height}=this.session.map.design_size;
    this.frame=fitMap({x:safe.x+20,y:safe.y+bottomReserve,width:Math.max(1,safe.width-40),height:Math.max(1,safe.height-topReserve-bottomReserve)},width,height);
    // Graphics uses (map.x, -map.y); place its origin at the fitted map's top-left.
    this.field.setPosition(this.frame.x-540,this.frame.y+this.frame.height*this.frame.scale-1200);
    this.field.setScale(this.frame.scale,this.frame.scale,1);
    this.hud.layout(safe);this.controls?.cancel('layout');
    diagnostics.info('layout.geometry',{
      visible:{width:visibleWidth,height:visibleHeight},
      safe,
      frame:this.frame,
      field:{x:this.field.position.x,y:this.field.position.y,scale:this.field.scale.x},
      hud:this.hud.diagnosticState(),
    });
  }
  private hide():void {
    this.hidden=true;this.performance.suspend();this.session.paused=true;this.controls.cancel('background');
    diagnostics.info('lifecycle.hide',diagnostics.state());
  }
  private show():void {
    this.hidden=false;this.lastFrameAt=diagnostics.now();this.performance.suspend();
    diagnostics.info('lifecycle.show',{paused:this.session.paused,screen:this.session.screen});
  }
  private sceneChanged():void {
    this.step('scene.transition',()=>this.applyScene());
  }
  private applyScene():void {
    diagnostics.info('scene.transition:state',{screen:this.session.screen,scene:this.session.activeScene.id,mode:this.session.mode});
    this.eventCounts={};
    this.performance.reset();this.controls.reset();this.vibration.reset();this.hud.reset();this.units.clear();this.projectiles.clear();
    if(this.field){
      this.field.active=this.session.screen==='battle';
      if(this.field.active)this.step('scene.map-set',()=>this.map.setScene(this.session.map,this.session.activeScene));
      this.layout();
    }
    this.draw();
    this.stage='idle';diagnostics.info('scene.first-draw:complete',this.diagnosticState());
  }
  private restart():void {
    this.step('session.restart',()=>this.session.restart());this.sceneChanged();
    diagnostics.info('restart',{
      result:this.session.snapshot.result,
      deployment:this.session.deploymentRemaining,
      units:this.session.battle.getUnits().length,
    });
  }
  public update(dt:number):void {
    this.lastFrameAt=diagnostics.now();this.diagnosticFrames++;
    try{this.updateFrame(dt);}catch(error){diagnostics.error(`update.${this.stage}:failed`,error,{dt,frame:this.diagnosticFrames});throw error;}
  }
  private updateFrame(dt:number):void {
    if(this.diagnosticFrames<=3){
      diagnostics.info('update',{
        frame:this.diagnosticFrames,
        dt,
        result:this.session.snapshot.result,
        deployment:this.session.deploymentRemaining,
        visible:view.getVisibleSize(),
        screen:this.session.screen,paused:this.session.paused,stage:this.stage,
      });
    }
    const measuring=this.session.screen==='battle'&&!this.session.paused&&this.session.snapshot.result==='running';
    if(!measuring)this.performance.suspend();
    const start=this.performance.now();
    this.stage='core.tick';
    this.session.tick(Math.min(Math.max(dt,0),.05));
    const afterCore=this.performance.now();
    for(const event of this.session.events){
      this.eventCounts[event.type]=(this.eventCounts[event.type]??0)+1;
      if(['wave_spawn','door_destroyed','route_breached','win','lose'].includes(event.type))diagnostics.info(`battle.${event.type}`,{time_s:event.time_s,data:event.data});
    }
    this.stage='feedback.vibration';
    this.vibration.consume(this.session.events,!this.session.paused,this.session.snapshot.result!=='running');
    if(this.session.paused||this.session.snapshot.result!=='running')this.controls.cancelBattlefield();
    this.draw();
    const afterDraw=this.performance.now();
    if(measuring){this.performance.feedback();this.performance.frame(afterCore-start,afterDraw-afterCore);}
    const timing={rawDt:dt,appliedDt:Math.min(Math.max(dt,0),.05),coreMs:afterCore-start,presentationMs:afterDraw-afterCore};
    if((dt>.2||afterDraw-start>200)&&diagnostics.due('frame.slow'))diagnostics.warn('frame.slow',{...timing,screen:this.session.screen,configuredFrameRate:game.frameRate});
    this.stage='idle';
    if(diagnostics.due('runtime.heartbeat')){
      diagnostics.info('runtime.heartbeat',{...timing,state:this.diagnosticState(),events:this.eventCounts,performance:this.performance.snapshot()});
      this.eventCounts={};
    }
  }
  private draw():void {
    this.stage='render.hud';
    if(this.session.screen!=='battle'){this.preview.clear();this.hud.render();return;}
    const s=this.session.snapshot,time=s.time_s+(3-this.session.deploymentRemaining);
    this.stage='render.map';this.map.render(s.breachedRoutes,time);
    // Off-map spawn centers must not leak into the physical HUD reserve above
    // the fitted field. Suppress their bodies, halos and AI target indicators.
    const visibleUnits=this.session.battle.getUnits().filter(u=>
      (s.result==='running'||u.hp>0)&&u.position.x>=0&&u.position.x<=this.frame.width&&
      u.position.y>=0&&u.position.y<=this.frame.height);
    this.stage='render.units';this.units.render(visibleUnits,this.controls.drag.preview?.unitIds??this.controls.selectedUnitIds,time,this.session.events);
    this.stage='render.projectiles';this.projectiles.render(this.session.events,s.time_s);
    if(s.result!=='running'){this.projectiles.clear();this.units.releaseTransient();}
    const pools=this.projectiles.counts;
    this.performance.recordPools(pools.active,pools.hits,this.units.retainedDeaths);
    this.preview.clear();
    const p=this.controls.drag.preview;
    if(p?.unitIds.length){
      arrow(this.preview,p.start,p.target,true);
      // One representative soldier shows the individual weapon range without
      // covering a large selection with overlapping circles.
      const soldier=visibleUnits.find(unit=>unit.id===p.unitIds[0]&&unit.hp>0);
      if(soldier){
        const unitColor=soldier.unitType==='flamethrower'?palette.flame:soldier.unitType==='shield'?palette.shield:palette.human;
        this.preview.strokeColor=color(unitColor,75);this.preview.lineWidth=1;
        const stats=unitConfig[soldier.unitType] as {attack_range_px?:number};
        if(stats.attack_range_px!==undefined){this.preview.circle(soldier.position.x,-soldier.position.y,stats.attack_range_px);this.preview.stroke();}
      }
    }
    const selection=this.controls.selectionPreview;
    if(selection){
      this.preview.strokeColor=color(palette.command,180);this.preview.lineWidth=2;
      this.preview.circle(selection.center.x,-selection.center.y,selection.radius);this.preview.stroke();
    }
    this.stage='render.hud';this.hud.render();
  }
  public onDestroy():void {
    diagnostics.info('lifecycle.destroy',{screen:this.session.screen,frames:this.diagnosticFrames});
    if(this.watchdog!==undefined)globalThis.clearInterval(this.watchdog);
    view.off('canvas-resize',this.layout,this);game.off(Game.EVENT_HIDE,this.hide,this);game.off(Game.EVENT_SHOW,this.show,this);this.controls?.destroy();
    diagnostics.uninstall();
  }
}
