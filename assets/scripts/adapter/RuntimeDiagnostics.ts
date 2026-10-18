/** Diagnostics must remain usable when the mini-game console or platform API fails. */
type Level='info'|'warn'|'error';
interface Entry {sequence:number;time:string;level:Level;event:string;data:unknown}
interface ErrorPlatform {
  onError?:(handler:(error:unknown)=>void)=>void;
  offError?:(handler:(error:unknown)=>void)=>void;
  onUnhandledRejection?:(handler:(error:unknown)=>void)=>void;
  offUnhandledRejection?:(handler:(error:unknown)=>void)=>void;
  getDeviceInfo?:()=>Record<string,unknown>;
  getWindowInfo?:()=>Record<string,unknown>;
}
declare const wx:ErrorPlatform|undefined;
declare const GameGlobal:Record<string,unknown>|undefined;
export const DIAGNOSTICS_VERSION='wechat-diagnostics-v1';

function snapshot(value:unknown,seen=new Set<object>(),depth=0):unknown {
  if(value===undefined)return null;
  if(typeof value==='number')return Number.isFinite(value)?value:String(value);
  if(typeof value!=='object'||value===null)return typeof value==='function'?String(value):typeof value==='bigint'?String(value):value;
  if(seen.has(value))return '[Circular]';
  if(depth>7)return '[Depth limit]';
  seen.add(value);
  try{
    if(Array.isArray(value))return value.slice(0,80).map(v=>snapshot(v,seen,depth+1));
    const result:Record<string,unknown>={};
    // Error properties are often non-enumerable, including across JS realms.
    const keys=new Set([...Object.keys(value).slice(0,80),'name','message','stack']);
    for(const key of Array.from(keys)){
      try{const item=(value as Record<string,unknown>)[key];if(item!==undefined)result[key]=snapshot(item,seen,depth+1);}
      catch{result[key]='[Unreadable]';}
    }
    return result;
  }finally{seen.delete(value);}
}

export class RuntimeDiagnostics {
  public enabled=true;
  private readonly history:Entry[]=[];
  private sequence=0;
  private readonly emitted=new Map<string,number>();
  private stateReader:()=>unknown=()=>({});
  private cleanup:(()=>void)|null=null;
  public now():number {
    try{const time=globalThis.performance?.now?.();if(Number.isFinite(time))return time!;}
    catch{ /* Wall time is sufficient for diagnostics only. */ }
    return Date.now();
  }
  public bindState(reader:()=>unknown):void {this.stateReader=reader;}
  public state():unknown {try{return snapshot(this.stateReader());}catch(error){return {stateError:snapshot(error)};}}
  public entries():Entry[] {return this.history.map(entry=>({...entry,data:snapshot(entry.data)}));}
  public dump():string {return this.history.map(entry=>JSON.stringify(entry)).join('\n');}
  public due(key:string,intervalMs=5000):boolean {
    const now=this.now(),last=this.emitted.get(key);
    if(last!==undefined&&now-last<intervalMs)return false;
    this.emitted.set(key,now);return true;
  }
  public info(event:string,data:unknown={}):void {this.write('info',event,data);}
  public warn(event:string,data:unknown={}):void {this.write('warn',event,data);}
  public error(event:string,error:unknown,data:unknown={}):void {
    // An exception on every update must not itself flood DevTools and stall it.
    if(this.due(`error:${event}`))this.write('error',event,{error,context:data,state:this.state()});
  }
  public run<T>(stage:string,work:()=>T,data:unknown={}):T {
    const start=this.now();this.info(`${stage}:start`,data);
    try{const result=work();this.info(`${stage}:complete`,{elapsedMs:this.now()-start});return result;}
    catch(error){this.error(`${stage}:failed`,error,data);throw error;}
  }
  private write(level:Level,event:string,data:unknown):void {
    if(!this.enabled)return;
    try{
      const entry:Entry={sequence:++this.sequence,time:new Date().toISOString(),level,event,data:snapshot(data)};
      this.history.push(entry);if(this.history.length>300)this.history.shift();
      // Serialize immediately: DevTools must show values at the time of the event.
      const line=`[ZombieDefense] ${event} ${JSON.stringify(entry)}`;
      const output=globalThis.console;
      const method=level==='info'?output?.log:output?.[level];
      const fallback=output?.log;
      if(typeof method==='function')method.call(output,line);
      else if(typeof fallback==='function')fallback.call(output,line);
    }catch{ /* Logging must never interrupt a touch, scene transition or frame. */ }
  }
  public install():void {
    if(this.cleanup)return;
    const detach:(()=>void)[]=[];
    const expose=(target:Record<string,unknown>)=>{
      try{
        const previous=target.__ZOMBIE_DEFENSE_DEBUG__;target.__ZOMBIE_DEFENSE_DEBUG__=this;
        detach.push(()=>{if(target.__ZOMBIE_DEFENSE_DEBUG__===this){if(previous===undefined)delete target.__ZOMBIE_DEFENSE_DEBUG__;else target.__ZOMBIE_DEFENSE_DEBUG__=previous;}});
      }catch(error){this.warn('diagnostics.expose-failed',{error});}
    };
    expose(globalThis as unknown as Record<string,unknown>);
    if(typeof GameGlobal!=='undefined'&&GameGlobal!==globalThis)expose(GameGlobal);
    const platform=typeof wx==='undefined'?undefined:wx;
    const error=(value:unknown)=>this.error('runtime.uncaught-error',value);
    const rejection=(value:unknown)=>this.error('runtime.unhandled-rejection',value);
    try{
      if(typeof platform?.onError==='function'){
        platform.onError(error);detach.push(()=>platform.offError?.(error));
      }
      if(typeof platform?.onUnhandledRejection==='function'){
        platform.onUnhandledRejection(rejection);detach.push(()=>platform.offUnhandledRejection?.(rejection));
      }
      if(!platform&&typeof globalThis.addEventListener==='function'){
        const onError=(event:ErrorEvent)=>error(event.error??{message:event.message,filename:event.filename,line:event.lineno,column:event.colno});
        const onRejection=(event:PromiseRejectionEvent)=>rejection(event.reason);
        globalThis.addEventListener('error',onError);globalThis.addEventListener('unhandledrejection',onRejection);
        detach.push(()=>{globalThis.removeEventListener('error',onError);globalThis.removeEventListener('unhandledrejection',onRejection);});
      }
    }catch(value){this.warn('diagnostics.error-hooks-failed',{error:value});}
    this.cleanup=()=>{for(const stop of detach)try{stop();}catch{ /* Optional API. */ }};
    this.info('diagnostics.ready',{version:DIAGNOSTICS_VERSION,capacity:300,platform:platform?'wechat':'other',export:'__ZOMBIE_DEFENSE_DEBUG__.dump()'});
    const device:Record<string,unknown>={};
    for(const method of ['getDeviceInfo','getWindowInfo'] as const){
      try{
        const info=platform?.[method]?.();
        if(info)for(const key of ['platform','brand','model','system','version','SDKVersion','screenWidth','screenHeight','windowWidth','windowHeight','pixelRatio','safeArea'])if(info[key]!==undefined)device[key]=info[key];
      }catch(value){this.warn('diagnostics.device-info-failed',{method,error:value});}
    }
    this.info('runtime.environment',device);
  }
  public uninstall():void {this.cleanup?.();this.cleanup=null;this.stateReader=()=>({});}
}

export const diagnostics=new RuntimeDiagnostics();
