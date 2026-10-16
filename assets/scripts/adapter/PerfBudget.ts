import { FpsMonitor } from './FpsMonitor';
interface CommandTiming {releasedAtMs:number;appliedAtMs:number;feedbackAtMs:number|null;responseMs:number|null}
/** Passive development telemetry. Clock requires performance.now (no Date fallback). */
export class PerfBudget {
  public warningsEnabled=false;
  private readonly frames=new FpsMonitor();
  private commands:CommandTiming[]=[];
  private pools={projectiles:0,hits:0,deaths:0};
  private lastWarning=-Infinity;
  public constructor(private readonly clock:()=>number=()=>performance.now(),private readonly warn:(message:string)=>void=message=>console.warn(message)){}
  public now():number {return this.clock();}
  public suspend():void {this.frames.suspend();this.commands=this.commands.filter(c=>c.feedbackAtMs!==null);}
  public reset():void {this.frames.reset();this.commands=[];this.pools={projectiles:0,hits:0,deaths:0};this.lastWarning=-Infinity;}
  public command(releasedAtMs:number,appliedAtMs:number):void {
    this.commands.push({releasedAtMs,appliedAtMs,feedbackAtMs:null,responseMs:null});
    if(this.commands.length>120)this.commands.shift();
  }
  /** Called after adapter draw submission, NOT after GPU presentation. */
  public feedback():void {
    const now=this.now();
    for(const c of this.commands)if(c.feedbackAtMs===null){c.feedbackAtMs=now;c.responseMs=Math.max(0,now-c.releasedAtMs);if(c.responseMs>100)this.warning('command adapter feedback exceeded 100ms',now);}
  }
  public frame(coreMs:number,presentationMs:number):void {
    const now=this.now();this.frames.frame(now,coreMs,presentationMs);
    const f=this.frames.snapshot();
    if(f.slowFrames>0||(f.elapsedMs>=1000&&f.fps!==null&&f.fps<50))this.warning('wall-frame budget exceeded (200ms spike / 50 FPS floor)',now);
  }
  private warning(message:string,now:number):void {
    if(this.warningsEnabled&&now-this.lastWarning>=5000){this.lastWarning=now;this.warn(`[performance] ${message}`);}
  }
  public recordPools(projectiles:number,hits:number,deaths:number):void {this.pools={projectiles,hits,deaths};}
  public snapshot(){return {frames:this.frames.snapshot(),commands:this.commands.map(c=>({...c})),pools:{...this.pools}};}
}
