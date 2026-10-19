// Engine-free presentation contracts. Points entering here use bottom-left UI coordinates.
export interface Point { x: number; y: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }
export interface Frame { x: number; y: number; scale: number; width: number; height: number }
export function fitMap(safe: {x:number;y:number;width:number;height:number}, width:number,height:number): Frame {
  if (![safe.width,safe.height,width,height].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid viewport');
  const scale=Math.min(safe.width/width,safe.height/height);
  return {x:safe.x+(safe.width-width*scale)/2,y:safe.y+(safe.height-height*scale)/2,scale,width,height};
}
/** Half of safe screen area, with symmetric HUD clearance and no cropping. */
export function fitBattlefield(safe:{x:number;y:number;width:number;height:number},width:number,height:number):Frame {
  const fit=fitMap(safe,width,height),u=Math.min(1,safe.width/1080,safe.height/1800);
  const scale=Math.min(fit.scale,Math.sqrt(.5*safe.width*safe.height/(width*height)),
    Math.max(1,safe.height-700*u)/height,Math.max(1,safe.width-40*u)/width);
  return {x:safe.x+(safe.width-width*scale)/2,y:safe.y+(safe.height-height*scale)/2,scale,width,height};
}
export function mapToScreen(p:Point,f:Frame):Point {return {x:f.x+p.x*f.scale,y:f.y+(f.height-p.y)*f.scale};}
export function screenToMap(p:Point,f:Frame,b:Bounds):Point {
  return {x:Math.max(b.left,Math.min(b.right,(p.x-f.x)/f.scale)),y:Math.max(b.top,Math.min(b.bottom,f.height-(p.y-f.y)/f.scale))};
}
export class DragCommand {
  private finger:number|null=null;
  private screen:Point={x:0,y:0};
  private beganAt=0;
  private anchorId:string|undefined;
  private startedDragging=false;
  public mode:'squad'|'single'='squad';
  private cooldownUntil=-Infinity;
  public preview:{start:Point;target:Point;unitIds:readonly string[]}|null=null;
  public begin(id:number,screen:Point,map:Point,ms:number,ui:boolean,group:boolean,unitIds:readonly string[]=[],anchorId=unitIds[0]):boolean {
    if(this.finger!==null||ui||!group||ms<this.cooldownUntil) return false;
    this.beganAt=ms;this.anchorId=anchorId;this.startedDragging=false;this.mode='squad';
    this.finger=id; this.screen={...screen}; this.preview={start:{...map},target:{...map},unitIds:[...unitIds]}; return true;
  }
  public update(ms:number):void {
    if(this.preview&&!this.startedDragging&&ms-this.beganAt>=450&&this.anchorId){
      this.mode='single';this.preview.unitIds=[this.anchorId];
    }
  }
  public move(id:number,screen:Point,map:Point,ms?:number):void {
    if(id!==this.finger||!this.preview)return;
    if(ms!==undefined)this.update(ms);
    if(Math.hypot(screen.x-this.screen.x,screen.y-this.screen.y)>=8)this.startedDragging=true;
    this.preview.target={...map};
  }
  public end(id:number,screen:Point,map:Point,ms:number):{start:Point;target:Point;unitIds:readonly string[]}|null {
    if(id!==this.finger||!this.preview)return null;
    this.move(id,screen,map,ms);
    const result={start:this.preview.start,target:map,unitIds:this.preview.unitIds};
    const distance=Math.hypot(screen.x-this.screen.x,screen.y-this.screen.y);
    this.cancel(); if(distance<8)return null;
    this.cooldownUntil=ms+300; return result;
  }
  public cancel(id?:number):void {if(id!==undefined&&id!==this.finger)return;this.finger=null;this.preview=null;}
  /** A new battle clears wall-time cooldown; ordinary cancellation does not. */
  public reset():void {this.cancel();this.cooldownUntil=-Infinity;}
}
interface Event {type:string;time_s:number;data:unknown}
export type ProjectileTrackKind = 'bullet' | 'flame' | 'sniper' | 'machine_gun';
export function projectileFeedbackDuration(kind:ProjectileTrackKind,normal_s:number):number {
  return kind==='sniper'?.24:normal_s;
}
interface Track {
  id:string;
  origin:Point;
  destination:Point;
  time:number;
  kind:ProjectileTrackKind;
  speed_px_per_s?:number;
  max_flight_time_s?:number;
}
export class ProjectileTracks {
  private active=new Map<string,Track>();
  // Keep the historical trail/hit/muzzle shapes stable for existing adapters,
  // while retaining the kind out-of-band for rendering variants.
  private trailKinds=new WeakMap<object,ProjectileTrackKind>();
  private hitKinds=new WeakMap<object,ProjectileTrackKind>();
  private muzzleKinds=new WeakMap<object,ProjectileTrackKind>();
  public hits:{position:Point;time:number;blocked:boolean}[]=[];
  public trails:{origin:Point;position:Point;time:number}[]=[];
  public muzzles:{position:Point;time:number}[]=[];
  public consume(events:Event[]):void {
    for(const e of events){
      if(e.type==='projectile_spawned'){
        const d=e.data as {id:string;origin:Point;destination:Point;projectileKind?:ProjectileTrackKind;speed_px_per_s?:number;max_flight_time_s?:number};
        const kind=d.projectileKind??'bullet';
        this.active.set(d.id,{...d,time:e.time_s,kind});
        const muzzle={position:d.origin,time:e.time_s};
        this.muzzles.push(muzzle);this.muzzleKinds.set(muzzle,kind);
      } else if(e.type==='projectile_hit'||e.type==='projectile_blocked'||e.type==='projectile_expired'){
        const d=e.data as {projectileId:string;position:Point};
        const track=this.active.get(d.projectileId);
        if(e.type!=='projectile_expired'&&track){
          const hit={position:d.position,time:e.time_s,blocked:e.type==='projectile_blocked'};
          this.hits.push(hit);this.hitKinds.set(hit,track.kind);
          // Retain the traveled segment even when spawn and impact share a frame.
          // Wall impacts use the actual contact point, never the intended target.
          const trail={origin:track.origin,position:d.position,time:e.time_s};
          this.trails.push(trail);this.trailKinds.set(trail,track.kind);
        }
        this.active.delete(d.projectileId);
      }
    }
  }
  public positions(time:number,speed:number):{id:string;position:Point;origin:Point;kind:ProjectileTrackKind}[]{
    this.hits=this.hits.filter(h=>time-h.time<projectileFeedbackDuration(this.kindForHit(h),.12));
    this.trails=this.trails.filter(t=>time-t.time<projectileFeedbackDuration(this.kindForTrail(t),.10));
    this.muzzles=this.muzzles.filter(m=>time-m.time<projectileFeedbackDuration(this.kindForMuzzle(m),.08));
    return Array.from(this.active.values(),t=>{
      const distance=Math.hypot(t.destination.x-t.origin.x,t.destination.y-t.origin.y);
      const effectiveSpeed=t.speed_px_per_s??speed;
      const age=Math.max(0,time-t.time);
      const traveled=t.max_flight_time_s===undefined?age*effectiveSpeed:Math.min(age,t.max_flight_time_s)*effectiveSpeed;
      const f=distance===0?1:Math.min(1,traveled/distance);
      return {id:t.id,origin:t.origin,kind:t.kind,position:{x:t.origin.x+(t.destination.x-t.origin.x)*f,y:t.origin.y+(t.destination.y-t.origin.y)*f}};
    });
  }
  public kindForTrail(trail:{origin:Point;position:Point;time:number}):ProjectileTrackKind{return this.trailKinds.get(trail as object)??'bullet';}
  public kindForHit(hit:{position:Point;time:number;blocked:boolean}):ProjectileTrackKind{return this.hitKinds.get(hit as object)??'bullet';}
  public kindForMuzzle(muzzle:{position:Point;time:number}):ProjectileTrackKind{return this.muzzleKinds.get(muzzle as object)??'bullet';}
  public get counts(){return {active:this.active.size,hits:this.hits.length};}
  public clear():void {
    this.active.clear();this.hits=[];this.trails=[];this.muzzles=[];
    this.trailKinds=new WeakMap();this.hitKinds=new WeakMap();this.muzzleKinds=new WeakMap();
  }
}
