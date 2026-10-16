import { Graphics, Node } from 'cc';
import { unitConfig, type BattleEvent } from '../generated/core';
import { ProjectileTracks } from './contracts';
import { color, graphics, line } from './drawing';
/** Reuses one engine mesh stream. Core owns hit timing/damage; this pool only draws. */
export class ProjectileViewPool {
  private readonly tracks=new ProjectileTracks();
  private readonly g:Graphics;
  public constructor(parent:Node){this.g=graphics('Projectiles',parent);}
  public get counts(){return this.tracks.counts;}
  public clear():void {this.tracks.clear();this.g.clear();}
  public render(events:BattleEvent[],time:number):void {
    this.tracks.consume(events);const g=this.g;g.clear();g.lineWidth=2;g.strokeColor=color('#E9FFFF');
    for(const p of this.tracks.positions(time,unitConfig.projectile.speed_px_per_s)){
      const dx=p.position.x-p.origin.x,dy=p.position.y-p.origin.y,d=Math.hypot(dx,dy);
      line(g,{x:p.position.x-(d?dx/d*Math.min(d,18):0),y:p.position.y-(d?dy/d*Math.min(d,18):0)},p.position);
    }
    g.fillColor=color('#FFFFFF');
    for(const h of this.tracks.hits){g.circle(h.position.x,-h.position.y,4);g.fill();}
  }
}
