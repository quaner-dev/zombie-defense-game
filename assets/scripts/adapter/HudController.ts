import { Graphics, HorizontalTextAlignment, Label, Node, UITransform, VerticalTextAlignment, view } from 'cc';
import { SCENES, HUMAN_UNIT_TYPES, SOLDIER_NAMES, MAX_HUMANS, type BattleSession, type BattleSnapshot, type HumanUnitType, type SceneDefinition } from '../generated/core.js';
import { fitBattlefield, type Point } from './contracts';
import { color, graphics, palette, soldierColors, uiNode } from './drawing';
import { diagnostics } from './RuntimeDiagnostics';

export interface HitBox {id:string;x:number;y:number;width:number;height:number;action:()=>void;pressed?:boolean;visible?:()=>boolean;enabled?:()=>boolean}
interface Rect {x:number;y:number;width:number;height:number}
const rosterOrder:HumanUnitType[]=['rifleman','flamethrower','sniper','shield','engineer'];
const rosterNames:Record<HumanUnitType,string>={rifleman:'枪兵',flamethrower:'喷火兵',sniper:'狙击兵',shield:'盾兵',engineer:'工兵机枪'};

export class HudController {
  private readonly g:Graphics;
  private readonly status:Label;
  private readonly sceneTitle:Label;
  private readonly sceneMeta:Label;
  private readonly humanTotal:Label;
  private readonly zombieTotal:Label;
  private readonly countHint:Label;
  private readonly liveHint:Label;
  private readonly unitCountLabels:Record<HumanUnitType,Label>;
  private readonly result:Label;
  private readonly pause:Label;
  private readonly waveBanner:Label;
  private readonly gestureHint:Label;
  private readonly next:Label;
  private readonly menuTitle:Label;
  private readonly menuHint:Label;
  private readonly battleBoxes:HitBox[];
  private readonly modeBoxes:HitBox[];
  private readonly sceneBoxes:HitBox[];
  private readonly rosterBoxes:HitBox[]=[];
  private readonly selectionLabels:Label[]=[];
  private readonly rosterCounts:Label[]=[];
  private readonly rosterHint:Label;
  private rosterPreviewKey='';
  private rosterPreviewUnits:ReturnType<BattleSession['rosterPreview']>=[];
  private readonly battleLabels:Label[]=[];
  private readonly modeLabels:Label[]=[];
  private readonly sceneLabels:Label[]=[];
  private waveIndex=0;
  private waveStarted=0;
  private menuScale=1;
  private hudScale=1;
  private fieldArea:Rect={x:20,y:700,width:1040,height:1350};
  private statistics:Rect={x:36,y:250,width:1008,height:400};
  private header:Rect={x:0,y:2050,width:1080,height:350};
  private ratio:number|null=null;
  private ratioFrom=0;
  private ratioTarget=0;
  private ratioAge=.22;
  private readonly motionQuery=typeof globalThis.matchMedia==='function'?globalThis.matchMedia('(prefers-reduced-motion: reduce)'):undefined;

  public constructor(private readonly root:Node,private readonly session:BattleSession,restart:()=>void,changed:()=>void=()=>{}){
    const action=(id:string,work:()=>unknown)=>()=>{
      diagnostics.run('session.action',work,{button:id,screen:session.screen,scene:session.activeScene.id});
      changed();
    };
    this.g=graphics('HUDPanels',root);
    this.sceneTitle=this.label('SceneTitle',0,0,960,110,76);
    this.sceneTitle.isBold=true;this.sceneTitle.horizontalAlign=HorizontalTextAlignment.LEFT;
    this.sceneMeta=this.label('SceneMeta',0,0,960,70,30);
    this.sceneMeta.horizontalAlign=HorizontalTextAlignment.LEFT;this.sceneMeta.color=color('#919BA9');
    this.status=this.label('TaskStatus',0,0,960,210,28);
    this.status.horizontalAlign=HorizontalTextAlignment.LEFT;this.status.color=color('#A7B1BF');
    this.unitCountLabels={} as Record<HumanUnitType,Label>;
    for(const type of rosterOrder){
      const label=this.label(`Count-${type}`,0,0,260,85,34);
      label.color=color(soldierColors[type]);label.enableWrapText=false;
      this.unitCountLabels[type]=label;
    }
    this.humanTotal=this.label('HumanTotal',0,0,450,90,44);
    this.humanTotal.color=color(palette.human);this.humanTotal.horizontalAlign=HorizontalTextAlignment.LEFT;
    this.zombieTotal=this.label('ZombieTotal',0,0,450,90,44);
    this.zombieTotal.color=color(palette.zombie);this.zombieTotal.horizontalAlign=HorizontalTextAlignment.RIGHT;
    this.countHint=this.label('CountHint',0,0,944,60,26);
    this.countHint.horizontalAlign=HorizontalTextAlignment.LEFT;this.countHint.color=color('#758191');
    this.liveHint=this.label('LiveHint',0,0,160,60,26);this.liveHint.string='· 实时';
    this.liveHint.horizontalAlign=HorizontalTextAlignment.RIGHT;this.liveHint.color=color('#758191');
    this.result=this.label('Result',0,0,1000,420,44);
    this.waveBanner=this.label('WaveBanner',540,1200,1000,180,72);
    this.waveBanner.node.active=false;
    this.waveBanner.enableOutline=true;this.waveBanner.outlineColor=color('#F2F2F7');this.waveBanner.outlineWidth=2;
    this.gestureHint=this.label('MoveMode',0,0,700,48,28);
    this.gestureHint.color=color(palette.command);this.gestureHint.node.active=false;
    this.pause=this.label('Pause',0,0,260,100,34);
    const replay=this.label('Restart',0,0,260,100,34);replay.string='重新开始';
    const home=this.label('Home',0,0,160,90,28);home.string='返回首页';
    this.next=this.label('NextScene',0,0,700,100,36);
    this.battleLabels=[this.sceneTitle,this.sceneMeta,this.status,...rosterOrder.map(type=>this.unitCountLabels[type]),this.humanTotal,this.zombieTotal,this.countHint,this.liveHint,this.result,this.pause,replay,home,this.next,this.gestureHint];
    this.battleBoxes=[
      {id:'battle.pause',x:0,y:0,width:260,height:100,action:()=>{if(session.snapshot.result==='running')session.paused=!session.paused;}},
      {id:'battle.restart',x:0,y:0,width:260,height:100,action:restart},
      {id:'battle.home',x:0,y:0,width:160,height:90,action:action('battle.home',()=>session.returnToMenu())},
      {id:'battle.next',x:0,y:0,width:700,height:100,visible:()=>session.canAdvance,action:()=>{if(diagnostics.run('session.advance',()=>session.advanceScene()))changed();}},
    ];
    this.menuTitle=this.label('MenuTitle',0,0,960,180,64);
    this.menuHint=this.label('MenuHint',0,0,920,200,30);
    const story=this.label('StoryMode',0,0,800,210,38);
    story.string='故事模式\n从小屋突围，前往别墅解救平民\n按顺序挑战作战场景';
    const practice=this.label('PracticeMode',0,0,800,210,38);
    practice.string='场景演练\n自由选择作战地点\n别墅解救 · 保护六名蓝色平民';
    this.modeLabels=[story,practice];
    this.modeBoxes=[
      {id:'mode.story',x:0,y:0,width:860,height:240,action:action('mode.story',()=>session.startStory())},
      {id:'mode.practice',x:0,y:0,width:860,height:240,action:action('mode.practice',()=>session.showSceneSelection())},
    ];
    this.sceneBoxes=SCENES.map(scene=>({id:`scene.${scene.id}`,x:0,y:0,width:860,height:300,action:action(`scene.${scene.id}`,()=>session.startScene(scene.id))}));
    this.sceneLabels=SCENES.map(scene=>{
      const label=this.label(`Scene-${scene.id}`,0,0,620,260,34);
      label.string=scene.scenarioKind==='villa_rescue'?`${scene.subtitle}\n${scene.title} · 中央 6 名蓝色平民\n破门破窗防守 · 连续生成`:`${scene.subtitle}\n${scene.title}\n${scene.objective}`;
      return label;
    });
    const back=this.label('BackToModes',0,0,320,100,34);back.string='返回模式选择';this.sceneLabels.push(back);
    this.rosterHint=this.label('RosterPreviewHint',0,0,560,300,28);
    this.selectionLabels.push(this.rosterHint);
    for(const type of HUMAN_UNIT_TYPES){
      const name=this.label(`Roster-${type}`,0,0,300,100,36);name.string=SOLDIER_NAMES[type];name.color=color(soldierColors[type]);
      const count=this.label(`Count-${type}`,0,0,100,100,40);
      this.rosterCounts.push(count);this.selectionLabels.push(name,count);
      for(const delta of [-1,1]){
        const label=this.label(`Roster-${type}-${delta}`,0,0,100,100,46);label.string=delta<0?'−':'+';this.selectionLabels.push(label);
        this.rosterBoxes.push({id:`roster.${type}.${delta<0?'minus':'plus'}`,x:0,y:0,width:100,height:100,
          enabled:()=>delta<0?session.roster[type]>0:session.rosterTotal<MAX_HUMANS,action:()=>session.changeRoster(type,delta)});
      }
    }
    const rosterBack=this.label('RosterBack',0,0,280,100,34);rosterBack.string='返回';
    const confirm=this.label('RosterConfirm',0,0,480,100,36);confirm.string='确认编成 · 开始战斗';
    this.selectionLabels.push(rosterBack,confirm);
    this.rosterBoxes.push({id:'roster.back',x:0,y:0,width:280,height:100,action:action('roster.back',()=>session.cancelRoster())},
      {id:'roster.confirm',x:0,y:0,width:480,height:100,enabled:()=>session.rosterValid,action:action('roster.confirm',()=>session.confirmRoster())});
    this.sceneBoxes.push({id:'scenes.back',x:0,y:0,width:320,height:100,action:action('scenes.back',()=>session.returnToMenu())});
  }

  public get boxes():HitBox[] {
    const boxes=this.session.screen==='menu'?this.modeBoxes:this.session.screen==='scenes'?this.sceneBoxes:this.session.screen==='roster'?this.rosterBoxes:this.battleBoxes;
    return boxes.filter(box=>!box.visible||box.visible());
  }

  public diagnosticState(){
    const labels=this.session.screen==='menu'?this.modeLabels:this.session.screen==='scenes'?this.sceneLabels:this.session.screen==='roster'?this.selectionLabels:this.battleLabels;
    return {screen:this.session.screen,title:this.menuTitle.string,rootActive:this.root.active,
      battlefield:{...this.fieldArea},statistics:{...this.statistics},header:{...this.header},
      balance:{ratio:this.ratio,targetRatio:this.ratioTarget},
      buttons:this.boxes.map(({id,x,y,width,height,pressed})=>({id,x,y,width,height,pressed:!!pressed})),
      labels:labels.map(label=>({name:label.node.name,text:label.string,active:label.node.active,position:{x:label.node.position.x,y:label.node.position.y}}))};
  }

  private label(name:string,x:number,y:number,w:number,h:number,size:number):Label {
    const n=uiNode(name,this.root,w,h);n.setPosition(x,y);const l=n.addComponent(Label);
    l.fontSize=size;l.lineHeight=size+8;l.color=color('#F2F2F7');l.useSystemFont=true;
    l.horizontalAlign=HorizontalTextAlignment.CENTER;l.verticalAlign=VerticalTextAlignment.CENTER;return l;
  }

  public layout(safe:Rect):Rect {
    if(!Number.isFinite(safe.width)||safe.width<=0||!Number.isFinite(safe.height)||safe.height<=0){const size=view.getVisibleSize();safe={x:0,y:0,width:size.width,height:size.height};}
    const cx=safe.x+safe.width/2,cy=safe.y+safe.height/2,top=safe.y+safe.height;
    const u=this.hudScale=Math.min(1,safe.width/1080,safe.height/1800);
    const topReserve=350*u;
    this.header={x:safe.x,y:top-topReserve,width:safe.width,height:topReserve};
    const f=fitBattlefield(safe,1080,2400);
    this.fieldArea={x:f.x,y:f.y,width:f.width*f.scale,height:f.height*f.scale};
    this.place(this.gestureHint,cx,this.fieldArea.y+this.fieldArea.height-34*u,700,48,28,u);
    this.statistics={x:cx-504*u,y:safe.y+200*u,width:1008*u,height:125*u};
    this.place(this.sceneTitle,cx,top-80*u,960,100,64,u);
    this.place(this.sceneMeta,cx,top-160*u,960,60,28,u);
    this.place(this.status,cx,top-267*u,960,125,24,u);
    const p=this.statistics;
    this.place(this.humanTotal,p.x+257*u,p.y+60*u,450,40,28,u);
    this.place(this.zombieTotal,p.x+p.width-257*u,p.y+60*u,450,40,28,u);
    this.place(this.countHint,cx,p.y+10*u,944,20,18,u);
    this.place(this.liveHint,p.x+p.width-112*u,p.y+10*u,160,20,18,u);
    this.place(this.result,cx,cy,1000,420,44,u);
    this.waveBanner.node.setPosition(cx,cy+280);
    const y=safe.y+64*u;
    const positions=[{x:cx-252*u,width:300*u},{x:cx+76*u,width:428*u},{x:cx-504*u,width:224*u}];
    for(let i=0;i<positions.length;i++){
      const b=this.battleBoxes[i];Object.assign(b,positions[i],{y,height:122*u});
      const label=i===0?this.pause:i===1?this.root.getChildByName('Restart')!.getComponent(Label)!:this.root.getChildByName('Home')!.getComponent(Label)!;
      this.place(label,b.x+b.width/2,y+b.height/2,b.width/u,100,i===2?28:34,u);
    }
    Object.assign(this.battleBoxes[3],{x:cx-350*u,y:cy-360*u,width:700*u,height:100*u});
    this.place(this.next,cx,cy-310*u,700,100,36,u);
    const scale=this.menuScale=Math.min(1,safe.width/1040,safe.height/1800);
    this.menuTitle.node.setPosition(cx,cy+620*scale);this.menuTitle.node.setScale(scale,scale,1);
    this.menuHint.node.setPosition(cx,cy-800*scale);this.menuHint.node.setScale(scale,scale,1);
    for(let i=0;i<this.modeBoxes.length;i++){
      const box=this.modeBoxes[i];
      Object.assign(box,{x:cx-430*scale,y:cy+(i===0?120:-220)*scale,width:860*scale,height:240*scale});
      this.modeLabels[i].node.setPosition(cx,box.y+box.height/2);this.modeLabels[i].node.setScale(scale,scale,1);
    }
    for(let i=0;i<SCENES.length;i++){
      const box=this.sceneBoxes[i];
      Object.assign(box,{x:cx-430*scale,y:cy+(340-i*320)*scale-150*scale,width:860*scale,height:300*scale});
      this.sceneLabels[i].node.setPosition(cx+90*scale,box.y+box.height/2);this.sceneLabels[i].node.setScale(scale,scale,1);
    }
    for(let i=0;i<HUMAN_UNIT_TYPES.length;i++){
      const y=cy+(380-i*120)*scale,base=1+i*4;
      for(const [index,x] of [[base,cx-240*scale],[base+1,cx+30*scale],[base+2,cx+180*scale],[base+3,cx+340*scale]]){
        this.selectionLabels[index].node.setPosition(x,y);this.selectionLabels[index].node.setScale(scale,scale,1);
      }
      for(let j=0;j<2;j++)Object.assign(this.rosterBoxes[i*2+j],{x:cx+(130+j*160)*scale,y:y-50*scale,width:100*scale,height:100*scale});
    }
    this.rosterHint.node.setPosition(cx+140*scale,cy-350*scale);this.rosterHint.node.setScale(scale,scale,1);
    for(let i=0;i<2;i++){
      const box=this.rosterBoxes[10+i];Object.assign(box,{x:cx+(i===0?-420:-100)*scale,y:cy-680*scale,width:(i===0?280:520)*scale,height:100*scale});
      const label=this.selectionLabels[this.selectionLabels.length-2+i];label.node.setPosition(box.x+box.width/2,box.y+box.height/2);label.node.setScale(scale,scale,1);
    }
    const back=this.sceneBoxes[this.sceneBoxes.length-1];
    Object.assign(back,{x:cx-160*scale,y:cy-580*scale,width:320*scale,height:100*scale});
    this.sceneLabels[this.sceneLabels.length-1].node.setPosition(cx,back.y+back.height/2);
    this.sceneLabels[this.sceneLabels.length-1].node.setScale(scale,scale,1);
    return {...this.fieldArea};
  }

  private place(label:Label,x:number,y:number,w:number,h:number,size:number,scale:number):void {
    label.node.setPosition(x,y);label.node.setScale(scale,scale,1);
    label.node.getComponent(UITransform)!.setContentSize(w,h);label.fontSize=size;label.lineHeight=size+8;
  }

  public excludes(p:Point):boolean {
    const f=this.fieldArea;
    return this.session.screen!=='battle'||this.session.snapshot.result!=='running'||this.session.paused||
      p.x<f.x||p.x>f.x+f.width||p.y<f.y||p.y>f.y+f.height||this.boxes.some(b=>this.contains(b,p));
  }
  public buttonAt(p:Point):HitBox|undefined{return this.boxes.find(b=>(!b.enabled||b.enabled())&&this.contains(b,p));}
  public setButtonPressed(box:HitBox,pressed:boolean):void {box.pressed=pressed;}
  public setMoveHint(mode:'squad'|'single'|null,count:number):void {
    this.gestureHint.string=mode&&count>0?`${mode==='single'?'单兵移动':'整队移动'} · ${count} 人`:'';
    this.gestureHint.color=color(mode==='single'?'#FFFFFF':palette.command);
  }
  private contains(b:HitBox,p:Point):boolean {return p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;}
  public reset():void {
    this.waveIndex=0;this.waveStarted=0;this.waveBanner.node.active=false;
    this.ratio=null;this.ratioAge=.22;
    this.setMoveHint(null,0);
    for(const b of [...this.battleBoxes,...this.modeBoxes,...this.sceneBoxes,...this.rosterBoxes])b.pressed=false;
  }
  private backdrop(alpha:number):void {
    const origin=view.getVisibleOrigin(),size=view.getVisibleSize();
    this.g.fillColor=color('#0B0B0F',alpha);this.g.rect(origin.x,origin.y,size.width,size.height);this.g.fill();
  }
  private buttons():void {
    for(const b of this.boxes){
      this.g.fillColor=color(b.enabled&&!b.enabled()?'#141419':b.pressed?'#355B61':'#202028',240);this.g.roundRect(b.x,b.y,b.width,b.height,16);this.g.fill();
      this.g.strokeColor=color(b.enabled&&!b.enabled()?'#45505A':b.pressed?'#B7FFFF':palette.command);this.g.lineWidth=2;this.g.stroke();
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

  private counts(s:BattleSnapshot,dt:number):void {
    const g=this.g,u=this.hudScale,p=this.statistics,stats=s.stats.byUnitType;
    const types=rosterOrder.filter(type=>stats[type].spawned>0);
    for(const type of rosterOrder)this.unitCountLabels[type].node.active=types.includes(type);
    // Weight cells by their text length so the fifth (engineer) type fits one row.
    const weights=types.map(type=>rosterNames[type].length+1.6+String(stats[type].spawned).length*.65);
    const sum=weights.reduce((a,b)=>a+b,0),available=944;
    let offset=0;
    for(let i=0;i<types.length;i++){
      const type=types[i],width=available*weights[i]/sum,label=this.unitCountLabels[type];
      label.string=`${rosterNames[type]} ${stats[type].aliveAtEnd}`;
      this.place(label,p.x+(32+offset+width/2)*u,p.y+102*u,width,40,Math.min(32,available/sum),u);
      offset+=width;
    }
    this.humanTotal.string=`士兵  ${s.aliveHumans}`;
    this.zombieTotal.string=`僵尸  ${s.aliveZombies}`;
    const total=s.aliveHumans+s.aliveZombies,target=total>0?s.aliveHumans/total:0;
    if(this.ratio===null||total===0||s.result!=='running'||this.motionQuery?.matches){
      this.ratio=target;this.ratioFrom=target;this.ratioTarget=target;this.ratioAge=.22;
    }else{
      if(target!==this.ratioTarget){this.ratioFrom=this.ratio;this.ratioTarget=target;this.ratioAge=0;}
      if(!this.session.paused)this.ratioAge=Math.min(.22,this.ratioAge+(Number.isFinite(dt)?Math.max(0,dt):0));
      const t=this.ratioAge/.22;
      this.ratio=this.ratioFrom+(this.ratioTarget-this.ratioFrom)*(1-Math.pow(1-t,3));
    }
    this.countHint.string=total>0?'当前存活单位':'暂无存活单位';
    g.fillColor=color('#141923');g.roundRect(p.x,p.y,p.width,p.height,20*u);g.fill();
    g.strokeColor=color('#2B3340');g.lineWidth=2*u;g.stroke();
    g.strokeColor=color('#FFFFFF',18);g.moveTo(p.x+32*u,p.y+82*u);g.lineTo(p.x+p.width-32*u,p.y+82*u);g.stroke();
    const x=p.x+32*u,y=p.y+25*u,w=p.width-64*u,h=14*u;
    g.fillColor=color(total>0?palette.zombie:'#272E3B');g.roundRect(x,y,w,h,h/2);g.fill();
    if(total>0&&this.ratio>0)this.humanBar(x,y,w,h,this.ratio);
    if(total>0&&this.ratio>0&&this.ratio<1){
      const split=x+w*this.ratio;
      g.fillColor=color('#10151D');g.roundRect(split-6*u,y-10*u,12*u,h+20*u,6*u);g.fill();
      g.fillColor=color('#F2F2F7');g.roundRect(split-2.5*u,y-7*u,5*u,h+14*u,2.5*u);g.fill();
    }
  }

  /** Clip the green fill to the rounded track, preserving even very small ratios. */
  private humanBar(x:number,y:number,w:number,h:number,ratio:number):void {
    const g=this.g,r=h/2,end=w*ratio,offsets=[0];
    for(let i=1;i<=8;i++)offsets.push(Math.min(end,r*(1-Math.cos(i*Math.PI/16))));
    if(end>r)offsets.push(Math.min(end,w-r));
    if(end>w-r)for(let i=1;i<=8;i++)offsets.push(Math.min(end,w-r+r*Math.sin(i*Math.PI/16)));
    const edge=(at:number)=>Math.sqrt(Math.max(0,r*r-Math.pow(at<r?r-at:at>w-r?at-(w-r):0,2)));
    g.fillColor=color(palette.human);g.moveTo(x,y+r);
    for(const at of offsets)g.lineTo(x+at,y+r+edge(at));
    for(let i=offsets.length-1;i>=0;i--)g.lineTo(x+offsets[i],y+r-edge(offsets[i]));
    g.close();g.fill();
  }

  public render(dt=0):void {
    const s=this.session.snapshot,g=this.g,inBattle=this.session.screen==='battle';g.clear();
    for(const l of this.battleLabels)l.node.active=inBattle;
    this.gestureHint.node.active=inBattle&&this.gestureHint.string.length>0;
    for(const l of this.modeLabels)l.node.active=this.session.screen==='menu';
    for(const l of this.sceneLabels)l.node.active=this.session.screen==='scenes';
    for(const l of this.selectionLabels)l.node.active=this.session.screen==='roster';
    this.menuTitle.node.active=this.menuHint.node.active=!inBattle;
    if(!inBattle){
      this.waveBanner.node.active=false;this.backdrop(255);this.buttons();
      this.menuTitle.string=this.session.screen==='menu'?'四向僵尸防守\n选择出发方式':'场景演练\n选择作战地点';
      this.menuHint.string=this.session.screen==='menu'?'直接拖动整队，长按 0.45 秒后拖动单兵\n别墅解救需要保护中央六名平民':'选择任一场景开始独立挑战\n故事模式按顺序解锁作战地点';
      if(this.session.screen==='roster'){
        this.menuTitle.string=`${this.session.activeScene.title} · 选择编成\n${this.session.rosterTotal} / ${MAX_HUMANS} 人`;
        this.menuHint.string=this.session.rosterTotal===0?'请至少选择 1 名士兵':'直接拖动整队 · 原地长按 0.45 秒后拖动单兵';
        HUMAN_UNIT_TYPES.forEach((type,i)=>this.rosterCounts[i].string=String(this.session.roster[type]));
        this.rosterHint.string=`初始站位预览\n${this.session.activeScene.objective}\n${this.session.activeScene.scenarioKind==='villa_rescue'?'确认后立即开始防守':'确认后有 3 秒布阵时间'}`;
        const anchor=this.rosterBoxes[10],scale=this.menuScale,x=anchor.x+60*scale,y=anchor.y+150*scale,w=170*scale,h=380*scale;
        const scene=this.session.activeScene,map=scene.map,design=map.design_size!;
        g.fillColor=color(scene.presentation.floorColor);g.rect(x,y,w,h);g.fill();
        g.fillColor=color(scene.presentation.wallColor);
        for(const wall of map.terrain??[]){const b=wall.bounds;g.rect(x+b.left/design.width*w,y+(1-b.bottom/design.height)*h,(b.right-b.left)/design.width*w,(b.bottom-b.top)/design.height*h);g.fill();}
        const key=scene.id+JSON.stringify(this.session.roster);
        if(key!==this.rosterPreviewKey){this.rosterPreviewKey=key;this.rosterPreviewUnits=this.session.rosterPreview();}
        for(const c of scene.level.civilians??[]){g.fillColor=color(palette.civilian);g.circle(x+c.position.x/design.width*w,y+(1-c.position.y/design.height)*h,3*scale);g.fill();}
        for(const u of this.rosterPreviewUnits){g.fillColor=color(soldierColors[u.unitType]);g.circle(x+u.position.x/design.width*w,y+(1-u.position.y/design.height)*h,3*scale);g.fill();}
      }
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
    this.counts(s,dt);
    this.next.string=`进入${this.session.nextScene?.subtitle.split(' · ')[1]??'下一场景'}`;
    const mode=this.session.mode==='story'?'故事模式':'场景演练';
    const rescue=s.scenarioKind==='villa_rescue';
    this.sceneTitle.string=this.session.activeScene.title;
    const progress=this.session.waveCount===0?'持续防守':`第 ${s.waveIndex}/${this.session.waveCount} 波`;
    const seconds=Math.floor(s.time_s),clock=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
    this.sceneMeta.string=`${mode} · ${progress}    ${clock}`;
    this.status.node.active=rescue;
    if(rescue){
      const sideNames={north:'北窗',east:'东窗',south:'南侧',west:'西窗'};
      const walls=(s.walls??[]).map(w=>`${sideNames[w.side]}${w.status==='breached'?'已破':w.status==='damaged'?'受损':'完整'}`).join(' · ');
      const target=this.session.activeScene.level.continuousSpawn?.totalTarget;
      this.status.string=`平民：${s.civiliansRemaining}/${s.civilianCount}${s.civiliansTransforming?' · 变身中':''}\n${walls}\n已生成 ${s.spawnedZombies}${target===undefined?'':`/${target}`} · 右下角大门`;
    }else this.status.string='';
    this.pause.string=this.session.paused?'继续':'暂停';
    const victory=s.result==='win';
    const endTitle=victory?(this.session.mode==='story'&&!this.session.nextScene?'故事通关':'场景胜利'):'失败';
    const nextLocation=this.session.nextScene?.subtitle.split(' · ')[1]??this.session.nextScene?.title;
    const endHint=victory&&this.session.canAdvance?`${this.session.activeScene.title}已完成，前往${nextLocation}`:victory?'点击“重新开始”再次挑战':'点击“重新开始”再次布阵';
    const statNames:any={rifleman:'步枪兵',flamethrower:'喷火兵',shield:'盾兵',sniper:'狙击兵',engineer:'工兵机枪'};
    const statsText=s.result!=='running'&&s.stats?.byUnitType?Object.values(s.stats.byUnitType).map((v:any)=>`${statNames[v.unitType]}  击杀 ${v.kills}  伤害 ${Math.round(v.damage)}`).join('\\n'):'';
    this.result.string=s.result!=='running'?`${endTitle}\n${this.session.activeScene.title} · ${s.time_s.toFixed(1)} 秒\n存活 ${s.aliveHumans} 人 · 剩余僵尸 ${s.aliveZombies} 只\n${statsText}\n${endHint}`:this.session.paused?'已暂停':this.session.deploymentRemaining>0?`${this.session.activeScene.title}\n布阵 ${Math.ceil(this.session.deploymentRemaining)}\n拖动兵群调整位置`:'';
    if(rescue)this.result.string=s.result!=='running'?`${victory?'6 名平民成功获救':'平民被感染，解救失败'}\n平民：${s.civiliansRemaining}/${s.civilianCount}\n点击“重新开始”再次挑战`:this.session.paused?'已暂停':'';
    if(this.result.string){
      const p=this.result.node.position,u=this.hudScale;g.fillColor=color('#0B0B0F',220);g.roundRect(p.x-500*u,p.y-280*u,1000*u,560*u,20*u);g.fill();
    }
  }
}
