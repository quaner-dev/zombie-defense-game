import { Graphics, Node } from 'cc';
import type { BattleEvent, Unit } from '../generated/core.js';
import { arrow, color, graphics, palette } from './drawing';
/** One shared Graphics stream avoids a component/node allocation per entity per frame. */
export class UnitView {
  private readonly g:Graphics;
  private readonly deaths=new Map<string,number>();
  private readonly selectionStarted=new Map<string,number>();
  private readonly meleePulses=new Map<string,{x:number;y:number;started:number}>();
  public constructor(parent:Node){this.g=graphics('Units',parent);}
  public releaseTransient():void {this.deaths.clear();this.selectionStarted.clear();this.meleePulses.clear();}
  public get retainedDeaths():number {return this.deaths.size;}
  public clear():void {this.deaths.clear();this.selectionStarted.clear();this.meleePulses.clear();this.g.clear();}
  public render(units:Unit[],selection:readonly string[]|null,time:number,events:readonly BattleEvent[]=[]):void {
    const g=this.g;g.clear();
    const byId=new Map(units.map(u=>[u.id,u]));
    for(const event of events){
      if(event.type!=='damage')continue;
      const data=event.data as {sourceId?:string;targetId?:string};
      const source=data.sourceId?byId.get(data.sourceId):undefined;
      const target=data.targetId?byId.get(data.targetId):undefined;
      if(source?.faction==='zombie'&&target?.faction==='human')
        this.meleePulses.set(target.id,{x:target.position.x,y:target.position.y,started:time});
    }
    for(const [id,pulse] of this.meleePulses){
      const age=time-pulse.started;
      if(age>=.24){this.meleePulses.delete(id);continue;}
      const progress=Math.max(0,age/.24);
      g.strokeColor=color(palette.warning,Math.round(220*(1-progress)));g.lineWidth=2;
      g.circle(pulse.x,-pulse.y,8+progress*18);g.stroke();
    }
    const selectedIds=new Set(selection??[]);
    for(const id of this.selectionStarted.keys())if(!selectedIds.has(id))this.selectionStarted.delete(id);
    for(const u of units){
      let fade=1;
      if(u.state==='Dead'){
        if(!this.deaths.has(u.id))this.deaths.set(u.id,time);
        fade=Math.max(0,1-(time-this.deaths.get(u.id)!)/.3);if(fade===0)continue;
      }
      const c=u.faction==='human'?palette.human:palette.zombie;
      const r=(u.faction==='human'?7:8)*fade;
      g.fillColor=color(c,Math.round(52*fade));g.circle(u.position.x,-u.position.y,r*1.5);g.fill();
      const selected=selection!==null&&u.hp>0&&selectedIds.has(u.id);
      g.fillColor=color(c,Math.round((selected?230:180)*fade));g.circle(u.position.x,-u.position.y,r);g.fill();
      if(selected){
        if(!this.selectionStarted.has(u.id))this.selectionStarted.set(u.id,time);
        const glow=Math.min(1,Math.max(0,(time-this.selectionStarted.get(u.id)!)/.15));
        g.strokeColor=color(palette.command,Math.round(80+140*glow));g.lineWidth=2;g.circle(u.position.x,-u.position.y,r+2+2*glow);g.stroke();
      }
      if(u.state==='Moving'&&u.moveTarget){
        const d=Math.hypot(u.moveTarget.x-u.position.x,u.moveTarget.y-u.position.y);
        if(d>0){
          const target={x:u.position.x+(u.moveTarget.x-u.position.x)*8/d,y:u.position.y+(u.moveTarget.y-u.position.y)*8/d};
          arrow(g,u.position,target,false,5);
          g.strokeColor=color(palette.command,150);g.lineWidth=1;g.circle(u.moveTarget.x,-u.moveTarget.y,3);g.stroke();
        }
      }
    }
    // Read-only AI feedback: target decisions stay in core, no hit box or command.
    const targets=new Set(units.filter(u=>u.faction==='human'&&u.hp>0&&u.state!=='Moving').map(u=>u.targetId));
    g.strokeColor=color('#F2F2F7',210);g.lineWidth=1;
    for(const u of units){
      if(u.faction!=='zombie'||u.hp<=0||!targets.has(u.id))continue;
      const x=u.position.x,y=-u.position.y;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        g.moveTo(x+dx*11,y+dy*11);g.lineTo(x+dx*17,y+dy*17);g.stroke();
      }
    }
  }
}
