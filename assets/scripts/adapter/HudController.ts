import { Graphics, Label, Node, view } from 'cc';
import type { BattleSession } from '../generated/core';
import type { Point } from './contracts';
import { color, graphics, palette, uiNode } from './drawing';
export interface HitBox {x:number;y:number;width:number;height:number;action:()=>void}
export class HudController {
  private readonly g:Graphics;
  private readonly status:Label;
  private readonly result:Label;
  private readonly pause:Label;
  private readonly waveBanner:Label;
  private waveIndex=0;
  private waveStarted=0;
  public readonly boxes:HitBox[]=[];
  public constructor(private readonly root:Node,private readonly session:BattleSession,restart:()=>void){
    this.g=graphics('HUDPanels',root);
    this.status=this.label('Counts',0,0,900,150,32);
    this.result=this.label('Result',0,0,1000,420,44);
    this.waveBanner=this.label('WaveBanner',540,1200,1000,180,72);
    this.waveBanner.node.active=false;
    this.waveBanner.enableOutline=true;this.waveBanner.outlineColor=color('#F2F2F7');this.waveBanner.outlineWidth=2;
    this.pause=this.label('Pause',0,0,260,100,34);
    this.label('Restart',0,0,260,100,34).string='RESTART';
    this.boxes=[{x:0,y:0,width:260,height:100,action:()=>{if(session.snapshot.result==='running')session.paused=!session.paused;}},
      {x:0,y:0,width:260,height:100,action:restart}];
  }
  private label(name:string,x:number,y:number,w:number,h:number,size:number):Label {
    const n=uiNode(name,this.root,w,h);n.setPosition(x,y);const l=n.addComponent(Label);
    l.fontSize=size;l.lineHeight=size+8;l.color=color('#F2F2F7');return l;
  }
  public layout(safe:{x:number;y:number;width:number;height:number}):void {
    const cx=safe.x+safe.width/2,top=safe.y+safe.height;
    this.status.node.setPosition(cx,top-90);this.result.node.setPosition(cx,safe.y+safe.height/2);
    this.waveBanner.node.setPosition(cx,safe.y+safe.height/2+280);
    const left=cx-290,right=cx+30,y=safe.y+20;
    this.boxes[0].x=left;this.boxes[1].x=right;for(const b of this.boxes)b.y=y;
    this.pause.node.setPosition(left+130,y+50);
    this.root.getChildByName('Restart')!.setPosition(right+130,y+50);
  }
  public excludes(p:Point):boolean {
    return this.session.snapshot.result!=='running'||this.session.paused||this.boxes.some(b=>this.contains(b,p));
  }
  public buttonAt(p:Point):HitBox|undefined{return this.boxes.find(b=>this.contains(b,p));}
  private contains(b:HitBox,p:Point):boolean {return p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;}
  public reset():void {this.waveIndex=0;this.waveStarted=0;this.waveBanner.node.active=false;}
  public render():void {
    const s=this.session.snapshot,g=this.g;g.clear();
    // Cover the whole visible design area, not only the safe area or result card.
    // Visible origin/size also include SHOW_ALL letterboxing on wide windows.
    if(s.result!=='running'){
      const origin=view.getVisibleOrigin(),size=view.getVisibleSize();
      g.fillColor=color('#000000',178);g.rect(origin.x,origin.y,size.width,size.height);g.fill();
    }
    if(s.waveIndex!==this.waveIndex){this.waveIndex=s.waveIndex;this.waveStarted=s.time_s;}
    const age=s.time_s-this.waveStarted;
    this.waveBanner.node.active=s.result==='running'&&s.waveIndex>0&&age<.5;
    if(this.waveBanner.node.active){
      this.waveBanner.string=`WAVE ${s.waveIndex}`;
      const t=Math.min(1,Math.max(0,age/.5)),overshoot=1.70158;
      const scale=1+(overshoot+1)*Math.pow(t-1,3)+overshoot*Math.pow(t-1,2);
      this.waveBanner.node.setScale(.65+.35*scale,.65+.35*scale,1);
    }
    for(const b of this.boxes){g.fillColor=color('#202028',240);g.roundRect(b.x,b.y,b.width,b.height,16);g.fill();g.strokeColor=color(palette.command);g.stroke();}
    this.status.string=`50 RIFLEMEN / 3 WAVES\nHUMANS ${s.aliveHumans}  ·  ZOMBIES ${s.aliveZombies}\nWAVE ${s.waveIndex}/3   ${s.time_s.toFixed(1)}s${s.breachedRoutes.length?'  BREACH '+s.breachedRoutes.join(','):''}`;
    this.pause.string=this.session.paused?'RESUME':'PAUSE';
    this.result.string=s.result!=='running'?`${s.result==='win'?'VICTORY':'DEFEAT'}\n${s.time_s.toFixed(1)}s · ${s.aliveHumans} survivors\n${s.aliveZombies} zombies remain\nTap RESTART to deploy again`:this.session.paused?'PAUSED':this.session.deploymentRemaining>0?`DEPLOY ${Math.ceil(this.session.deploymentRemaining)}\nDrag a group to reposition`:'';
    if(this.result.string){
      const p=this.result.node.position;g.fillColor=color('#0B0B0F',220);g.roundRect(p.x-500,p.y-220,1000,440,20);g.fill();
    }
    const total=Math.max(1,s.aliveHumans+s.aliveZombies),p=this.status.node.position;
    g.fillColor=color(palette.zombie);g.rect(p.x-400,p.y-85,800,8);g.fill();
    g.fillColor=color(palette.human);g.rect(p.x-400,p.y-85,800*s.aliveHumans/total,8);g.fill();
  }
}
