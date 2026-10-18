import { Graphics, Node } from 'cc';
import type { BattleEvent, Unit, CivilianEntity } from '../generated/core.js';
import { unitConfig } from '../generated/core.js';
import { arrow, color, graphics, palette, unitColor } from './drawing';
/** One shared Graphics stream avoids a component/node allocation per entity per frame. */
export class UnitView {
  private readonly g:Graphics;
  private readonly deaths=new Map<string,number>();
  private readonly selectionStarted=new Map<string,number>();
  private readonly meleePulses=new Map<string,{x:number;y:number;started:number}>();
  private readonly infectionPulses=new Map<string,{x:number;y:number;started:number}>();
  public constructor(parent:Node){this.g=graphics('Units',parent);}
  public releaseTransient():void {this.deaths.clear();this.selectionStarted.clear();this.meleePulses.clear();this.infectionPulses.clear();}
  public get retainedDeaths():number {return this.deaths.size;}
  public clear():void {this.deaths.clear();this.selectionStarted.clear();this.meleePulses.clear();this.infectionPulses.clear();this.g.clear();}
  private waitingProgress(u:Unit,r:number):void {
    if(u.hp<=0||u.faction!=='human'||(u.unitType!=='engineer'&&u.unitType!=='flamethrower'))return;
    const engineer=u.unitType==='engineer';
    const cfg=unitConfig;
    let progress:number|undefined;
    let tint=unitColor(u);
    if(u.state==='Deploying')progress=u.stateElapsed_s/cfg.engineer.deploy_duration_s;
    else if(u.state==='Dismantling')progress=u.stateElapsed_s/cfg.engineer.dismantle_duration_s;
    else if(u.state==='RetractingFlame')progress=u.stateElapsed_s/cfg.flamethrower.retract_duration_s;
    else if(u.state==='ReleasingFlame')progress=u.stateElapsed_s/cfg.flamethrower.release_duration_s;
    else if(u.weaponCooldown_s>0){
      const cooling=engineer?(cfg.engineer.gun_heat_max-cfg.engineer.gun_cooling_threshold)/cfg.engineer.gun_cooling_rate_s:
        (cfg.flamethrower.heat_max-cfg.flamethrower.cooling_threshold)/cfg.flamethrower.cooling_rate_s;
      const lock=engineer?cfg.engineer.gun_overheat_lock_s:cfg.flamethrower.overheat_lock_s;
      progress=1-u.weaponCooldown_s/(lock+cooling);
      tint=u.weaponCooldown_s>cooling+1e-9?palette.warning:palette.command;
    }
    if(progress===undefined)return;
    const g=this.g,w=Math.max(44,r*2+12),x=u.position.x-w/2,y=-u.position.y-r-13;
    g.fillColor=color('#101923',240);g.roundRect(x-2,y-2,w+4,9,3);g.fill();
    g.fillColor=color('#455363',230);g.rect(x,y,w,5);g.fill();
    g.fillColor=color(tint);g.rect(x,y,w*Math.max(0,Math.min(1,progress)),5);g.fill();
  }
  public render(units:Unit[],selection:readonly string[]|null,time:number,events:readonly BattleEvent[]=[],civilians:readonly CivilianEntity[]=[]):void {
    const g=this.g;g.clear();
    for(const civilian of civilians){
      if(!civilian.active||civilian.state==='transformed')continue;
      const {x,y}=civilian.position,transforming=civilian.state==='transforming';
      const progress=Math.min(1,civilian.transformElapsed_s/.8);
      const body=transforming?'#4266AA':palette.civilian;
      const alpha=transforming?Math.round(170+65*Math.sin(time*24)):245;
      g.fillColor=color(palette.civilian,45);g.circle(x,-y,23);g.fill();
      g.fillColor=color(body,alpha);g.strokeColor=color('#B8DEFF');g.lineWidth=2;
      g.circle(x,-y,14);g.fill();g.stroke();
      // A small head-and-shoulders glyph identifies a civilian without a weapon.
      g.fillColor=color('#E1F1FF');g.circle(x,-y+4,4);g.fill();
      g.roundRect(x-6,-y-7,12,7,3);g.fill();
      if(transforming){
        g.fillColor=color('#172435');g.rect(x-20,-y-30,40,5);g.fill();
        g.fillColor=color(palette.warning);g.rect(x-20,-y-30,40*progress,5);g.fill();
      }
    }
    const byId=new Map(units.map(u=>[u.id,u]));
    for(const event of events){
      if(event.type==='damage'){
        const data=event.data as {sourceId?:string;targetId?:string};
        const source=data.sourceId?byId.get(data.sourceId):undefined;
        const target=data.targetId?byId.get(data.targetId):undefined;
        if(source?.faction==='zombie'&&target?.faction==='human')
          this.meleePulses.set(target.id,{x:target.position.x,y:target.position.y,started:time});
      }else if(event.type==='unit_infected'){
        const data=event.data as {humanId?:string};
        const infected=data.humanId?byId.get(data.humanId):undefined;
        if(infected)this.infectionPulses.set(infected.id,{x:infected.position.x,y:infected.position.y,started:time});
      }
    }
    for(const [id,pulse] of Array.from(this.meleePulses)){
      const age=time-pulse.started;
      if(age>=.24){this.meleePulses.delete(id);continue;}
      const progress=Math.max(0,age/.24);
      g.strokeColor=color(palette.warning,Math.round(220*(1-progress)));g.lineWidth=2;
      g.circle(pulse.x,-pulse.y,8+progress*18);g.stroke();
    }
    for(const [id,pulse] of Array.from(this.infectionPulses)){
      const age=time-pulse.started;
      if(age>=.4){this.infectionPulses.delete(id);continue;}
      const progress=Math.max(0,age/.4);
      g.strokeColor=color(palette.zombieMother,Math.round(235*(1-progress)));g.lineWidth=3;
      g.circle(pulse.x,-pulse.y,10+progress*22);g.stroke();
    }
    const selectedIds=new Set(selection??[]);
    for(const id of Array.from(this.selectionStarted.keys()))if(!selectedIds.has(id))this.selectionStarted.delete(id);
    for(const u of units){
      if(u.state==='StoredInGut')continue;
      let fade=1;
      if(u.state==='Dead'){
        if(!this.deaths.has(u.id))this.deaths.set(u.id,time);
        fade=Math.max(0,1-(time-this.deaths.get(u.id)!)/.3);if(fade===0)continue;
      }
      const isZombie=u.faction==='zombie';
      const c=unitColor(u);
      // The authoritative radius is already the doubled presentation size
      // (14px for the default human and 16px for the default zombie). Keep
      // the rendered body at that radius so the visual and collision sizes
      // agree instead of shrinking the new scale back to the old one.
      const r=(u.radius_px??(isZombie?16:14))*fade;
      g.fillColor=color(c,Math.round(52*fade));g.circle(u.position.x,-u.position.y,r*1.5);g.fill();
      const selected=selection!==null&&u.hp>0&&selectedIds.has(u.id);
      g.fillColor=color(c,Math.round((selected?230:180)*fade));g.circle(u.position.x,-u.position.y,r);g.fill();
      if(u.unitType==='shield'&&fade>0){
        // Shield direction follows the soldier's current target, then motion,
        // so it remains readable while aiming and during player commands.
        const target=u.targetId?byId.get(u.targetId):undefined;
        const mapDx=target?target.position.x-u.position.x:u.velocity.x;
        const mapDy=target?target.position.y-u.position.y:u.velocity.y;
        const drawDx=Math.abs(mapDx)+Math.abs(mapDy)>1e-6?mapDx:0;
        const drawDy=Math.abs(mapDx)+Math.abs(mapDy)>1e-6?-mapDy:1;
        const length=Math.hypot(drawDx,drawDy);
        const dx=drawDx/length,dy=drawDy/length;
        const px=-dy,py=dx;
        const cx=u.position.x,cy=-u.position.y;
        const front=r+7, width=Math.max(7,r*.72);
        g.fillColor=color(palette.shield,Math.round(220*fade));
        g.strokeColor=color('#6B8798',Math.round(245*fade));g.lineWidth=1.5;
        g.moveTo(cx+dx*front+px*(width*.62),cy+dy*front+py*(width*.62));
        g.lineTo(cx+dx*(front+10)+px*width,cy+dy*(front+10)+py*width);
        g.lineTo(cx+dx*(front+10)-px*width,cy+dy*(front+10)-py*width);
        g.lineTo(cx+dx*front-px*(width*.62),cy+dy*front-py*(width*.62));
        g.close();g.fill();g.stroke();
      }
      if(u.unitType==='fat_zombie'){
        g.strokeColor=color('#703E37',Math.round(225*fade));g.lineWidth=2;g.circle(u.position.x,-u.position.y,r*.62);g.stroke();
      }else if(u.unitType==='zombie_mother'){
        g.strokeColor=color('#F4E987',Math.round(235*fade));g.lineWidth=2;g.circle(u.position.x,-u.position.y,r+3);g.stroke();
        g.fillColor=color('#4B4A24',Math.round(230*fade));g.circle(u.position.x,-u.position.y,r*.26);g.fill();
      }
      if(u.state==='Climbing'&&u.stackLevel>0){
        const lift=u.stackLevel*5;
        g.strokeColor=color(palette.warning,230);g.lineWidth=2;
        g.circle(u.position.x,-u.position.y+lift,r+2);g.stroke();
        for(let level=0;level<u.stackLevel;level++){
          g.moveTo(u.position.x-5,-u.position.y+lift+12+level*4);
          g.lineTo(u.position.x+5,-u.position.y+lift+12+level*4);g.stroke();
        }
      }
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
      this.waitingProgress(u,r);
    }
    // Read-only AI feedback: target decisions stay in core, no hit box or command.
    const targets=new Set(units.filter(u=>u.faction==='human'&&u.hp>0).map(u=>u.targetId));
    g.strokeColor=color('#F2F2F7',210);g.lineWidth=1;
    for(const u of units){
      if(u.faction!=='zombie'||u.hp<=0||u.state==='StoredInGut'||!targets.has(u.id))continue;
      const x=u.position.x,y=-u.position.y;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        g.moveTo(x+dx*11,y+dy*11);g.lineTo(x+dx*17,y+dy*17);g.stroke();
      }
    }
  }
}
