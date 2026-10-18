import { Color, Graphics, Layers, Node, UITransform } from 'cc';
import type { Point } from './contracts';
import type { HumanUnitType, Unit } from '../generated/core.js';
export const palette={bg:'#0B0B0F',wall:'#7A7A85',human:'#63D68F',civilian:'#4BA3FF',flame:'#F04438',flameGlow:'#FFB340',shield:'#B9D7E8',sniper:'#55C5F4',engineer:'#F59E0B',zombie:'#9F8BE8',fatZombie:'#CB7356',zombieMother:'#D5C84E',gutZombie:'#A6B85A',command:'#6ED4DB',warning:'#E06E88'};
export const soldierColors:Record<HumanUnitType,string>={rifleman:palette.human,flamethrower:palette.flame,shield:palette.shield,sniper:palette.sniper,engineer:palette.engineer};
export function unitColor(unit:Pick<Unit,'unitType'|'faction'>):string {
  if(unit.faction==='human')return soldierColors[unit.unitType as HumanUnitType]??palette.human;
  return unit.unitType==='fat_zombie'?palette.fatZombie:unit.unitType==='zombie_mother'?palette.zombieMother:unit.unitType==='gut_zombie'?palette.gutZombie:palette.zombie;
}
export function color(hex:string,alpha=255):Color {const c=new Color();Color.fromHEX(c,hex);c.a=alpha;return c;}
export function uiNode(name:string,parent:Node,width=1080,height=2400):Node {
  const n=new Node(name);n.layer=Layers.Enum.UI_2D;n.parent=parent;
  n.addComponent(UITransform).setContentSize(width,height);return n;
}
export function graphics(name:string,parent:Node):Graphics{return uiNode(name,parent).addComponent(Graphics);}
export function line(g:Graphics,a:Point,b:Point):void {g.moveTo(a.x,-a.y);g.lineTo(b.x,-b.y);g.stroke();}
export function arrow(g:Graphics,a:Point,b:Point,dashed=false,headSize=8):void {
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<1)return;
  g.strokeColor=color(palette.command);g.fillColor=g.strokeColor;g.lineWidth=2;
  if(dashed){for(let s=0;s<d;s+=10)line(g,{x:a.x+dx*s/d,y:a.y+dy*s/d},{x:a.x+dx*Math.min(s+6,d)/d,y:a.y+dy*Math.min(s+6,d)/d});}
  else line(g,a,b);
  const ux=dx/d,uy=dy/d;
  const side=headSize*.5;
  g.moveTo(b.x,-b.y);g.lineTo(b.x-ux*headSize+uy*side,-(b.y-uy*headSize-ux*side));
  g.lineTo(b.x-ux*headSize-uy*side,-(b.y-uy*headSize+ux*side));g.close();g.fill();
}
