// Engine-free presentation contracts. Points entering here use bottom-left UI coordinates.
export interface Point { x: number; y: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }
export interface Frame { x: number; y: number; scale: number; width: number; height: number }
export function fitMap(safe: {x:number;y:number;width:number;height:number}, width:number,height:number): Frame {
  if (![safe.width,safe.height,width,height].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid viewport');
  const scale=Math.min(safe.width/width,safe.height/height);
  return {x:safe.x+(safe.width-width*scale)/2,y:safe.y+(safe.height-height*scale)/2,scale,width,height};
}
export function mapToScreen(p:Point,f:Frame):Point {return {x:f.x+p.x*f.scale,y:f.y+(f.height-p.y)*f.scale};}
export function screenToMap(p:Point,f:Frame,b:Bounds):Point {
  return {x:Math.max(b.left,Math.min(b.right,(p.x-f.x)/f.scale)),y:Math.max(b.top,Math.min(b.bottom,f.height-(p.y-f.y)/f.scale))};
}
export class DragCommand {
  private finger:number|null=null;
  private screen:Point={x:0,y:0};
  private cooldownUntil=-Infinity;
  public preview:{start:Point;target:Point;unitIds:readonly string[]}|null=null;
  public begin(id:number,screen:Point,map:Point,ms:number,ui:boolean,group:boolean,unitIds:readonly string[]=[]):boolean {
    if(this.finger!==null||ui||!group||ms<this.cooldownUntil) return false;
    this.finger=id; this.screen={...screen}; this.preview={start:{...map},target:{...map},unitIds:[...unitIds]}; return true;
  }
  public move(id:number,_screen:Point,map:Point):void {if(id===this.finger&&this.preview)this.preview.target={...map};}
  public end(id:number,screen:Point,map:Point,ms:number):{start:Point;target:Point;unitIds:readonly string[]}|null {
    if(id!==this.finger||!this.preview)return null;
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
export type ProjectileTrackKind = 'bullet' | 'flame';
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
    this.hits=this.hits.filter(h=>time-h.time<.12);
    this.trails=this.trails.filter(t=>time-t.time<.10);
    this.muzzles=this.muzzles.filter(m=>time-m.time<.08);
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
