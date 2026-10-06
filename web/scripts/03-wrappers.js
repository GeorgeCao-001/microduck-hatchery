
const page=await figma.getNodeByIdAsync("0:1");await figma.setCurrentPageAsync(page);
const vars=Object.fromEntries((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const defs=[{"name":"01 / Introduction · Desktop","key":"home","w":1440,"x":160,"y":160},{"name":"02 / Showcase · Desktop","key":"showcase","w":1440,"x":1780,"y":160},{"name":"03 / Learn index · Desktop","key":"learn","w":1440,"x":3400,"y":160},{"name":"04 / Tutorial article · Desktop","key":"article","w":1440,"x":160,"y":2700},{"name":"05 / Console · Desktop","key":"console","w":1440,"x":1780,"y":2700},{"name":"06 / Records · Desktop","key":"records","w":1440,"x":3400,"y":2700},{"name":"07 / Introduction · Mobile","key":"homeMobile","w":390,"x":160,"y":5400},{"name":"08 / Showcase · Mobile","key":"showcaseMobile","w":390,"x":750,"y":5400},{"name":"09 / Tutorial article · Mobile","key":"articleMobile","w":390,"x":1340,"y":5400},{"name":"10 / Console · Mobile","key":"consoleMobile","w":390,"x":1930,"y":5400},{"name":"11 / Learn index · Mobile","key":"learnMobile","w":390,"x":2520,"y":5400},{"name":"12 / Connection dialog","key":"connect","w":640,"x":3400,"y":4200},{"name":"13 / Device state examples","key":"states","w":1440,"x":1780,"y":4200}],frames={},createdNodeIds=[];
for(const d of defs){
 let f=page.children.find(n=>n.name===d.name&&n.type==="FRAME");
 if(!f){f=figma.createAutoLayout("VERTICAL");f.name=d.name;f.resize(d.w,100);f.layoutSizingHorizontal="FIXED";f.layoutSizingVertical="HUG";f.itemSpacing=0;f.primaryAxisAlignItems="MIN";f.counterAxisAlignItems="MIN";f.fills=[figma.variables.setBoundVariableForPaint({type:"SOLID",color:{r:0,g:0,b:0}},"color",vars["color/bg/page"])];f.x=d.x;f.y=d.y;f.placeholder=true;f.clipsContent=false;createdNodeIds.push(f.id);}
 frames[d.key]={id:f.id,name:f.name,width:f.width,x:f.x,y:f.y};
}
return {createdNodeIds,mutatedNodeIds:[page.id],frames};

