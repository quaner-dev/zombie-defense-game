export interface FrameSample { intervalMs:number; coreMs:number; presentationMs:number }
/** Rolling wall-clock frame intervals, never simulation dt. CPU slices exclude GPU/present. */
export class FpsMonitor {
  private samples:FrameSample[]=[];
  private previous:number|null=null;
  public constructor(private readonly windowMs=1000,private readonly capacity=240){}
  public suspend():void {this.previous=null;}
  public reset():void {this.samples=[];this.suspend();}
  public frame(at:number,coreMs:number,presentationMs:number):void {
    if(!Number.isFinite(at)||!Number.isFinite(coreMs)||!Number.isFinite(presentationMs)||coreMs<0||presentationMs<0)return;
    const previous=this.previous;this.previous=at;
    if(previous===null||at<=previous)return;
    this.samples.push({intervalMs:at-previous,coreMs,presentationMs});
    let total=this.samples.reduce((n,s)=>n+s.intervalMs,0);
    while(this.samples.length>1&&(this.samples.length>this.capacity||total-this.samples[0].intervalMs>=this.windowMs))total-=this.samples.shift()!.intervalMs;
  }
  public snapshot(){
    const sampleCount=this.samples.length,elapsedMs=this.samples.reduce((n,s)=>n+s.intervalMs,0);
    return {sampleCount,elapsedMs,fps:elapsedMs?sampleCount*1000/elapsedMs:null,
      slowFrames:this.samples.filter(s=>s.intervalMs>200).length,
      overBudgetFrames:this.samples.filter(s=>s.intervalMs>1000/60+.01).length,
      maxFrameMs:Math.max(0,...this.samples.map(s=>s.intervalMs)),
      coreMs:sampleCount?this.samples.reduce((n,s)=>n+s.coreMs,0)/sampleCount:0,
      presentationMs:sampleCount?this.samples.reduce((n,s)=>n+s.presentationMs,0)/sampleCount:0};
  }
}
