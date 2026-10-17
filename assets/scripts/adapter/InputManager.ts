import { EventTouch, Input, input } from 'cc';
import { mapConfig, type BattleSession } from '../generated/core.js';
import { DragCommand, screenToMap, type Frame, type Point } from './contracts';
import type { PerfBudget } from './PerfBudget';
import type { HudController, HitBox } from './HudController';
export class InputManager {
  public readonly drag=new DragCommand();
  public selectedUnitIds:string[]=[];
  public selectionPreview:{start:Point;target:Point}|null=null;
  private button:{id:number;box:HitBox}|null=null;
  private selectionFinger:number|null=null;
  private selectionStartScreen:Point|null=null;
  public constructor(private readonly session:BattleSession,private readonly hud:HudController,private readonly frame:()=>Frame,private readonly metrics?:PerfBudget){
    input.on(Input.EventType.TOUCH_START,this.start,this);input.on(Input.EventType.TOUCH_MOVE,this.move,this);
    input.on(Input.EventType.TOUCH_END,this.end,this);input.on(Input.EventType.TOUCH_CANCEL,this.cancelTouch,this);
  }
  private point(e:EventTouch):Point {return e.getUILocation();}
  private map(e:EventTouch):Point {return screenToMap(this.point(e),this.frame(),mapConfig.battle_bounds);}
  private start(e:EventTouch):void {
    const id=e.getID();if(id===null)return;
    const p=this.point(e),button=this.hud.buttonAt(p);
    // A HUD touch cannot steal an already-owned map gesture (or another button).
    if(button){if(!this.drag.preview&&!this.selectionPreview&&!this.button){this.button={id,box:button};this.hud.setButtonPressed(button,true);}return;}
    if(this.button||this.selectionFinger!==null||this.drag.preview)return;
    if(this.hud.excludes(p))return;
    const m=this.map(e),f=this.frame();
    const inside=p.x>=f.x&&p.x<=f.x+f.width*f.scale&&p.y>=f.y&&p.y<=f.y+f.height*f.scale;
    const humans=this.session.battle.getUnits().filter(u=>u.faction==='human'&&u.hp>0&&u.active);
    const nearby=humans.filter(u=>Math.hypot(u.position.x-m.x,u.position.y-m.y)<=mapConfig.unit_selection_radius).map(u=>u.id);
    const aliveSelection=this.selectedUnitIds.filter(unitId=>humans.some(unit=>unit.id===unitId));
    const touchesSelection=nearby.some(unitId=>aliveSelection.includes(unitId));
    const group=touchesSelection?aliveSelection:nearby;
    if(group.length){
      this.selectedUnitIds=[...group];
      this.drag.begin(id,p,m,performance.now(),!inside||this.hud.excludes(p),true,group);
    }else if(inside&&!this.hud.excludes(p)){
      this.selectionFinger=id;this.selectionStartScreen={...p};
      this.selectionPreview={start:{...m},target:{...m}};
    }
  }
  private move(e:EventTouch):void {
    const id=e.getID();if(id===null)return;
    if(id===this.selectionFinger&&this.selectionPreview){this.selectionPreview.target=this.map(e);return;}
    this.drag.move(id,this.point(e),this.map(e));
  }
  private end(e:EventTouch):void {
    const id=e.getID();if(id===null)return;
    if(this.button?.id===id){const b=this.button;this.button=null;this.hud.setButtonPressed(b.box,false);if(this.hud.buttonAt(this.point(e))===b.box){this.metrics?.suspend();b.box.action();}return;}
    if(this.hud.excludes(this.point(e))){this.drag.cancel(id);if(id===this.selectionFinger)this.clearSelectionGesture();return;}
    const releasedAtMs=performance.now();
    if(id===this.selectionFinger&&this.selectionPreview&&this.selectionStartScreen){
      const distance=Math.hypot(this.point(e).x-this.selectionStartScreen.x,this.point(e).y-this.selectionStartScreen.y);
      if(distance>=8){
        const target=this.map(e);
        const box={left:Math.min(this.selectionPreview.start.x,target.x),
          right:Math.max(this.selectionPreview.start.x,target.x),
          top:Math.min(this.selectionPreview.start.y,target.y),
          bottom:Math.max(this.selectionPreview.start.y,target.y)};
        this.selectedUnitIds=this.session.battle.getUnits().filter(u=>u.faction==='human'&&u.hp>0&&u.active&&
          u.position.x>=box.left&&u.position.x<=box.right&&u.position.y>=box.top&&u.position.y<=box.bottom).map(u=>u.id);
      }
      this.clearSelectionGesture();return;
    }
    const command=this.drag.end(id,this.point(e),this.map(e),releasedAtMs);
    if(command&&!this.session.paused&&this.session.snapshot.result==='running'){
      // Observe authoritative acceptance rather than assuming a drag was accepted.
      if(this.session.moveGroup(command.unitIds,command.target.x,command.target.y))this.metrics?.command(releasedAtMs,performance.now());
    }
  }
  private cancelTouch(e:EventTouch):void {
    const id=e.getID();if(id===null)return;this.drag.cancel(id);
    if(id===this.selectionFinger)this.clearSelectionGesture();
    if(this.button?.id===id){this.hud.setButtonPressed(this.button.box,false);this.button=null;}
  }
  private clearSelectionGesture():void {this.selectionFinger=null;this.selectionStartScreen=null;this.selectionPreview=null;}
  public cancel():void {this.drag.cancel();this.clearSelectionGesture();if(this.button)this.hud.setButtonPressed(this.button.box,false);this.button=null;}
  public cancelBattlefield():void {this.drag.cancel();this.clearSelectionGesture();}
  public reset():void {this.cancel();this.selectedUnitIds=[];this.drag.reset();}
  public destroy():void {
    input.off(Input.EventType.TOUCH_START,this.start,this);input.off(Input.EventType.TOUCH_MOVE,this.move,this);
    input.off(Input.EventType.TOUCH_END,this.end,this);input.off(Input.EventType.TOUCH_CANCEL,this.cancelTouch,this);this.cancel();
  }
}
