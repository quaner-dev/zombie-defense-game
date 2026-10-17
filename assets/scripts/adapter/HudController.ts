import { Graphics, Label, Node, view } from 'cc';
import type { BattleSession } from '../generated/core.js';
import type { Point } from './contracts';
import { color, graphics, palette, uiNode } from './drawing';
export interface HitBox {x:number;y:number;width:number;height:number;action:()=>void;pressed?:boolean}
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
    this.label('Restart',0,0,260,100,34).string='重新开始';
    this.boxes=[{x:0,y:0,width:260,height:100,action:()=>{if(session.snapshot.result==='running')session.paused=!session.paused;}},
      {x:0,y:0,width:260,height:100,action:restart}];
  }
  private label(name:string,x:number,y:number,w:number,h:number,size:number):Label {
    const n=uiNode(name,this.root,w,h);n.setPosition(x,y);const l=n.addComponent(Label);
    l.fontSize=size;l.lineHeight=size+8;l.color=color('#F2F2F7');l.useSystemFont=true;return l;
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
  public setButtonPressed(box:HitBox,pressed:boolean):void {box.pressed=pressed;}
  private contains(b:HitBox,p:Point):boolean {return p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;}
  public reset():void {this.waveIndex=0;this.waveStarted=0;this.waveBanner.node.active=false;for(const b of this.boxes)b.pressed=false;}
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
      this.waveBanner.string=`第 ${s.waveIndex} 波`;
      const t=Math.min(1,Math.max(0,age/.5)),overshoot=1.70158;
      const scale=1+(overshoot+1)*Math.pow(t-1,3)+overshoot*Math.pow(t-1,2);
      this.waveBanner.node.setScale(.65+.35*scale,.65+.35*scale,1);
    }
    for(const b of this.boxes){
      g.fillColor=color(b.pressed?'#355B61':'#202028',240);g.roundRect(b.x,b.y,b.width,b.height,16);g.fill();
      g.strokeColor=color(b.pressed?'#B7FFFF':palette.command);g.stroke();
    }
    this.status.string=`50 名步枪兵 / ${this.session.waveCount} 波尸潮\n人类 ${s.aliveHumans}  ·  僵尸 ${s.aliveZombies}\n第 ${s.waveIndex}/${this.session.waveCount} 波   ${s.time_s.toFixed(1)} 秒${s.breachedRoutes.length?'  破门 '+s.breachedRoutes.join('、'):''}`;
    this.pause.string=this.session.paused?'继续':'暂停';
    this.result.string=s.result!=='running'?`${s.result==='win'?'胜利':'失败'}\n${s.time_s.toFixed(1)} 秒 · 存活 ${s.aliveHumans} 人\n剩余僵尸 ${s.aliveZombies} 只\n点击“重新开始”再次布阵`:this.session.paused?'已暂停':this.session.deploymentRemaining>0?`布阵 ${Math.ceil(this.session.deploymentRemaining)}\n拖动兵群调整位置`:'';
    if(this.result.string){
      const p=this.result.node.position;g.fillColor=color('#0B0B0F',220);g.roundRect(p.x-500,p.y-220,1000,440,20);g.fill();
    }
    const total=Math.max(1,s.aliveHumans+s.aliveZombies),p=this.status.node.position;
    g.fillColor=color(palette.zombie);g.rect(p.x-400,p.y-85,800,8);g.fill();
    g.fillColor=color(palette.human);g.rect(p.x-400,p.y-85,800*s.aliveHumans/total,8);g.fill();
  }
}
