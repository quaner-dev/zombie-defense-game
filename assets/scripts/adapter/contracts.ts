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
interface Track {id:string;origin:Point;destination:Point;time:number}
export class ProjectileTracks {
  private active=new Map<string,Track>();
  public hits:{position:Point;time:number}[]=[];
  public consume(events:Event[]):void {
    for(const e of events){
      if(e.type==='projectile_spawned'){
        const d=e.data as {id:string;origin:Point;destination:Point};
        this.active.set(d.id,{...d,time:e.time_s});
      } else if(e.type==='projectile_hit'||e.type==='projectile_expired'){
        const d=e.data as {projectileId:string;position:Point};
        if(e.type==='projectile_hit'&&this.active.has(d.projectileId))this.hits.push({position:d.position,time:e.time_s});
        this.active.delete(d.projectileId);
      }
    }
  }
  public positions(time:number,speed:number):{id:string;position:Point;origin:Point}[]{
    this.hits=this.hits.filter(h=>time-h.time<.12);
    return [...this.active.values()].map(t=>{
      const distance=Math.hypot(t.destination.x-t.origin.x,t.destination.y-t.origin.y);
      const f=distance===0?1:Math.min(1,Math.max(0,time-t.time)*speed/distance);
      return {id:t.id,origin:t.origin,position:{x:t.origin.x+(t.destination.x-t.origin.x)*f,y:t.origin.y+(t.destination.y-t.origin.y)*f}};
    });
  }
  public get counts(){return {active:this.active.size,hits:this.hits.length};}
  public clear():void {this.active.clear();this.hits=[];}
}
