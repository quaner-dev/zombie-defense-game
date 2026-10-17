import { Graphics, Node } from 'cc';
import { mapConfig } from '../generated/core.js';
import { color, graphics, line, palette } from './drawing';
export class MapView {
  private readonly base:Graphics;
  private readonly warning:Graphics;
  public constructor(parent:Node){
    this.base=graphics('Map',parent);this.warning=graphics('Breaches',parent);
    const g=this.base;g.fillColor=color(palette.bg);g.rect(0,-2400,1080,2400);g.fill();
    g.strokeColor=color('#FFFFFF',12);g.lineWidth=1;
    for(let x=0;x<=1080;x+=128)line(g,{x,y:0},{x,y:2400});
    for(let y=0;y<=2400;y+=128)line(g,{x:0,y},{x:1080,y});
    const routes=[...mapConfig.routes].sort((a,b)=>a.spawn.x-b.spawn.x);
    g.fillColor=color(palette.wall);
    for(let i=0;i<routes.length-1;i++){
      const left=routes[i].spawn.x+routes[i].width/2;
      const right=routes[i+1].spawn.x-routes[i+1].width/2;
      if(right>left){g.rect(left,-mapConfig.defense_line_y,right-left,mapConfig.defense_line_y-180);g.fill();}
    }

  }
  public render(breached:string[],time:number):void {
    const g=this.warning;g.clear();g.lineWidth=4;
    for(const r of mapConfig.routes){
      const isBreached=breached.includes(r.id);
      const phase=time%0.8;
      const flash=phase<0.08||(phase>=0.16&&phase<0.24);
      g.strokeColor=color(isBreached?palette.warning:palette.wall,isBreached?(flash?255:80):220);
      for(let index=0,x=r.defend.x-r.width/2;x<r.defend.x+r.width/2;x+=20,index++){
        const jitter=isBreached&&phase<0.4?Math.sin(time*42+index*1.7)*3:0;
        line(g,{x:x+jitter,y:mapConfig.defense_line_y+jitter*.35},{x:x+12+jitter,y:mapConfig.defense_line_y+jitter*.35});
      }
    }
  }
}
