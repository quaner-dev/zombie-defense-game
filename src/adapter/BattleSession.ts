import { BattleTestHarness } from '../core/BattleTestHarness.js';
import { DEFAULT_BATTLE_CONFIG } from '../core/config.js';
import type { BattleEvent } from '../core/types.js';
/** Engine clock/pause bridge; all rules and results stay in core. */
export class BattleSession {
  public readonly battle=new BattleTestHarness();
  private levelId='LV01_zombie_wave';
  public paused=false;
  public deploymentRemaining=DEFAULT_BATTLE_CONFIG.deploymentDuration_s;
  public events:BattleEvent[]=[];
  private cursor=0;
  public get snapshot(){return this.battle.getSnapshot();}
  public get waveCount(){return this.battle.getWaveCount();}
  public restart(levelId=this.levelId):void {
    this.levelId=levelId;this.battle.start(this.levelId,1);this.paused=false;
    this.deploymentRemaining=DEFAULT_BATTLE_CONFIG.deploymentDuration_s;this.cursor=0;this.events=[];
  }
  public tick(dt:number):void {
    this.events=[];
    if(this.paused||this.snapshot.result!=='running'||!Number.isFinite(dt)||dt<0)return;
    this.battle.advance(dt);
    this.deploymentRemaining=Math.max(0,this.deploymentRemaining-dt);
    const batch=this.battle.readEvents(this.cursor);this.cursor=batch.cursor;this.events=batch.events;
  }
  public moveGroup(ids:readonly string[],tx:number,ty:number):boolean {
    if(this.paused||this.snapshot.result!=='running')return false;
    return this.battle.issueMoveGroup(ids,tx,ty);
  }
  public move(x:number,y:number,tx:number,ty:number):boolean {
    if(this.paused||this.snapshot.result!=='running')return false;
    const before=this.battle.readEvents(this.cursor).cursor;
    this.battle.issueMoveAt(x,y,tx,ty);
    return this.battle.readEvents(before).events.some(e=>e.type==='group_command');
  }
}
