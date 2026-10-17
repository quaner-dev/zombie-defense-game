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
    g.fillColor=color(palette.wall);
    for(const terrain of mapConfig.terrain??[]){
      if(terrain.kind!=='wall')continue;
      const b=terrain.bounds;
      g.rect(b.left,-b.bottom,b.right-b.left,b.bottom-b.top);g.fill();
    }

  }
  public render(breached:string[],time:number):void {
    const g=this.warning;g.clear();g.lineWidth=4;
    const phase=time%0.8,flash=phase<0.08||(phase>=0.16&&phase<0.24);
    const isBreached=breached.length>0;
    g.strokeColor=color(isBreached?palette.warning:palette.wall,isBreached?(flash?255:80):100);
    const b=mapConfig.battle_bounds;
    line(g,{x:b.left,y:b.top},{x:b.right,y:b.top});
    line(g,{x:b.right,y:b.top},{x:b.right,y:b.bottom});
    line(g,{x:b.right,y:b.bottom},{x:b.left,y:b.bottom});
    line(g,{x:b.left,y:b.bottom},{x:b.left,y:b.top});
  }
}
