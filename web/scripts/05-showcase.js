
const page=await figma.getNodeByIdAsync("0:1");await figma.setCurrentPageAsync(page);
const fonts=[{"family":"Manrope","style":"ExtraBold"},{"family":"Noto Sans SC","style":"Bold"},{"family":"Noto Sans SC","style":"Medium"},{"family":"Noto Sans SC","style":"Regular"},{"family":"Manrope","style":"Bold"},{"family":"IBM Plex Mono","style":"Regular"},{"family":"IBM Plex Mono","style":"Medium"}];await Promise.all(fonts.map(f=>figma.loadFontAsync(f)));
const probe=figma.createText();await figma.loadFontAsync(probe.fontName);const removedNodeIds=[probe.id];probe.remove();
const vars=Object.fromEntries((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const styleIds={"Display / Latin":"S:5605675b6f6eb99727a994430df4cbf9739e00ff,","Display / Chinese":"S:3b16b1e831a0573fd61442f8db7157d2d07e2289,","Heading / 1":"S:64d3f86fdf033d3e89ea75aaa76700364954f70b,","Heading / 2":"S:bfdf61f530c099097b6908de5f31e80a75bd31cc,","Heading / 3":"S:89e3632a520ffe4b352cec5bee2c7087d1f2e71c,","Body / Reading":"S:5b1c5aedc1808db66f180f13c156fadca334991d,","Body / Base":"S:86b0c816a4c0d2cb9089a80e9f91217660bdc3d1,","UI / Label":"S:e0704fe1ef0b7f00db28a0e69c6125c5a820657d,","UI / Small":"S:00538f2de512792ae15c65ea6ca2a5c184ea5e5d,","Meta / Latin":"S:ba62603ea67440d1407b5cd6015dc738caebadcb,","Code / Base":"S:299ed1fe410412f8045654b2d6ad6ee2381c76aa,","Number / Large":"S:680f9cfc63ae765fcf0b4839949a4335c91b3120,","Mobile / Display":"S:54697f2d87ddd03ab065eb27a1e0795a3394651b,"},styleDefs={"Display / Latin":{"family":"Manrope","style":"ExtraBold","size":86,"line":94},"Display / Chinese":{"family":"Noto Sans SC","style":"Bold","size":64,"line":84},"Heading / 1":{"family":"Noto Sans SC","style":"Bold","size":48,"line":64},"Heading / 2":{"family":"Noto Sans SC","style":"Medium","size":32,"line":46},"Heading / 3":{"family":"Noto Sans SC","style":"Medium","size":24,"line":36},"Body / Reading":{"family":"Noto Sans SC","style":"Regular","size":18,"line":32},"Body / Base":{"family":"Noto Sans SC","style":"Regular","size":16,"line":28},"UI / Label":{"family":"Noto Sans SC","style":"Medium","size":14,"line":22},"UI / Small":{"family":"Noto Sans SC","style":"Regular","size":12,"line":20},"Meta / Latin":{"family":"Manrope","style":"Bold","size":12,"line":20,"spacing":1.4},"Code / Base":{"family":"IBM Plex Mono","style":"Regular","size":13,"line":24},"Number / Large":{"family":"IBM Plex Mono","style":"Medium","size":28,"line":36},"Mobile / Display":{"family":"Noto Sans SC","style":"Bold","size":36,"line":50}};
const ids={"Button":"5:60","NavItem":"5:123","Badge":"5:133","Input":"5:152","ChapterRow":"5:159","ServoRow":"5:167","CodeBlock":"5:188","Callout":"5:206","Photo":"5:215","Logo":"5:218","LessonRow":"5:227","Metric":"5:239"};
const components=Object.fromEntries(await Promise.all(Object.entries(ids).map(async([k,id])=>[k,await figma.getNodeByIdAsync(id)])));
const iconIds={"arrow-up-right":"5:6","arrow-right":"5:10","menu":"5:14","chevron-down":"5:19","search":"5:22","copy":"5:26","wifi":"5:30","usb":"5:36","bluetooth":"5:45"},frameIds={"home":"6:2","showcase":"6:3","learn":"6:4","article":"6:5","console":"6:6","records":"6:7","homeMobile":"6:8","showcaseMobile":"6:9","articleMobile":"6:10","consoleMobile":"6:11","learnMobile":"6:12","connect":"6:13","states":"6:14"};
const links=[],usedFrames=[];
const paint=n=>figma.variables.setBoundVariableForPaint({type:"SOLID",color:{r:0,g:0,b:0}},"color",vars[n]);
function fill(n,key){n.fills=key?[paint(key)]:[];}
function gap(n,key,value){if(vars["spacing/"+value])n.setBoundVariable(key,vars["spacing/"+value]);else n[key]=value;}
function radius(n,value){n.setBoundVariable("cornerRadius",vars["radius/"+value]);}
function border(n,key="color/border/default",weight=1){n.strokes=[paint(key)];n.strokeWeight=weight;}
function text(parent,name,value,width=0,style="Body / Base",color="color/text/primary",size=0){
 const t=figma.createText();t.name=name;t.fontName={family:styleDefs[style].family,style:styleDefs[style].style};t.textStyleId=styleIds[style];if(size){t.fontSize=size;t.lineHeight={unit:"PIXELS",value:Math.ceil(size*1.45)};}t.characters=value;fill(t,color);if(width){t.resize(width,t.height);t.textAutoResize="HEIGHT";}else t.textAutoResize="WIDTH_AND_HEIGHT";parent.appendChild(t);return t;
}
function auto(parent,name,width=0,direction="VERTICAL",space=0,bg=null,pad=0){
 const a=figma.createAutoLayout(direction);a.name=name;fill(a,bg);gap(a,"itemSpacing",space);a.primaryAxisAlignItems="MIN";a.counterAxisAlignItems="MIN";
 if(width){a.resize(width,1);a.layoutSizingHorizontal="FIXED";a.layoutSizingVertical="HUG";}
 if(pad)for(const k of ["paddingTop","paddingBottom","paddingLeft","paddingRight"])gap(a,k,pad);
 if(parent)parent.appendChild(a);return a;
}
function rect(parent,name,w,h,color=null){const n=figma.createRectangle();n.name=name;n.resize(w,h);fill(n,color);parent.appendChild(n);return n;}
function divider(parent,width,color="color/shape/line"){return rect(parent,"divider",width,1,color);}
function space(parent,h){return rect(parent,"spacing",1,h);}
function instance(parent,name,variant={},props={},w=0){
 const set=components[name],base=set.children.find(c=>Object.entries(variant).every(([k,v])=>c.variantProperties?.[k]===v))||set.defaultVariant;
 const i=base.createInstance();i.name=name+" / "+(props.Label||props.Title||props.Joint||Object.values(variant).join(" "));parent.appendChild(i);
 const applied={};for(const [name,value] of Object.entries(props)){const key=Object.keys(set.componentPropertyDefinitions).find(k=>k===name||k.startsWith(name+"#"));if(key)applied[key]=value;}if(Object.keys(applied).length)i.setProperties(applied);
 if(w)i.resize(w,i.height);return i;
}
function button(parent,label,key,tone="Primary",w=184,state="Default",showIcon=true){
 const i=instance(parent,"Button",{Tone:tone,State:state},{Label:label,"Show icon":showIcon},w);if(key&&state!=="Disabled")links.push([i,key,"NAVIGATE"]);return i;
}
function badge(parent,label,state="Draft",w=128){return instance(parent,"Badge",{State:state},{Label:label},w);}
function photo(parent,which,w,h){const i=instance(parent,"Photo",{Image:which},{},w);i.resize(w,h);return i;}
function eyebrow(parent,value,width=0,dark=false){return text(parent,"eyebrow",value,width,"Meta / Latin",dark?"color/text/dark-secondary":"color/text/secondary");}
async function icon(parent,name,size=20,inverse=false){
 const base=await figma.getNodeByIdAsync(iconIds[name]);const i=base.createInstance();parent.appendChild(i);i.resize(size,size);if(inverse)for(const v of i.findAllWithCriteria({types:["VECTOR"]})){if(v.strokes.length)v.strokes=[paint("color/icon/inverse")];if(v.fills.length)v.fills=[paint("color/icon/inverse")];}return i;
}
function header(parent,active,mobile=false){
 const h=auto(parent,"Site header",mobile?390:1440,"HORIZONTAL",24,null,mobile?24:64);gap(h,"paddingTop",mobile?16:24);gap(h,"paddingBottom",mobile?16:24);h.counterAxisAlignItems="CENTER";h.primaryAxisAlignItems="SPACE_BETWEEN";
 const logo=instance(h,"Logo",{Size:mobile?"Mobile":"Desktop"});links.push([logo,mobile?"homeMobile":"home","NAVIGATE"]);
 if(mobile){button(h,"菜单", "learnMobile","Ghost",100,"Default",false);return h;}
 const nav=auto(h,"Primary navigation",0,"HORIZONTAL",8);
 for(const [label,key] of [["介绍","home"],["成果","showcase"],["教程","learn"],["记录","records"]]){
  const n=instance(nav,"NavItem",{State:key===active?"Active":"Default"},{Label:label});links.push([n,key,"NAVIGATE"]);
 }
 const actions=auto(h,"Header actions",0,"HORIZONTAL",12);
 const g=button(actions,"GitHub",null,"Ghost",100,"Default",false);links.push([g,"https://github.com/fanhao375/microduck-replica","URL"]);button(actions,"调试台","console","Primary",160);
 return h;
}
function footer(parent,mobile=false){
 const w=mobile?390:1440,inner=mobile?342:1296,pad=mobile?24:64;
 const f=auto(parent,"Site footer",w,"VERTICAL",24,null,pad);gap(f,"paddingTop",32);gap(f,"paddingBottom",32);divider(f,inner);
 const row=auto(f,"Footer brand",inner,mobile?"VERTICAL":"HORIZONTAL",mobile?16:32);row.primaryAxisAlignItems="SPACE_BETWEEN";
 instance(row,"Logo",{Size:mobile?"Mobile":"Desktop"});text(row,"disclosure","独立复刻项目 · 非 Pollen Robotics 官方站点",mobile?342:420,"UI / Small","color/text/secondary");
 const credits=text(f,"credits","来源：Pollen Robotics · fanhao375/microduck-replica\n图片：复刻项目参与者 / CC BY-NC-SA 4.0 · 预览中仅作参考",inner,"UI / Small","color/text/secondary");links.push([credits,"https://github.com/fanhao375/microduck-replica/blob/master/NOTICE.md","URL"]);
}
function callout(parent,title,body,kind="Info",width=720){
 const i=instance(parent,"Callout",{Kind:kind},{Title:title,Body:body},width);for(const t of i.findAllWithCriteria({types:["TEXT"]})){t.resize(width-32,t.height);t.textAutoResize="HEIGHT";}return i;
}
function codeBlock(parent,location,command,mobile=false){
 return instance(parent,"CodeBlock",{Device:mobile?"Mobile":"Desktop"},{Location:location,Command:command},mobile?342:720);
}
function metric(parent,label,value,width=156){return instance(parent,"Metric",{Format:"Default"},{Label:label,Value:value},width);}
function chart(parent,width=580,height=252,dark=false){
 const outer=figma.createFrame();outer.name="Angle chart / illustrative sample";outer.resize(width,height);fill(outer,null);parent.appendChild(outer);
 const px=46,py=18,pw=width-62,ph=height-54;
 for(let j=0;j<4;j++){const y=py+j*ph/3;const r=rect(outer,"grid",pw,1,"color/shape/line");r.x=px;r.y=y;if(dark)r.opacity=.2;const t=text(outer,"axis-y",String(30-j*10),36,"Code / Base",dark?"color/text/dark-secondary":"color/text/secondary",11);t.x=0;t.y=y-8;}
 for(let j=0;j<5;j++){const t=text(outer,"axis-x",String(j*3)+" s",48,"Code / Base",dark?"color/text/dark-secondary":"color/text/secondary",11);t.x=px+j*pw/4-10;t.y=height-24;}
 const unit=text(outer,"unit","°",20,"UI / Small",dark?"color/text/dark-secondary":"color/text/secondary");unit.x=3;unit.y=0;
 const target=[],actual=[];for(let k=0;k<=100;k++){const tm=k/100*12,goal=tm<2?0:tm<7?18:10,real=tm<2?0:tm<7?18*(1-Math.exp(-(tm-2)*2))+Math.sin(tm*3)*.32:10+8*Math.exp(-(tm-7)*2)+Math.sin(tm*3)*.18;target.push([px+k/100*pw,py+ph*(1-goal/30)]);actual.push([px+k/100*pw,py+ph*(1-real/30)]);}
 function path(a){return a.map((p,i)=>(i?"L":"M")+p[0].toFixed(2)+" "+p[1].toFixed(2)).join(" ");}
 const svg=figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><path d="'+path(target)+'" fill="none" stroke="#F2B544" stroke-width="2" stroke-dasharray="5 4"/><path d="'+path(actual)+'" fill="none" stroke="'+(dark?"#C9D9A2":"#466448")+'" stroke-width="2.5"/></svg>');svg.name="Sample curves / editable vectors";outer.appendChild(svg);svg.x=0;svg.y=0;
 if(!dark){const v=svg.findAllWithCriteria({types:["VECTOR"]});if(v[0])v[0].strokes=[paint("color/chart/target")];if(v[1])v[1].strokes=[paint("color/chart/actual")];}
 return outer;
}
function legend(parent,dark=false){
 const row=auto(parent,"Chart legend",0,"HORIZONTAL",24);for(const [name,col] of [["目标角度","color/chart/target"],["实际角度","color/chart/actual"]]){const g=auto(row,name,0,"HORIZONTAL",8);g.counterAxisAlignItems="CENTER";rect(g,"legend-mark",20,3,col);text(g,"legend-label",name,0,"UI / Small",dark?"color/text/dark-secondary":"color/text/secondary");}return row;
}
async function openFrame(key){const f=await figma.getNodeByIdAsync(frameIds[key]);if(f.children.length)throw new Error("Wrapper already has content: "+key);usedFrames.push(f);return f;}
async function finish(){
 for(const [node,key,nav] of links){let root=node;while(root.parent&&root.parent.type!=="PAGE")root=root.parent;if(nav!=="URL"&&root.id===frameIds[key])continue;await node.setReactionsAsync([{trigger:{type:"ON_CLICK"},actions:[nav==="URL"?{type:"URL",url:key,openInNewTab:true}:{type:"NODE",destinationId:frameIds[key],navigation:nav,transition:{type:"DISSOLVE",easing:{type:"EASE_OUT"},duration:.16},resetScrollPosition:true}]}]);}
 for(const f of usedFrames)f.placeholder=false;
 const output=usedFrames.map(f=>{const all=f.findAll(()=>true),counts={};for(const n of all)counts[n.type]=(counts[n.type]||0)+1;const textNodes=f.findAllWithCriteria({types:["TEXT"]}),families=[...new Set(textNodes.flatMap(t=>t.getStyledTextSegments(["fontName"]).map(s=>s.fontName.family)))];return {id:f.id,name:f.name,width:f.width,height:f.height,totalDescendants:all.length,counts,fonts:families,fontCheck:families.every(x=>["Noto Sans SC","Manrope","IBM Plex Mono"].includes(x)),images:all.filter(n=>"fills" in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==="IMAGE")).map(n=>({id:n.id,name:n.name,type:n.type,width:n.width,height:n.height,imageHash:n.fills.find(p=>p.type==="IMAGE").imageHash}))};});
 return {createdNodeIds:[...new Set(usedFrames.flatMap(f=>f.findAll(()=>true).map(n=>n.id)))],mutatedNodeIds:usedFrames.map(f=>f.id),removedNodeIds,screens:output,prototypeLinks:links.length};
}

const show=await openFrame("showcase");header(show,"showcase");
const intro=auto(show,"Showcase introduction",1440,"VERTICAL",24,null,64);gap(intro,"paddingBottom",32);eyebrow(intro,"FIELD NOTES / SHOWCASE");const titleRow=auto(intro,"Showcase heading",1296,"HORIZONTAL",96);titleRow.counterAxisAlignItems="CENTER";text(titleRow,"headline","每一次动作，\n都能回看。",688,"Heading / 1");const status=auto(titleRow,"Material status",512,"VERTICAL",12);badge(status,"团队素材待补","Draft",148);text(status,"description","实机视频为主，曲线与实验条件随行。\n以下展示页面结构；参考照片来自复刻项目。",512,"Body / Base","color/text/secondary");
const cinema=auto(show,"Video and experiment",1440,"HORIZONTAL",32,null,64);gap(cinema,"paddingTop",0);gap(cinema,"paddingBottom",32);
const movie=auto(cinema,"Video player / awaiting team media",960,"VERTICAL",16,"color/bg/dark",24);radius(movie,12);const ph=auto(movie,"Player label",912,"HORIZONTAL",16);ph.primaryAxisAlignItems="SPACE_BETWEEN";text(ph,"name","01 / 单关节小幅动作",540,"UI / Label","color/text/on-dark");badge(ph,"参考照片 · 静态","Example",164);
const poster=figma.createFrame();poster.name="Discrete reference poster / not video";poster.resize(912,470);fill(poster,null);movie.appendChild(poster);const pic=photo(poster,"Product",345,460);pic.x=283.5;pic.y=5;
const controls=auto(movie,"Disabled player controls",912,"HORIZONTAL",24);controls.counterAxisAlignItems="CENTER";text(controls,"label","待上传团队实机视频",280,"UI / Label","color/text/on-dark");const track=rect(controls,"Inactive timeline",400,2,"color/shape/line");track.opacity=.2;text(controls,"time","--:-- / --:--",180,"Code / Base","color/text/dark-secondary");text(movie,"caption","当前为静态参考照片；没有虚构的视频时长或行走成果。",912,"UI / Small","color/text/dark-secondary");
const details=auto(cinema,"Experiment summary",304,"VERTICAL",24);eyebrow(details,"EXPERIMENT / DRAFT");text(details,"title","单关节小幅动作",304,"Heading / 3");badge(details,"待视频与实测记录","Draft",188);text(details,"description","先从一个已校准关节开始。\n同一份案例保留条件、动作、回执与结果。",304,"Body / Base","color/text/secondary");divider(details,304);
for(const [label,value] of [["设备与映射版本","待团队填写"],["动作条件","待台架确认"],["配套记录","待导入实测日志"]]){const row=auto(details,label,304,"VERTICAL",8);text(row,"label",label,304,"UI / Small","color/text/secondary");text(row,"value",value,304,"UI / Label");}
button(details,"阅读测试流程","article","Secondary",240);
const cases=auto(show,"Other experiment drafts",1440,"HORIZONTAL",24,null,64);gap(cases,"paddingTop",0);gap(cases,"paddingBottom",48);
for(const [number,title,note] of [["01","单关节小幅动作","确认目标、回读与动作边界"],["02","姿态核对","记录零位与方向检查过程"],["03","目标跟踪","对照同一时间轴上的目标和实际"]]){
 const card=auto(cases,title,416,"VERTICAL",12);divider(card,416);const top=auto(card,"Case title",416,"HORIZONTAL",16);text(top,"number",number,32,"Meta / Latin","color/text/accent",20);text(top,"title",title,304,"Heading / 3");text(card,"note",note,416,"Body / Base","color/text/secondary");badge(card,"案例待补","Draft");
}
const data=auto(show,"Data companion",1440,"VERTICAL",32,"color/bg/surface",64);text(data,"title","视频之后，还有曲线。",1296,"Heading / 2");text(data,"description","有时间对应关系的日志，可以和视频一起回看。没有日志时，只呈现视频。",1296,"Body / Base","color/text/secondary");
const dr=auto(data,"Curve and case notes",1296,"HORIZONTAL",64);const dc=auto(dr,"Curve example",864,"VERTICAL",16);const dh=auto(dc,"Sample heading",864,"HORIZONTAL",16);dh.primaryAxisAlignItems="SPACE_BETWEEN";text(dh,"title","左膝 · 目标 / 实际角度",480,"UI / Label");badge(dh,"版式示例 · 非实测","Example",184);legend(dc);chart(dc,864,280);text(dc,"note","数据仅为示意。接入实测日志后保留缺测与动作事件。",864,"UI / Small","color/text/secondary");
const notes=auto(dr,"Case structure",368,"VERTICAL",24);text(notes,"title","一份可复现的案例",368,"Heading / 3");
for(const [k,v] of [["现象","当时发生了什么"],["条件","使用了什么硬件与版本"],["调整","改了哪项配置，依据是什么"],["证据","视频、记录与复测结果"]]){const n=auto(notes,k,368,"HORIZONTAL",16);text(n,"label",k,48,"UI / Label","color/text/accent");text(n,"value",v,304,"Body / Base","color/text/secondary");}
button(notes,"打开实验记录","records","Ghost",232);footer(show);
const mobile=await openFrame("showcaseMobile");header(mobile,"showcase",true);
const mi=auto(mobile,"Showcase introduction",390,"VERTICAL",24,null,24);eyebrow(mi,"FIELD NOTES / SHOWCASE");text(mi,"headline","每一次动作，\n都能回看。",342,"Mobile / Display");badge(mi,"团队素材待补","Draft",152);text(mi,"description","实机视频为主，曲线与实验条件随行。当前以静态参考图展示版式。",342,"Body / Base","color/text/secondary");
const film=auto(mobile,"Video draft",390,"VERTICAL",24,"color/bg/dark",24);text(film,"title","01 / 单关节小幅动作",342,"UI / Label","color/text/on-dark");badge(film,"参考照片 · 静态","Example",164);photo(film,"Product",342,456);text(film,"status","团队视频待补\n--:-- / --:--",342,"UI / Label","color/text/on-dark");text(film,"source","来源：fanhao375/microduck-replica\nCC BY-NC-SA 4.0 · 非本团队实测",342,"UI / Small","color/text/dark-secondary");
const condition=auto(mobile,"Experiment conditions",390,"VERTICAL",24,null,24);text(condition,"title","和动作一起留下条件。",342,"Heading / 3");for(const [label,v] of [["设备与版本","待填写"],["动作条件","待台架确认"],["配套记录","待导入实测日志"]]){const r=auto(condition,label,342,"HORIZONTAL",24);r.primaryAxisAlignItems="SPACE_BETWEEN";text(r,"label",label,176,"UI / Label");text(r,"value",v,142,"UI / Small","color/text/secondary");divider(condition,342);}button(condition,"阅读测试流程","articleMobile","Secondary",342);
const mc=auto(mobile,"Data companion",390,"VERTICAL",24,"color/bg/surface",24);text(mc,"title","视频之后，还有曲线。",342,"Heading / 3");badge(mc,"示例 · 非实测","Example",152);legend(mc);chart(mc,342,230);text(mc,"note","日志与视频可对齐时同步回看。\n没有配套日志时，仅展示视频。",342,"Body / Base","color/text/secondary");footer(mobile,true);
const result=await finish();
for(const f of usedFrames)await f.screenshot({scale:1});
return result;

