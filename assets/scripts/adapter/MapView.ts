import { Graphics, Node } from 'cc';
import type { MapModel, SceneDefinition } from '../generated/core.js';
import { color, graphics, line, palette } from './drawing';
export class MapView {
  private readonly base:Graphics;
  private readonly warning:Graphics;
  private readonly doors:Graphics;
  private map:MapModel|null=null;
  public constructor(parent:Node){
    this.base=graphics('Map',parent);this.warning=graphics('Breaches',parent);this.doors=graphics('Doors',parent);
  }
  /** Geometry is supplied by the running battle on each scene entry. */
  public setScene(map:MapModel,scene:SceneDefinition):void {
    this.map=map;
    const g=this.base,{width,height}=map.design_size,style=scene.presentation;
    g.clear();this.warning.clear();this.doors.clear();g.fillColor=color(style.floorColor);
    g.rect(0,-height,width,height);g.fill();
    for(const decoration of style.decorations){
      const b=decoration.bounds;g.fillColor=color(decoration.color);
      if(decoration.kind==='stripe'){
        for(let y=b.top;y<b.bottom;y+=100){g.rect(b.left,-Math.min(y+50,b.bottom),b.right-b.left,Math.min(50,b.bottom-y));g.fill();}
      }else{g.rect(b.left,-b.bottom,b.right-b.left,b.bottom-b.top);g.fill();}
    }
    g.strokeColor=color('#FFFFFF',12);g.lineWidth=1;
    for(let x=0;x<=width;x+=128)line(g,{x,y:0},{x,y:height});
    for(let y=0;y<=height;y+=128)line(g,{x:0,y},{x:width,y});
    for(const terrain of map.terrain){
      if(terrain.kind!=='wall'&&terrain.kind!=='villa_wall')continue;
      const b=terrain.bounds;
      g.fillColor=color(style.wallColor);g.strokeColor=color(style.wallOutlineColor);g.lineWidth=2;
      g.rect(b.left,-b.bottom,b.right-b.left,b.bottom-b.top);g.fill();g.stroke();
    }
  }
  public render(_breached:string[],_time:number):void {
    const g=this.warning;g.clear();if(!this.map)return;g.lineWidth=4;
    this.drawDoors();
    g.strokeColor=color(palette.wall,100);
    const b=this.map.battle_bounds;
    line(g,{x:b.left,y:b.top},{x:b.right,y:b.top});
    line(g,{x:b.right,y:b.top},{x:b.right,y:b.bottom});
    line(g,{x:b.right,y:b.bottom},{x:b.left,y:b.bottom});
    line(g,{x:b.left,y:b.bottom},{x:b.left,y:b.top});
  }

  private drawDoors():void {
    const g=this.doors;g.clear();if(!this.map)return;
    for(const door of this.map.getEntranceStates()){
      const terrain=this.map.terrain.find(item=>item.id===door.id)!;
      const b=terrain.bounds,cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
      const window=door.kind==='window',horizontal=b.right-b.left>b.bottom-b.top;
      if(door.destroyed){
        g.strokeColor=color(window?'#82C8DF':'#B78D61',180);g.lineWidth=3;
        line(g,{x:b.left,y:b.top},{x:b.right+12,y:b.top+22});
        line(g,{x:b.right,y:b.bottom},{x:b.left-12,y:b.bottom-20});
        continue;
      }
      g.fillColor=color(window?'#326F8B':'#95653E');g.strokeColor=color(window?'#A8E1F2':'#E4B575');g.lineWidth=3;
      g.rect(b.left,-b.bottom,b.right-b.left,b.bottom-b.top);g.fill();g.stroke();
      g.lineWidth=3;
      if(horizontal)line(g,{x:cx,y:b.top},{x:cx,y:b.bottom});
      else line(g,{x:b.left,y:cy},{x:b.right,y:cy});
      if(window){
        if(horizontal)line(g,{x:b.left+5,y:cy},{x:b.right-5,y:cy});
        else line(g,{x:cx,y:b.top+5},{x:cx,y:b.bottom-5});
      }else{
        g.fillColor=color('#FFE2A1');g.circle(cx-8,-cy,3);g.fill();g.circle(cx+8,-cy,3);g.fill();
      }
      if(door.hp<door.maxHp){
        g.strokeColor=color('#242826');g.lineWidth=2;
        line(g,{x:cx-12,y:cy-10},{x:cx+2,y:cy+1});
        line(g,{x:cx+2,y:cy+1},{x:cx-3,y:cy+9});
      }
      // A separate bar stays readable even when the thin door leaf is crowded.
      g.fillColor=color('#1B1B20');g.rect(cx-40,-b.top+18,80,8);g.fill();
      g.fillColor=color(door.hp/door.maxHp>.35?'#A8CF73':'#EF7757');
      g.rect(cx-40,-b.top+18,80*door.hp/door.maxHp,8);g.fill();
    }
  }
}
