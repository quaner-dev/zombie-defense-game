import { EventTouch, Input, input } from 'cc';
import type { BattleSession } from '../generated/core.js';
import { DragCommand, screenToMap, type Frame, type Point } from './contracts';
import type { PerfBudget } from './PerfBudget';
import type { HudController, HitBox } from './HudController';
import { diagnostics } from './RuntimeDiagnostics';
export class InputManager {
  public readonly drag=new DragCommand();
  public selectedUnitIds:string[]=[];
  public selectionPreview:{center:Point;radius:number}|null=null;
  private button:{id:number;box:HitBox}|null=null;
  private dragFinger:number|null=null;
  private lastTouch:unknown=null;
  public constructor(private readonly session:BattleSession,private readonly hud:HudController,private readonly frame:()=>Frame,private readonly metrics?:PerfBudget){
    input.on(Input.EventType.TOUCH_START,this.onStart,this);input.on(Input.EventType.TOUCH_MOVE,this.onMove,this);
    input.on(Input.EventType.TOUCH_END,this.onEnd,this);input.on(Input.EventType.TOUCH_CANCEL,this.onCancel,this);
    diagnostics.info('input.listeners-ready',{events:['touch-start','touch-move','touch-end','touch-cancel']});
  }
  private dispatch(phase:string,e:EventTouch,handle:(event:EventTouch)=>void):void {
    try{
      const id=e.getID(),point=this.point(e);
      this.lastTouch={phase,id,point:{x:point.x,y:point.y},screen:this.session.screen,atMs:diagnostics.now()};
      if(phase!=='move'||diagnostics.due('input.move',500))diagnostics.info(`input.touch-${phase}`,this.lastTouch);
      handle.call(this,e);
    }catch(error){diagnostics.error(`input.${phase}:failed`,error,this.lastTouch);throw error;}
  }
  private onStart(e:EventTouch):void {this.dispatch('start',e,this.start);}
  private onMove(e:EventTouch):void {this.dispatch('move',e,this.move);}
  private onEnd(e:EventTouch):void {this.dispatch('end',e,this.end);}
  private onCancel(e:EventTouch):void {this.dispatch('cancel',e,this.cancelTouch);}
  public diagnosticState(){return {lastTouch:this.lastTouch,heldButton:this.button?.box.id??null,dragFinger:this.dragFinger,selectedUnitIds:[...this.selectedUnitIds]};}
  private ignored(reason:string):void {diagnostics.info('input.ignored',{reason,screen:this.session.screen,heldButton:this.button?.box.id??null,dragFinger:this.dragFinger});}
  private point(e:EventTouch):Point {return e.getUILocation();}
  private map(e:EventTouch):Point {return screenToMap(this.point(e),this.frame(),this.session.map.battle_bounds);}
  private start(e:EventTouch):void {
    const id=e.getID();if(id===null){this.ignored('missing-touch-id');return;}
    const p=this.point(e),button=this.hud.buttonAt(p);
    // A HUD touch cannot steal an already-owned map gesture (or another button).
    if(button){
      if(!this.drag.preview&&!this.selectionPreview&&!this.button){this.button={id,box:button};this.hud.setButtonPressed(button,true);diagnostics.info('input.button-pressed',{id:button.id,point:p});}
      else this.ignored('another-touch-owns-gesture');
      return;
    }
    if(this.button||this.drag.preview){this.ignored('another-touch-owns-gesture');return;}
    if(this.hud.excludes(p)){this.ignored('hud-excluded-or-button-miss');return;}
    const f=this.frame();
    // Selection stays centered on the actual finger even in the field margin;
    // only the eventual movement destination is clamped to battlefield bounds.
    const m=screenToMap(p,f,{left:0,top:0,right:f.width,bottom:f.height});
    const inside=p.x>=f.x&&p.x<=f.x+f.width*f.scale&&p.y>=f.y&&p.y<=f.y+f.height*f.scale;
    if(!inside||this.session.paused||this.session.snapshot.result!=='running'){this.ignored(!inside?'outside-battlefield':this.session.paused?'paused':'battle-ended');return;}
    const humans=this.session.battle.getUnits().filter(u=>u.faction==='human'&&u.hp>0&&u.active);
    const nearby=humans.filter(u=>Math.hypot(u.position.x-m.x,u.position.y-m.y)<=this.session.map.unit_selection_radius)
      .sort((a,b)=>Math.hypot(a.position.x-m.x,a.position.y-m.y)-Math.hypot(b.position.x-m.x,b.position.y-m.y)||
        (a.id<b.id?-1:a.id>b.id?1:0));
    // Re-sample the fixed circle on every press and capture only the closest
    // soldier. Empty drags select none; a later press never restores an old
    // multi-unit selection.
    const selected=nearby.length?[nearby[0].id]:[];
    if(this.drag.begin(id,p,m,performance.now(),false,true,selected)){
      this.dragFinger=id;
      this.selectedUnitIds=[...selected];
      this.selectionPreview={center:{...m},radius:this.session.map.unit_selection_radius};
      diagnostics.info('input.selection',{point:m,selectedUnitIds:selected,radius:this.session.map.unit_selection_radius});
    }else this.ignored('gesture-cooldown');
  }
  private move(e:EventTouch):void {
    const id=e.getID();if(id===null)return;
    this.drag.move(id,this.point(e),this.map(e));
  }
  private end(e:EventTouch):void {
    const id=e.getID();if(id===null)return;
    if(this.button?.id===id){
      const b=this.button;this.button=null;this.hud.setButtonPressed(b.box,false);
      const releasedOver=this.hud.buttonAt(this.point(e));
      if(releasedOver===b.box){
        this.metrics?.suspend();
        diagnostics.run('input.button-action',()=>b.box.action(),{id:b.box.id,screen:this.session.screen});
        diagnostics.info('input.button-action:state',{id:b.box.id,screen:this.session.screen,scene:this.session.activeScene.id,paused:this.session.paused});
      }else diagnostics.info('input.button-cancelled',{id:b.box.id,reason:'released-outside-button',releasedOver:releasedOver?.id??null});
      return;
    }
    if(this.hud.excludes(this.point(e))){this.ignored('release-in-hud-or-inactive-battle');this.cancelGesture(id);return;}
    const releasedAtMs=performance.now();
    const ownsGesture=this.drag.preview!==null&&this.dragFinger===id;
    if(ownsGesture&&!this.drag.preview!.unitIds.length){this.ignored('no-soldier-selected');this.cancelGesture(id);return;}
    const command=this.drag.end(id,this.point(e),this.map(e),releasedAtMs);
    if(ownsGesture){this.selectionPreview=null;this.dragFinger=null;}
    if(command?.unitIds.length&&!this.session.paused&&this.session.snapshot.result==='running'){
      // Observe authoritative acceptance rather than assuming a drag was accepted.
      const accepted=this.session.moveGroup(command.unitIds,command.target.x,command.target.y);
      diagnostics.info('input.move-command',{accepted,unitIds:command.unitIds,target:command.target});
      if(accepted)this.metrics?.command(releasedAtMs,performance.now());
    }else this.ignored(ownsGesture?'drag-below-threshold-or-inactive-battle':'unowned-touch-release');
  }
  private cancelTouch(e:EventTouch):void {
    const id=e.getID();if(id===null)return;this.cancelGesture(id);
    if(this.button?.id===id){diagnostics.info('input.button-cancelled',{id:this.button.box.id,reason:'touch-cancel'});this.hud.setButtonPressed(this.button.box,false);this.button=null;}
  }
  private cancelGesture(id?:number):void {
    if(id!==undefined&&id!==this.dragFinger)return;
    this.drag.cancel(id);this.dragFinger=null;this.selectionPreview=null;
  }
  public cancel(reason='reset'):void {
    if(this.button||this.drag.preview)diagnostics.info('input.cancelled',{reason,button:this.button?.box.id??null,dragFinger:this.dragFinger});
    this.cancelGesture();if(this.button)this.hud.setButtonPressed(this.button.box,false);this.button=null;
  }
  public cancelBattlefield():void {this.cancelGesture();}
  public reset():void {this.cancel();this.selectedUnitIds=[];this.drag.reset();}
  public destroy():void {
    input.off(Input.EventType.TOUCH_START,this.onStart,this);input.off(Input.EventType.TOUCH_MOVE,this.onMove,this);
    input.off(Input.EventType.TOUCH_END,this.onEnd,this);input.off(Input.EventType.TOUCH_CANCEL,this.onCancel,this);this.cancel('destroy');
    diagnostics.info('input.listeners-removed');
  }
}
