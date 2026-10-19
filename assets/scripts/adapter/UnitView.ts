import { Graphics, Node } from 'cc';
import type { BattleEvent, Unit, CivilianEntity } from '../generated/core.js';
import { unitConfig } from '../generated/core.js';
import { arrow, color, graphics, palette, unitColor } from './drawing';
/** One shared Graphics stream avoids a component/node allocation per entity per frame. */
export class UnitView {
  private readonly g:Graphics;
  private readonly hitFlashes=new Map<string,number>();
  private readonly deaths=new Map<string,number>();
  private readonly selectionStarted=new Map<string,number>();
  private readonly meleePulses=new Map<string,{x:number;y:number;started:number}>();
  private readonly infectionPulses=new Map<string,{x:number;y:number;started:number}>();
  private readonly shots=new Map<string,number>();
  public constructor(parent:Node){this.g=graphics('Units',parent);}
  public releaseTransient():void {this.hitFlashes.clear();this.deaths.clear();this.selectionStarted.clear();this.meleePulses.clear();this.infectionPulses.clear();this.shots.clear();}
  public get retainedDeaths():number {return this.deaths.size;}
  public clear():void {this.releaseTransient();this.g.clear();}
  private weapon(u:Unit,time:number,fade:number):void {
    if(u.unitType!=='sniper'&&u.unitType!=='engineer')return;
    const g=this.g,engineer=u.unitType==='engineer';
    const facing=engineer&&u.state==='Moving'?u.velocity:u.facing;
    const length=Math.hypot(facing.x,facing.y);
    const dx=length>1e-6?facing.x/length:0,dy=length>1e-6?-facing.y/length:1;
    const x=u.position.x,y=-u.position.y;
    const point=(along:number,across:number)=>({x:x+dx*along-dy*across,y:y+dy*along+dx*across});
    const segment=(a:number,b:number,c:number,d:number)=>{
      const start=point(a,b),end=point(c,d);g.moveTo(start.x,start.y);g.lineTo(end.x,end.y);g.stroke();
    };
    const shape=(points:readonly (readonly [number,number])[],tint:string)=>{
      g.fillColor=color(tint,Math.round(255*fade));
      points.forEach(([along,across],index)=>{const p=point(along,across);if(index===0)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);});
      g.close();g.fill();
    };
    const shotAge=time-(this.shots.get(u.id)??-Infinity);
    const recoil=u.hp>0?Math.max(0,1-shotAge/(engineer?.1:.2))*4:0;
    if(!engineer){
      shape([[-10-recoil,-4],[12-recoil,-4],[12-recoil,4],[-10-recoil,6]],'#244866');
      g.strokeColor=color('#B8EFFF',Math.round(255*fade));g.lineWidth=4;
      segment(10-recoil,0,35-recoil,0);
      shape([[0-recoil,5],[13-recoil,5],[13-recoil,9],[0-recoil,9]],'#182D42');
      g.strokeColor=color(palette.sniper,Math.round(255*fade));g.lineWidth=2;segment(3-recoil,7,10-recoil,7);
    }else{
      const progress=u.state==='Deploying'?u.stateElapsed_s/unitConfig.engineer.deploy_duration_s:
        u.state==='Dismantling'?1-u.stateElapsed_s/unitConfig.engineer.dismantle_duration_s:
        ['Deployed','Overheated','Cooling'].includes(u.state)?1:0;
      const clamped=Math.max(0,Math.min(1,progress)),spread=clamped*clamped*(3-2*clamped);
      if(spread>0){
        const legs=[[-10,23*spread],[-10,-23*spread],[26*spread,0]] as const;
        for(const [width,tint] of [[5,'#29383D'],[2.5,'#B7C2C6']] as const){
          g.strokeColor=color(tint,Math.round(255*fade));g.lineWidth=width;
          for(const [along,across] of legs)segment(8,0,along,across);
        }
      }
      if(u.state==='Moving'&&u.hp>0){
        const stride=Math.sin(time*16)*5;
        g.fillColor=color('#FBC86A',Math.round(245*fade));
        for(const side of [-1,1]){const p=point(side*stride-7,side*10);g.circle(p.x,p.y,4);g.fill();}
      }
      const lift=-7*(1-spread),end=24+10*spread-recoil;
      shape([[-15,-10],[-5,-10],[-5,8],[-15,8]],'#8B631E');
      shape([[2-recoil,lift-5],[17-recoil,lift-5],[17-recoil,lift+5],[2-recoil,lift+5]],'#35454A');
      g.strokeColor=color('#D2DDE0',Math.round(255*fade));g.lineWidth=5;segment(16-recoil,lift,end,lift);
      shape([[3,lift-6],[13,lift-6],[13,lift-14],[3,lift-14]],palette.engineer);
      g.strokeColor=color('#FCE2A0',Math.round(255*fade));g.lineWidth=2;segment(6,lift-8,10,lift-8);
    }
    if(recoil>0){
      const muzzle=point((engineer?34:35)-recoil,0);
      g.fillColor=color(engineer?'#FFE2A1':'#B8F3FF',Math.round(255*recoil/4*fade));
      g.circle(muzzle.x,muzzle.y,3+recoil);g.fill();
    }
  }
  private waitingProgress(u:Unit,r:number):void {
    if(u.hp<=0||u.faction!=='human'||(u.unitType!=='engineer'&&u.unitType!=='flamethrower'))return;
    const engineer=u.unitType==='engineer';
    const cfg=unitConfig;
    let progress:number|undefined;
    let tint=unitColor(u);
    if(u.state==='Deploying')progress=u.stateElapsed_s/cfg.engineer.deploy_duration_s;
    else if(u.state==='Dismantling'){progress=u.stateElapsed_s/cfg.engineer.dismantle_duration_s;tint=palette.command;}
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
    const g=this.g,w=Math.max(engineer?64:44,r*2+12),h=engineer?7:5,x=u.position.x-w/2,y=-u.position.y-r-(engineer?24:13);
    g.fillColor=color('#101923',240);g.roundRect(x-2,y-2,w+4,h+4,3);g.fill();
    g.fillColor=color('#455363',230);g.rect(x,y,w,h);g.fill();
    g.fillColor=color(tint);g.rect(x,y,w*Math.max(0,Math.min(1,progress)),h);g.fill();
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
    for(const [id,started] of Array.from(this.hitFlashes))if(!byId.has(id)||byId.get(id)?.state==='StoredInGut'||time-started>=.15-1e-9)this.hitFlashes.delete(id);
    for(const [id,started] of Array.from(this.deaths))if(!byId.has(id))this.deaths.delete(id);
    for(const [id,started] of Array.from(this.shots))if(time-started>=.22||!byId.has(id))this.shots.delete(id);
    for(const event of events){
      if(event.type==='projectile_spawned'){
        const data=event.data as {sourceId:string;projectileKind:string};
        if(data.projectileKind==='sniper'||data.projectileKind==='machine_gun')this.shots.set(data.sourceId,time);
      }else if(event.type==='damage'){
        const data=event.data as {sourceId?:string;targetId?:string;appliedAmount?:number};
        const source=data.sourceId?byId.get(data.sourceId):undefined;
        const target=data.targetId?byId.get(data.targetId):undefined;
        if(target?.faction==='zombie'&&(data.appliedAmount??0)>0&&target.state!=='StoredInGut'&&!this.hitFlashes.has(target.id))this.hitFlashes.set(target.id,time);
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
      const age=time-(this.hitFlashes.get(u.id)??-Infinity);
      const white=isZombie?Math.max(0,Math.min(1,1-(age-.02)/.08)):0;
      const body=white>0?'#'+[1,3,5].map(offset=>Math.round(parseInt(c.slice(offset,offset+2),16)*(1-white)+255*white).toString(16).padStart(2,'0')).join('').toUpperCase():c;
      g.fillColor=color(body,Math.round(((selected?230:180)*(1-white)+255*white)*fade));g.circle(u.position.x,-u.position.y,r);g.fill();
      this.weapon(u,time,fade);
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
      if((u.state==='Moving'||u.state==='Dismantling')&&u.moveTarget&&u.hp>0){
        const d=Math.hypot(u.moveTarget.x-u.position.x,u.moveTarget.y-u.position.y);
        if(d>0){
          const target={x:u.position.x+(u.moveTarget.x-u.position.x)*8/d,y:u.position.y+(u.moveTarget.y-u.position.y)*8/d};
          arrow(g,u.position,target,u.state==='Dismantling',5);
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
