import { BattleTestHarness } from '../core/BattleTestHarness.js';
import { DEFAULT_BATTLE_CONFIG } from '../core/config.js';
import { MapModel } from '../core/MapModel.js';
import { getScene, sceneForLevel, SCENES } from '../scenes/index.js';
import type { BattleEvent } from '../core/types.js';
/** Engine clock/pause bridge; all rules and results stay in core. */
export class BattleSession {
  private levelId=SCENES[0].levelId;
  private scene=SCENES[0];
  private readonly previewMap=MapModel.load(SCENES[0].mapId);
  public screen:'menu'|'scenes'|'battle'='menu';
  public mode:'story'|'practice'='story';
  public paused=true;
  public deploymentRemaining=DEFAULT_BATTLE_CONFIG.deploymentDuration_s;
  public events:BattleEvent[]=[];
  private cursor=0;
  public constructor(public readonly battle=new BattleTestHarness()){}
  public get snapshot(){return this.battle.getSnapshot();}
  public get waveCount(){return this.battle.getWaveCount();}
  public get initialHumans(){return this.battle.getInitialHumans();}
  public get activeScene(){return this.scene;}
  public get map(){return this.screen==='battle'?this.battle.getMapModel():this.previewMap;}
  public get nextScene(){return this.mode==='story'?SCENES[SCENES.indexOf(this.scene)+1]:undefined;}
  public get canAdvance(){return this.screen==='battle'&&this.snapshot.result==='win'&&!!this.nextScene;}
  public startStory():void {this.mode='story';this.restart(SCENES[0].levelId);}
  public startScene(sceneId:string):void {
    const scene=getScene(sceneId);
    this.mode='practice';this.restart(scene.levelId);
  }
  public showSceneSelection():void {this.screen='scenes';this.paused=true;this.events=[];}
  public returnToMenu():void {this.screen='menu';this.paused=true;this.events=[];}
  public advanceScene():boolean {
    if(!this.canAdvance)return false;
    this.restart(this.nextScene!.levelId);return true;
  }
  public restart(levelId=this.levelId):void {
    this.levelId=levelId;this.scene=sceneForLevel(levelId)??SCENES[0];
    this.battle.start(this.levelId,1);this.screen='battle';this.paused=false;
    this.deploymentRemaining=DEFAULT_BATTLE_CONFIG.deploymentDuration_s;this.cursor=0;this.events=[];
  }
  public tick(dt:number):void {
    this.events=[];
    if(this.screen!=='battle'||this.paused||this.snapshot.result!=='running'||!Number.isFinite(dt)||dt<0)return;
    this.battle.advance(dt);
    this.deploymentRemaining=Math.max(0,this.deploymentRemaining-dt);
    const batch=this.battle.readEvents(this.cursor);this.cursor=batch.cursor;this.events=batch.events;
  }
  public moveGroup(ids:readonly string[],tx:number,ty:number):boolean {
    if(this.screen!=='battle'||this.paused||this.snapshot.result!=='running')return false;
    return this.battle.issueMoveGroup(ids,tx,ty);
  }
  public move(x:number,y:number,tx:number,ty:number):boolean {
    if(this.screen!=='battle'||this.paused||this.snapshot.result!=='running')return false;
    const before=this.battle.readEvents(this.cursor).cursor;
    this.battle.issueMoveAt(x,y,tx,ty);
    return this.battle.readEvents(before).events.some(e=>e.type==='group_command');
  }
}
