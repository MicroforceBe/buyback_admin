export type PopupAnchor={left:number;right:number;top:number;bottom:number};
export function skuPopupPosition(anchor:PopupAnchor,viewport:{width:number;height:number}){
 const margin=8,gap=6;
 if(viewport.width<=margin*2||viewport.height<=margin*2||anchor.bottom<=0||anchor.top>=viewport.height||anchor.right<=0||anchor.left>=viewport.width)return null;
 const width=Math.min(520,viewport.width-margin*2),below=Math.max(0,viewport.height-anchor.bottom-gap-margin),above=Math.max(0,anchor.top-gap-margin),up=below<240&&above>below;
 const available=up?above:below;if(available<32)return null;
 return {left:Math.min(Math.max(margin,anchor.left),viewport.width-width-margin),width,maxHeight:Math.min(360,available),...(up?{bottom:viewport.height-anchor.top+gap}:{top:anchor.bottom+gap})};
}
