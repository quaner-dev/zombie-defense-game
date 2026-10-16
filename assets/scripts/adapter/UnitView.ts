import { Graphics, Node } from 'cc';
import type { Unit } from '../generated/core';
import { arrow, color, graphics, palette } from './drawing';
/** One shared Graphics stream avoids a component/node allocation per entity per frame. */
export class UnitView {
  private readonly g:Graphics;
  private readonly deaths=new Map<string,number>();
  public constructor(parent:Node){this.g=graphics('Units',parent);}
  public releaseTransient():void {this.deaths.clear();}
  public get retainedDeaths():number {return this.deaths.size;}
  public clear():void {this.deaths.clear();this.g.clear();}
  public render(units:Unit[],selection:readonly string[]|null,time:number):void {
    const g=this.g;g.clear();
    for(const u of units){
      let fade=1;
      if(u.state==='Dead'){
        if(!this.deaths.has(u.id))this.deaths.set(u.id,time);
        fade=Math.max(0,1-(time-this.deaths.get(u.id)!)/.3);if(fade===0)continue;
      }
      const c=u.faction==='human'?palette.human:palette.zombie;
      const r=(u.faction==='human'?7:8)*fade;
      g.fillColor=color(c,Math.round(52*fade));g.circle(u.position.x,-u.position.y,r*1.5);g.fill();
      const selected=selection&&u.hp>0&&selection.includes(u.id);
      g.fillColor=color(c,Math.round((selected?230:180)*fade));g.circle(u.position.x,-u.position.y,r);g.fill();
      if(selected){g.strokeColor=color(palette.command);g.lineWidth=2;g.circle(u.position.x,-u.position.y,r+4);g.stroke();}
      if(u.state==='Moving'&&u.moveTarget){
        const d=Math.hypot(u.moveTarget.x-u.position.x,u.moveTarget.y-u.position.y);
        if(d>0)arrow(g,u.position,{x:u.position.x+(u.moveTarget.x-u.position.x)*20/d,y:u.position.y+(u.moveTarget.y-u.position.y)*20/d});
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
