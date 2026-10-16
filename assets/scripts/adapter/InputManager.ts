import { EventTouch, Input, input } from 'cc';
import { mapConfig, type BattleSession } from '../generated/core.js';
import { DragCommand, screenToMap, type Frame, type Point } from './contracts';
import type { PerfBudget } from './PerfBudget';
import type { HudController, HitBox } from './HudController';
export class InputManager {
  public readonly drag=new DragCommand();
  private button:{id:number;box:HitBox}|null=null;
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
    if(button){if(!this.drag.preview&&!this.button)this.button={id,box:button};return;}
    if(this.button)return;
    const m=this.map(e),f=this.frame();
    const inside=p.x>=f.x&&p.x<=f.x+f.width*f.scale&&p.y>=f.y&&p.y<=f.y+f.height*f.scale;
    const group=this.session.battle.getUnits().filter(u=>u.faction==='human'&&u.hp>0&&Math.hypot(u.position.x-m.x,u.position.y-m.y)<=mapConfig.unit_selection_radius).map(u=>u.id);
    this.drag.begin(id,p,m,performance.now(),!inside||this.hud.excludes(p),group.length>=2,group);
  }
  private move(e:EventTouch):void {const id=e.getID();if(id!==null)this.drag.move(id,this.point(e),this.map(e));}
  private end(e:EventTouch):void {
    const id=e.getID();if(id===null)return;
    if(this.button?.id===id){const b=this.button;this.button=null;if(this.hud.buttonAt(this.point(e))===b.box){this.metrics?.suspend();b.box.action();}return;}
    if(this.hud.excludes(this.point(e))){this.drag.cancel(id);return;}
    const releasedAtMs=performance.now();
    const command=this.drag.end(id,this.point(e),this.map(e),releasedAtMs);
    if(command&&!this.session.paused&&this.session.snapshot.result==='running'){
      // Observe authoritative acceptance rather than assuming a drag was accepted.
      if(this.session.moveGroup(command.unitIds,command.target.x,command.target.y))this.metrics?.command(releasedAtMs,performance.now());
    }
  }
  private cancelTouch(e:EventTouch):void {
    const id=e.getID();if(id===null)return;this.drag.cancel(id);
    if(this.button?.id===id)this.button=null;
  }
  public cancel():void {this.drag.cancel();this.button=null;}
  public cancelBattlefield():void {this.drag.cancel();}
  public reset():void {this.cancel();this.drag.reset();}
  public destroy():void {
    input.off(Input.EventType.TOUCH_START,this.start,this);input.off(Input.EventType.TOUCH_MOVE,this.move,this);
    input.off(Input.EventType.TOUCH_END,this.end,this);input.off(Input.EventType.TOUCH_CANCEL,this.cancelTouch,this);this.cancel();
  }
}
