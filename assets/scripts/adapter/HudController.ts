import { Graphics, Label, Node, view } from 'cc';
import { SCENES, type BattleSession, type SceneDefinition } from '../generated/core.js';
import type { Point } from './contracts';
import { color, graphics, palette, uiNode } from './drawing';
import { diagnostics } from './RuntimeDiagnostics';

export interface HitBox {id:string;x:number;y:number;width:number;height:number;action:()=>void;pressed?:boolean;visible?:()=>boolean}

export class HudController {
  private readonly g:Graphics;
  private readonly status:Label;
  private readonly result:Label;
  private readonly pause:Label;
  private readonly waveBanner:Label;
  private readonly next:Label;
  private readonly menuTitle:Label;
  private readonly menuHint:Label;
  private readonly battleBoxes:HitBox[];
  private readonly modeBoxes:HitBox[];
  private readonly sceneBoxes:HitBox[];
  private readonly battleLabels:Label[]=[];
  private readonly modeLabels:Label[]=[];
  private readonly sceneLabels:Label[]=[];
  private waveIndex=0;
  private waveStarted=0;
  private menuScale=1;

  public constructor(private readonly root:Node,private readonly session:BattleSession,restart:()=>void,changed:()=>void=()=>{}){
    const action=(id:string,work:()=>unknown)=>()=>{
      diagnostics.run('session.action',work,{button:id,screen:session.screen,scene:session.activeScene.id});
      changed();
    };
    this.g=graphics('HUDPanels',root);
    this.status=this.label('Counts',0,0,1000,150,32);
    this.result=this.label('Result',0,0,1000,420,44);
    this.waveBanner=this.label('WaveBanner',540,1200,1000,180,72);
    this.waveBanner.node.active=false;
    this.waveBanner.enableOutline=true;this.waveBanner.outlineColor=color('#F2F2F7');this.waveBanner.outlineWidth=2;
    this.pause=this.label('Pause',0,0,260,100,34);
    const replay=this.label('Restart',0,0,260,100,34);replay.string='重新开始';
    const home=this.label('Home',0,0,160,90,28);home.string='返回首页';
    this.next=this.label('NextScene',0,0,700,100,36);
    this.battleLabels=[this.status,this.result,this.pause,replay,home,this.next];
    this.battleBoxes=[
      {id:'battle.pause',x:0,y:0,width:260,height:100,action:()=>{if(session.snapshot.result==='running')session.paused=!session.paused;}},
      {id:'battle.restart',x:0,y:0,width:260,height:100,action:restart},
      {id:'battle.home',x:0,y:0,width:160,height:90,action:action('battle.home',()=>session.returnToMenu())},
      {id:'battle.next',x:0,y:0,width:700,height:100,visible:()=>session.canAdvance,action:()=>{if(diagnostics.run('session.advance',()=>session.advanceScene()))changed();}},
    ];
    this.menuTitle=this.label('MenuTitle',0,0,960,180,64);
    this.menuHint=this.label('MenuHint',0,0,920,200,30);
    const story=this.label('StoryMode',0,0,800,210,38);
    story.string='故事模式\n从小屋突围，前往大楼楼下\n按顺序挑战 · 每个场景 3 波';
    const practice=this.label('PracticeMode',0,0,800,210,38);
    practice.string='场景演练\n自由选择小屋或大楼楼下\n独立挑战 · 每个场景 3 波';
    this.modeLabels=[story,practice];
    this.modeBoxes=[
      {id:'mode.story',x:0,y:0,width:860,height:240,action:action('mode.story',()=>session.startStory())},
      {id:'mode.practice',x:0,y:0,width:860,height:240,action:action('mode.practice',()=>session.showSceneSelection())},
    ];
    this.sceneBoxes=SCENES.map(scene=>({id:`scene.${scene.id}`,x:0,y:0,width:860,height:300,action:action(`scene.${scene.id}`,()=>session.startScene(scene.id))}));
    this.sceneLabels=SCENES.map(scene=>{
      const label=this.label(`Scene-${scene.id}`,0,0,620,260,34);
      label.string=`${scene.subtitle}\n${scene.title} · ${scene.level.waves.length} 波\n${scene.objective}`;
      return label;
    });
    const back=this.label('BackToModes',0,0,320,100,34);back.string='返回模式选择';this.sceneLabels.push(back);
    this.sceneBoxes.push({id:'scenes.back',x:0,y:0,width:320,height:100,action:action('scenes.back',()=>session.returnToMenu())});
  }

  public get boxes():HitBox[] {
    const boxes=this.session.screen==='menu'?this.modeBoxes:this.session.screen==='scenes'?this.sceneBoxes:this.battleBoxes;
    return boxes.filter(box=>!box.visible||box.visible());
  }

  public diagnosticState(){
    const labels=this.session.screen==='menu'?this.modeLabels:this.session.screen==='scenes'?this.sceneLabels:this.battleLabels;
    return {screen:this.session.screen,title:this.menuTitle.string,rootActive:this.root.active,
      buttons:this.boxes.map(({id,x,y,width,height,pressed})=>({id,x,y,width,height,pressed:!!pressed})),
      labels:labels.map(label=>({name:label.node.name,text:label.string,active:label.node.active,position:{x:label.node.position.x,y:label.node.position.y}}))};
  }

  private label(name:string,x:number,y:number,w:number,h:number,size:number):Label {
    const n=uiNode(name,this.root,w,h);n.setPosition(x,y);const l=n.addComponent(Label);
    l.fontSize=size;l.lineHeight=size+8;l.color=color('#F2F2F7');l.useSystemFont=true;return l;
  }

  public layout(safe:{x:number;y:number;width:number;height:number}):void {
    const cx=safe.x+safe.width/2,cy=safe.y+safe.height/2,top=safe.y+safe.height;
    this.status.node.setPosition(cx,top-90);this.result.node.setPosition(cx,cy);
    this.waveBanner.node.setPosition(cx,cy+280);
    const left=cx-290,right=cx+30,y=safe.y+20;
    this.battleBoxes[0].x=left;this.battleBoxes[1].x=right;
    this.battleBoxes[0].y=y;this.battleBoxes[1].y=y;
    this.pause.node.setPosition(left+130,y+50);
    this.root.getChildByName('Restart')!.setPosition(right+130,y+50);
    Object.assign(this.battleBoxes[2],{x:cx-480,y:y+5});this.root.getChildByName('Home')!.setPosition(cx-400,y+50);
    Object.assign(this.battleBoxes[3],{x:cx-350,y:cy-360});this.next.node.setPosition(cx,cy-310);
    const scale=this.menuScale=Math.min(1,safe.width/1040,safe.height/1800);
    this.menuTitle.node.setPosition(cx,cy+620*scale);this.menuTitle.node.setScale(scale,scale,1);
    this.menuHint.node.setPosition(cx,cy-610*scale);this.menuHint.node.setScale(scale,scale,1);
    for(let i=0;i<this.modeBoxes.length;i++){
      const box=this.modeBoxes[i];
      Object.assign(box,{x:cx-430*scale,y:cy+(i===0?120:-220)*scale,width:860*scale,height:240*scale});
      this.modeLabels[i].node.setPosition(cx,box.y+box.height/2);this.modeLabels[i].node.setScale(scale,scale,1);
    }
    for(let i=0;i<SCENES.length;i++){
      const box=this.sceneBoxes[i];
      Object.assign(box,{x:cx-430*scale,y:cy+(240-i*360)*scale-150*scale,width:860*scale,height:300*scale});
      this.sceneLabels[i].node.setPosition(cx+90*scale,box.y+box.height/2);this.sceneLabels[i].node.setScale(scale,scale,1);
    }
    const back=this.sceneBoxes[this.sceneBoxes.length-1];
    Object.assign(back,{x:cx-160*scale,y:cy-450*scale,width:320*scale,height:100*scale});
    this.sceneLabels[this.sceneLabels.length-1].node.setPosition(cx,back.y+back.height/2);
    this.sceneLabels[this.sceneLabels.length-1].node.setScale(scale,scale,1);
  }

  public excludes(p:Point):boolean {
    return this.session.screen!=='battle'||this.session.snapshot.result!=='running'||this.session.paused||this.boxes.some(b=>this.contains(b,p));
  }
  public buttonAt(p:Point):HitBox|undefined{return this.boxes.find(b=>this.contains(b,p));}
  public setButtonPressed(box:HitBox,pressed:boolean):void {box.pressed=pressed;}
  private contains(b:HitBox,p:Point):boolean {return p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;}
  public reset():void {
    this.waveIndex=0;this.waveStarted=0;this.waveBanner.node.active=false;
    for(const b of [...this.battleBoxes,...this.modeBoxes,...this.sceneBoxes])b.pressed=false;
  }
  private backdrop(alpha:number):void {
    const origin=view.getVisibleOrigin(),size=view.getVisibleSize();
    this.g.fillColor=color('#0B0B0F',alpha);this.g.rect(origin.x,origin.y,size.width,size.height);this.g.fill();
  }
  private buttons():void {
    for(const b of this.boxes){
      this.g.fillColor=color(b.pressed?'#355B61':'#202028',240);this.g.roundRect(b.x,b.y,b.width,b.height,16);this.g.fill();
      this.g.strokeColor=color(b.pressed?'#B7FFFF':palette.command);this.g.lineWidth=2;this.g.stroke();
    }
  }
  private thumbnail(scene:SceneDefinition,box:HitBox):void {
    const g=this.g,scale=this.menuScale,x=box.x+25*scale,y=box.y+35*scale,w=150*scale,h=230*scale;
    const {width=1080,height=2400}=scene.map.design_size??{};
    g.fillColor=color(scene.presentation.floorColor);g.rect(x,y,w,h);g.fill();
    g.fillColor=color(scene.presentation.wallColor);
    for(const wall of scene.map.terrain??[]){
      const b=wall.bounds;g.rect(x+b.left/width*w,y+(1-b.bottom/height)*h,(b.right-b.left)/width*w,(b.bottom-b.top)/height*h);g.fill();
    }
  }

  public render():void {
    const s=this.session.snapshot,g=this.g,inBattle=this.session.screen==='battle';g.clear();
    for(const l of this.battleLabels)l.node.active=inBattle;
    for(const l of this.modeLabels)l.node.active=this.session.screen==='menu';
    for(const l of this.sceneLabels)l.node.active=this.session.screen==='scenes';
    this.menuTitle.node.active=this.menuHint.node.active=!inBattle;
    if(!inBattle){
      this.waveBanner.node.active=false;this.backdrop(255);this.buttons();
      this.menuTitle.string=this.session.screen==='menu'?'四向僵尸防守\n选择出发方式':'场景演练\n选择作战地点';
      this.menuHint.string=this.session.screen==='menu'?'每个场景抵御 3 波尸潮\n按住士兵并拖动，利用墙体调整阵地':'选择任一场景开始独立挑战\n故事模式从小屋开始，通关后进入大楼楼下';
      if(this.session.screen==='scenes')for(let i=0;i<SCENES.length;i++)this.thumbnail(SCENES[i],this.sceneBoxes[i]);
      return;
    }
    if(s.result!=='running')this.backdrop(178);
    if(s.waveIndex!==this.waveIndex){this.waveIndex=s.waveIndex;this.waveStarted=s.time_s;}
    const age=s.time_s-this.waveStarted;
    this.waveBanner.node.active=s.result==='running'&&s.waveIndex>0&&age<.5;
    if(this.waveBanner.node.active){
      this.waveBanner.string=`第 ${s.waveIndex} 波`;
      const t=Math.min(1,Math.max(0,age/.5)),overshoot=1.70158;
      const scale=1+(overshoot+1)*Math.pow(t-1,3)+overshoot*Math.pow(t-1,2);
      this.waveBanner.node.setScale(.65+.35*scale,.65+.35*scale,1);
    }
    this.buttons();this.next.node.active=this.session.canAdvance;
    this.next.string=`进入${this.session.nextScene?.subtitle.split(' · ')[1]??'下一场景'}`;
    const mode=this.session.mode==='story'?'故事':'演练';
    this.status.string=`${mode} · ${this.session.activeScene.title} · ${this.session.initialHumans} 名守军 / ${this.session.waveCount} 波\n人类 ${s.aliveHumans}  ·  僵尸 ${s.aliveZombies}\n第 ${s.waveIndex}/${this.session.waveCount} 波   ${s.time_s.toFixed(1)} 秒`;
    this.pause.string=this.session.paused?'继续':'暂停';
    const victory=s.result==='win';
    const endTitle=victory?(this.session.mode==='story'&&!this.session.nextScene?'故事通关':'场景胜利'):'失败';
    const nextLocation=this.session.nextScene?.subtitle.split(' · ')[1]??this.session.nextScene?.title;
    const endHint=victory&&this.session.canAdvance?`${this.session.activeScene.title}已完成，前往${nextLocation}`:victory?'点击“重新开始”再次挑战':'点击“重新开始”再次布阵';
    const statNames:any={rifleman:'步枪兵',flamethrower:'喷火兵',shield:'盾兵',sniper:'狙击兵',engineer:'工兵机枪'};
    const statsText=s.result!=='running'&&s.stats?.byUnitType?Object.values(s.stats.byUnitType).map((v:any)=>`${statNames[v.unitType]}  击杀 ${v.kills}  伤害 ${Math.round(v.damage)}`).join('\\n'):'';
    this.result.string=s.result!=='running'?`${endTitle}\n${this.session.activeScene.title} · ${s.time_s.toFixed(1)} 秒\n存活 ${s.aliveHumans} 人 · 剩余僵尸 ${s.aliveZombies} 只\n${statsText}\n${endHint}`:this.session.paused?'已暂停':this.session.deploymentRemaining>0?`${this.session.activeScene.title}\n布阵 ${Math.ceil(this.session.deploymentRemaining)}\n拖动兵群调整位置`:'';
    if(this.result.string){
      const p=this.result.node.position;g.fillColor=color('#0B0B0F',220);g.roundRect(p.x-500,p.y-280,1000,560,20);g.fill();
    }
    const total=Math.max(1,s.aliveHumans+s.aliveZombies),p=this.status.node.position;
    g.fillColor=color(palette.zombie);g.rect(p.x-400,p.y-85,800,8);g.fill();
    g.fillColor=color(palette.human);g.rect(p.x-400,p.y-85,800*s.aliveHumans/total,8);g.fill();
  }
}
