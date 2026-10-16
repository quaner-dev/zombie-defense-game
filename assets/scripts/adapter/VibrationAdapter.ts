/** Optional device feedback; never imported by the headless battle bundle. */
export interface ShortVibrationPlatform {
  vibrateShort?: (options:{fail:(error:unknown)=>void}) => void | Promise<unknown>;
}

type AdapterEvent={type?:string};
declare const wx:ShortVibrationPlatform|undefined;

export class VibrationAdapter {
  private lastVibrationMs=-Infinity;
  public constructor(private readonly platform:ShortVibrationPlatform|undefined,private readonly now:()=>number=()=>performance.now()){}

  public reset():void { this.lastVibrationMs=-Infinity; }

  public consume(events:readonly AdapterEvent[],active:boolean,terminal:boolean):void {
    if(!active||terminal||!events.some(e=>e.type==='route_breached'))return;
    const now=this.now();
    if(!Number.isFinite(now)||now-this.lastVibrationMs<1000)return;
    try {
      const vibrate=this.platform?.vibrateShort;
      if(typeof vibrate!=='function')return;
      // Throttle attempts too: an unavailable motor must not become a retry storm.
      this.lastVibrationMs=now;
      const result=vibrate.call(this.platform,{fail:()=>{}});
      if(result&&typeof (result as Promise<unknown>).catch==='function')void (result as Promise<unknown>).catch(()=>{});
    } catch { /* Device feedback must never affect simulation. */ }
  }
}

export function optionalWeChatVibration():ShortVibrationPlatform|undefined {
  return typeof wx==='undefined'?undefined:wx;
}