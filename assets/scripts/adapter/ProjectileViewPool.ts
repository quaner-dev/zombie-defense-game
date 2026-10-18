import { Graphics, Node } from 'cc';
import { unitConfig, type BattleEvent, type Unit, type MapModel } from '../generated/core.js';
import { ProjectileTracks } from './contracts';
import { color, graphics, line, palette } from './drawing';
/** Reuses one engine mesh stream. Core owns hit timing/damage; this pool only draws. */
export class ProjectileViewPool {
  private readonly tracks=new ProjectileTracks();
  private readonly g:Graphics;
  public constructor(parent:Node){this.g=graphics('Projectiles',parent);}
  public get counts(){return this.tracks.counts;}
  public clear():void {this.tracks.clear();this.g.clear();}
  /** A flame is attached to its soldier; flicker changes its silhouette, never its origin. */
  private anchoredFlame(unit:Unit,time:number,map?:MapModel):void {
    const length=unit.flameLength_px;
    if(unit.unitType!=='flamethrower'||unit.faction!=='human'||unit.hp<=0||!(length>0))return;
    if(!['Firing','ReleasingFlame','RetractingFlame'].includes(unit.state))return;
    const facingLength=Math.hypot(unit.facing.x,unit.facing.y);
    const dx=facingLength>1e-9?unit.facing.x/facingLength:0,dy=facingLength>1e-9?unit.facing.y/facingLength:-1;
    const g=this.g,origin=unit.position;
    const nozzle=Math.min(length,(unit.radius_px??15)*.65);
    const phase=Array.from(unit.id).reduce((sum,c)=>sum+c.charCodeAt(0),0);
    for(const [reach,width,tint,alpha] of [[1,1,palette.flame,145],[.92,.66,palette.flameGlow,205],[.72,.28,'#FFF0AD',230]] as const){
      g.fillColor=color(tint,alpha);
      g.moveTo(origin.x+dx*nozzle,-(origin.y+dy*nozzle));
      for(let i=0;i<=12;i++){
        const across=(i/12*2-1)*width;
        const flicker=.94+.06*Math.sin(time*26+i*2.4+phase);
        const forward=length*reach*flicker;
        const spread=unitConfig.flamethrower.area_radius_px*forward/unitConfig.flamethrower.attack_range_px*across;
        const endpoint={x:origin.x+dx*forward-dy*spread,y:origin.y+dy*forward+dx*spread};
        const point=map?.firstBlockingTerrain(origin,endpoint)?.point??endpoint;
        g.lineTo(point.x,-point.y);
      }
      g.close();g.fill();
    }
  }
  /** Layered expanding lobes read as a broad spray even at phone scale. */
  private flame(origin:{x:number;y:number},tip:{x:number;y:number},time:number,alpha=1):void {
    const g=this.g,dx=tip.x-origin.x,dy=tip.y-origin.y,d=Math.hypot(dx,dy);
    if(d<1e-6)return;
    const nx=-dy/d,ny=dx/d;
    for(let i=1;i<=7;i++){
      const t=i/7,w=unitConfig.flamethrower.area_radius_px*t;
      const flicker=Math.sin(time*32+i*2.1)*w*.12;
      const x=origin.x+dx*t+nx*flicker,y=origin.y+dy*t+ny*flicker;
      g.fillColor=color(palette.flame,Math.round((55+35*t)*alpha));
      g.circle(x,-y,Math.max(3,w));g.fill();
      g.fillColor=color(palette.flameGlow,Math.round(135*alpha));
      g.circle(x,-y,Math.max(2,w*.58));g.fill();
      g.fillColor=color('#FFF0AD',Math.round(180*alpha));
      g.circle(x,-y,Math.max(1.5,w*.24));g.fill();
    }
  }
  public render(events:BattleEvent[],time:number,units:readonly Unit[]=[],map?:MapModel):void {
    this.tracks.consume(events);const g=this.g;g.clear();
    for(const unit of units)this.anchoredFlame(unit,time,map);
    const flying=this.tracks.positions(time,unitConfig.projectile.speed_px_per_s);
    for(const t of this.tracks.trails){
      const fade=1-Math.max(0,time-t.time)/.10;
      if(this.tracks.kindForTrail(t)==='flame'){
        this.flame(t.origin,t.position,time,fade);
        g.lineWidth=6;g.strokeColor=color(palette.flame,Math.round(190*fade));line(g,t.origin,t.position);
        g.lineWidth=2;g.strokeColor=color(palette.flameGlow,Math.round(220*fade));line(g,t.origin,t.position);
      }else{
        const kind=this.tracks.kindForTrail(t);
        g.lineWidth=kind==='machine_gun'?7:kind==='bullet'?6:3;g.strokeColor=color('#FFE2A1',Math.round(170*fade));
        line(g,t.origin,t.position);
      }
    }
    for(const p of flying){
      const dx=p.position.x-p.origin.x,dy=p.position.y-p.origin.y,d=Math.hypot(dx,dy);
      // Show only the distance already traveled; never draw ahead to the target.
      if(p.kind==='flame'){
        this.flame(p.origin,p.position,time);
        g.lineWidth=3.5;g.strokeColor=color(palette.flame,150);line(g,p.origin,p.position);
        const tailLength=Math.min(d,56);
        g.lineWidth=7;g.strokeColor=color(palette.flameGlow,180);
        line(g,{x:p.position.x-(d?dx/d*tailLength:0),y:p.position.y-(d?dy/d*tailLength:0)},p.position);
        g.fillColor=color(palette.flameGlow,110);g.circle(p.position.x,-p.position.y,7);g.fill();
        g.fillColor=color(palette.flame);g.circle(p.position.x,-p.position.y,4);g.fill();
      }else{
        g.lineWidth=p.kind==='machine_gun'?5:p.kind==='bullet'?4.5:2.5;g.strokeColor=color('#FFE2A1',150);line(g,p.origin,p.position);
        g.lineWidth=p.kind==='machine_gun'?7:p.kind==='bullet'?6:4;g.strokeColor=color('#FFF4CC');
        line(g,{x:p.position.x-(d?dx/d*Math.min(d,44):0),y:p.position.y-(d?dy/d*Math.min(d,44):0)},p.position);
        g.fillColor=color('#FFFFFF');g.circle(p.position.x,-p.position.y,2.8);g.fill();
      }
    }
    for(const m of this.tracks.muzzles){
      const progress=Math.max(0,time-m.time)/.08;
      const kind=this.tracks.kindForMuzzle(m);
      g.fillColor=color(kind==='flame'?palette.flameGlow:kind==='sniper'?'#7BE7FF':'#FFD477',Math.round(220*(1-progress)));
      g.circle(m.position.x,-m.position.y,(kind==='flame'?7:5)+progress*(kind==='flame'?5:3));g.fill();
      if(kind==='flame'){
        g.fillColor=color(palette.flame,Math.round(210*(1-progress)));
        g.circle(m.position.x,-m.position.y,3+progress*2);g.fill();
      }
    }
    for(const h of this.tracks.hits){
      const age=Math.max(0,time-h.time),progress=Math.min(1,age/.12);
      if(this.tracks.kindForHit(h)==='flame'){
        g.fillColor=color(palette.flameGlow,Math.round(230*(1-progress)));g.circle(h.position.x,-h.position.y,5+progress*15);g.fill();
        g.fillColor=color(palette.flame,Math.round(250*(1-progress)));g.circle(h.position.x,-h.position.y,3+progress*8);g.fill();
      }else{
        g.fillColor=color(h.blocked?'#FFC46B':'#FFFFFF',Math.round(255*(1-progress)));
        g.circle(h.position.x,-h.position.y,3+progress*7);g.fill();
      }
    }
  }
}
