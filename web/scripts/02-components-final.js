/**
 * createComponentWithVariants
 *
 * Creates a component set by generating all combinations of `variantAxes`,
 * building one Figma component per combination, then calling
 * `figma.combineAsVariants` to produce the component set. After combining,
 * the variants are repositioned into a grid so they don't all stack at (0, 0).
 *
 * @param {{
 *   name: string,
 *   description?: string,
 *   variantAxes: Record<string, string[]>,
 *   baseProps: {
 *     width: number,
 *     height: number,
 *     fills?: Paint[],
 *     padding?: {top?: number, bottom?: number, left?: number, right?: number},
 *     radius?: number,
 *     layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE',
 *     itemSpacing?: number
 *   },
 *   page: PageNode
 * }} config
 *   - `name`: Component set name (e.g. "Button").
 *   - `description`: Optional human-readable purpose and usage guidance.
 *   - `variantAxes`: Each key is a variant property name; each value is an array of
 *     allowed values. All combinations are generated (Cartesian product).
 *     Example: { Size: ['Small', 'Medium', 'Large'], Style: ['Primary', 'Ghost'] }
 *     produces 6 variants.
 *   - `baseProps`: Visual properties applied to every variant.
 *   - `page`: The PageNode to create components on (must be set as current page by caller).
 * @returns {Promise<{
 *   componentSet: ComponentSetNode,
 *   variants: ComponentNode[]
 * }>}
 */
async function createComponentWithVariants(config) {
  const { name, variantAxes, baseProps, page } = config

  // Ensure we are on the correct page
  // Current page is set once by the caller.

  // Compute Cartesian product of variant axes
  const axisNames = Object.keys(variantAxes)
  const axisValues = axisNames.map((k) => variantAxes[k])
  const combinations = cartesianProduct(axisValues)

  // Build one component per combination
  const components = []
  for (const combo of combinations) {
    const comp = figma.createComponent()

    // Name: "Property=Value, Property=Value, ..."
    comp.name = axisNames.map((ax, i) => `${ax}=${combo[i]}`).join(', ')

    // Base geometry
    comp.resize(baseProps.width, baseProps.height)

    // Fills
    if (baseProps.fills !== undefined) {
      comp.fills = baseProps.fills
    } else {
      comp.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }]
    }

    // Corner radius
    if (baseProps.radius !== undefined) {
      comp.cornerRadius = baseProps.radius
    }

    // Auto-layout
    if (baseProps.layoutMode && baseProps.layoutMode !== 'NONE') {
      comp.layoutMode = baseProps.layoutMode
      comp.primaryAxisAlignItems = 'CENTER'
      comp.counterAxisAlignItems = 'CENTER'
      if (baseProps.itemSpacing !== undefined) {
        comp.itemSpacing = baseProps.itemSpacing
      }
    }

    // Padding
    if (baseProps.padding) {
      comp.paddingTop = baseProps.padding.top ?? 0
      comp.paddingBottom = baseProps.padding.bottom ?? 0
      comp.paddingLeft = baseProps.padding.left ?? 0
      comp.paddingRight = baseProps.padding.right ?? 0
    }

    page.appendChild(comp)
    components.push(comp)
  }

  // Combine into a component set
  const componentSet = figma.combineAsVariants(components, page)
  componentSet.name = name
  if (config.description) {
    componentSet.description = config.description
  }

  // Grid layout — variants stack at (0, 0) after combineAsVariants; reposition them.
  const GRID_GAP = 16
  const cols = Math.max(1, axisValues[axisValues.length - 1]?.length ?? 1)
  const variantWidth = baseProps.width
  const variantHeight = baseProps.height

  componentSet.children.forEach((variant, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    variant.x = col * (variantWidth + GRID_GAP)
    variant.y = row * (variantHeight + GRID_GAP)
  })

  // Resize component set to wrap its children with padding
  const totalCols = Math.min(cols, combinations.length)
  const totalRows = Math.ceil(combinations.length / cols)
  const PADDING = 40
  componentSet.resize(
    totalCols * variantWidth + (totalCols - 1) * GRID_GAP + PADDING * 2,
    totalRows * variantHeight + (totalRows - 1) * GRID_GAP + PADDING * 2,
  )

  // Position component set at a safe canvas location
  componentSet.x = 480
  componentSet.y = 80

  return { componentSet, variants: componentSet.children }
}

/**
 * Computes the Cartesian product of multiple arrays.
 * cartesianProduct([[A, B], [1, 2]]) → [[A,1], [A,2], [B,1], [B,2]]
 *
 * @param {Array<string[]>} arrays
 * @returns {string[][]}
 */
function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, curr) => acc.flatMap((combo) => curr.map((val) => [...combo, val])),
    [[]],
  )
}

const page=await figma.getNodeByIdAsync("2:2");await figma.setCurrentPageAsync(page);
const fonts=[{"family":"Manrope","style":"ExtraBold"},{"family":"Noto Sans SC","style":"Bold"},{"family":"Noto Sans SC","style":"Medium"},{"family":"Noto Sans SC","style":"Regular"},{"family":"Manrope","style":"Bold"},{"family":"IBM Plex Mono","style":"Regular"},{"family":"IBM Plex Mono","style":"Medium"}];await Promise.all(fonts.map(f=>figma.loadFontAsync(f)));
const probe=figma.createText();await figma.loadFontAsync(probe.fontName);const removedNodeIds=[probe.id];probe.remove();
const vars=Object.fromEntries((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const sem=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==="ML · Tokens");
for(const [name,raw,scopes] of [["color/icon/primary","ink",["SHAPE_FILL","STROKE_COLOR"]],["color/icon/inverse","onDark",["SHAPE_FILL","STROKE_COLOR"]],["color/border/danger","danger",["STROKE_COLOR"]]]) {
 if(!vars[name]){const v=figma.variables.createVariable(name,sem,"COLOR");v.scopes=scopes;v.setValueForMode(sem.modes[0].modeId,{type:"VARIABLE_ALIAS",id:vars[raw].id});v.setVariableCodeSyntax("WEB","var(--ml-"+name.replaceAll("/","-")+")");vars[name]=v;}
}
const styleIds={"Display / Latin":"S:5605675b6f6eb99727a994430df4cbf9739e00ff,","Display / Chinese":"S:3b16b1e831a0573fd61442f8db7157d2d07e2289,","Heading / 1":"S:64d3f86fdf033d3e89ea75aaa76700364954f70b,","Heading / 2":"S:bfdf61f530c099097b6908de5f31e80a75bd31cc,","Heading / 3":"S:89e3632a520ffe4b352cec5bee2c7087d1f2e71c,","Body / Reading":"S:5b1c5aedc1808db66f180f13c156fadca334991d,","Body / Base":"S:86b0c816a4c0d2cb9089a80e9f91217660bdc3d1,","UI / Label":"S:e0704fe1ef0b7f00db28a0e69c6125c5a820657d,","UI / Small":"S:00538f2de512792ae15c65ea6ca2a5c184ea5e5d,","Meta / Latin":"S:ba62603ea67440d1407b5cd6015dc738caebadcb,","Code / Base":"S:299ed1fe410412f8045654b2d6ad6ee2381c76aa,","Number / Large":"S:680f9cfc63ae765fcf0b4839949a4335c91b3120,","Mobile / Display":"S:54697f2d87ddd03ab065eb27a1e0795a3394651b,"},styleDefs={"Display / Latin":{"family":"Manrope","style":"ExtraBold","size":86,"line":94},"Display / Chinese":{"family":"Noto Sans SC","style":"Bold","size":64,"line":84},"Heading / 1":{"family":"Noto Sans SC","style":"Bold","size":48,"line":64},"Heading / 2":{"family":"Noto Sans SC","style":"Medium","size":32,"line":46},"Heading / 3":{"family":"Noto Sans SC","style":"Medium","size":24,"line":36},"Body / Reading":{"family":"Noto Sans SC","style":"Regular","size":18,"line":32},"Body / Base":{"family":"Noto Sans SC","style":"Regular","size":16,"line":28},"UI / Label":{"family":"Noto Sans SC","style":"Medium","size":14,"line":22},"UI / Small":{"family":"Noto Sans SC","style":"Regular","size":12,"line":20},"Meta / Latin":{"family":"Manrope","style":"Bold","size":12,"line":20,"spacing":1.4},"Code / Base":{"family":"IBM Plex Mono","style":"Regular","size":13,"line":24},"Number / Large":{"family":"IBM Plex Mono","style":"Medium","size":28,"line":36},"Mobile / Display":{"family":"Noto Sans SC","style":"Bold","size":36,"line":50}};
const roots=[],components={},iconComponents={};
const paint=n=>figma.variables.setBoundVariableForPaint({type:"SOLID",color:{r:0,g:0,b:0}},"color",vars[n]);
const fill=(node,n)=>node.fills=n?[paint(n)]:[];
function spacing(node,key,val){node.setBoundVariable(key,vars["spacing/"+val]);}
function radius(node,val){node.setBoundVariable("cornerRadius",vars["radius/"+val]);}
function border(node,n="color/border/default",weight=1){node.strokes=[paint(n)];node.strokeWeight=weight;}
function text(parent,name,value,width=0,style="UI / Label",color="color/text/primary",size=0){
 const t=figma.createText();t.name=name;t.fontName={family:styleDefs[style].family,style:styleDefs[style].style};t.textStyleId=styleIds[style];if(size){t.fontSize=size;t.lineHeight={unit:"PIXELS",value:Math.ceil(size*1.45)};}t.characters=value;fill(t,color);
 if(width){t.resize(width,t.height);t.textAutoResize="HEIGHT";}else t.textAutoResize="WIDTH_AND_HEIGHT";parent.appendChild(t);return t;
}
function auto(parent,name,width=0,direction="VERTICAL",gap=0,bg=null,pad=0){
 const a=figma.createAutoLayout(direction);a.name=name;fill(a,bg);spacing(a,"itemSpacing",gap);
 if(width){a.resize(width,1);a.layoutSizingHorizontal="FIXED";a.layoutSizingVertical="HUG";}
 if(pad)for(const key of ["paddingTop","paddingBottom","paddingLeft","paddingRight"])spacing(a,key,pad);
 if(parent)parent.appendChild(a);return a;
}
const iconSvg={"arrow-up-right":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M7 7h10v10\" />\n  <path d=\"M7 17 17 7\" />\n</svg>\n","arrow-right":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M5 12h14\" />\n  <path d=\"m12 5 7 7-7 7\" />\n</svg>\n","menu":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M4 5h16\" />\n  <path d=\"M4 12h16\" />\n  <path d=\"M4 19h16\" />\n</svg>\n","chevron-down":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m6 9 6 6 6-6\" />\n</svg>\n","search":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m21 21-4.34-4.34\" />\n  <circle cx=\"11\" cy=\"11\" r=\"8\" />\n</svg>\n","copy":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" />\n  <path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" />\n</svg>\n","wifi":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 20h.01\" />\n  <path d=\"M2 8.82a15 15 0 0 1 20 0\" />\n  <path d=\"M5 12.859a10 10 0 0 1 14 0\" />\n  <path d=\"M8.5 16.429a5 5 0 0 1 7 0\" />\n</svg>\n","usb":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"10\" cy=\"7\" r=\"1\" />\n  <circle cx=\"4\" cy=\"20\" r=\"1\" />\n  <path d=\"M4.7 19.3 19 5\" />\n  <path d=\"m21 3-3 1 2 2Z\" />\n  <path d=\"M9.26 7.68 5 12l2 5\" />\n  <path d=\"m10 14 5 2 3.5-3.5\" />\n  <path d=\"m18 12 1-1 1 1-1 1Z\" />\n</svg>\n","bluetooth":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m7 7 10 10-5 5V2l5 5L7 17\" />\n</svg>\n"};
for(const [name,svg] of Object.entries(iconSvg)){
 const existing=page.children.find(n=>n.type==="COMPONENT"&&n.name==="Icon/"+name);
 if(existing){iconComponents[name]=existing;continue;}
 const c=figma.createComponent();c.name="Icon/"+name;c.resize(24,24);fill(c,null);c.description="Lucide Icons / "+name+" — vector, ISC/MIT; source: lucide-icons/lucide/icons/"+name+".svg";c.x=200+Object.keys(iconComponents).length*80;c.y=100;
 const svgNode=figma.createNodeFromSvg(svg.replaceAll("currentColor","#21251F"));c.appendChild(svgNode);svgNode.x=0;svgNode.y=0;
 for(const v of svgNode.findAllWithCriteria({types:["VECTOR"]})){if(v.strokes.length)v.strokes=[paint("color/icon/primary")];if(v.fills.length)v.fills=[paint("color/icon/primary")];}
 roots.push(c);iconComponents[name]=c;
}
const product={hash:"51fcb4e92d35765704a4cd168cf1ee84692a9a2b"},assembly={hash:"cb6613be4d50927eb04a196a9cbde6b19e1fe098"};
async function family(name,axes,w,h,x,y,build,properties={}){
 const existing=page.children.find(n=>n.name===name&&n.type==="COMPONENT_SET");if(existing){components[name]=existing;return existing;}
 const r=await createComponentWithVariants({name,description:"Microduck Hatchery / "+name+". Shared project tokens and Chinese typography.",variantAxes:axes,baseProps:{width:w,height:h,layoutMode:"HORIZONTAL",itemSpacing:8,fills:[]},page});
 const set=r.componentSet;set.x=x;set.y=y;set.fills=[];roots.push(set);
 const keys={};for(const [label,value] of Object.entries(properties))keys[label]=set.addComponentProperty(label,"TEXT",value);
 for(const c of r.variants){
  c.primaryAxisSizingMode="FIXED";c.counterAxisSizingMode="FIXED";c.primaryAxisAlignItems="CENTER";c.counterAxisAlignItems="CENTER";spacing(c,"itemSpacing",8);build(c,c.variantProperties||Object.fromEntries(c.name.split(", ").map(p=>p.split("="))));
  for(const [label,key] of Object.entries(keys)){const target=c.findAllWithCriteria({types:["TEXT"]}).find(n=>n.name===label);if(target)target.componentPropertyReferences={characters:key};}
 }
 // Offset children inside their variant set so boundaries don't touch labels.
 for(const c of set.children){c.x+=24;c.y+=24;}
 components[name]=set;return set;
}
const button=await family("Button",{Tone:["Primary","Secondary","Ghost"],State:["Default","Hover","Focus","Disabled"]},184,48,200,240,(c,p)=>{
 const off=p.State==="Disabled";fill(c,off?"color/bg/disabled":p.State==="Hover"?"color/bg/accent-soft":p.Tone==="Primary"?"color/shape/ink":p.Tone==="Secondary"?"color/bg/surface":null);
 radius(c,8);for(const k of ["paddingLeft","paddingRight"])spacing(c,k,16);
 if(p.State==="Focus")border(c,"color/border/focus",3);else if(p.Tone==="Secondary"&&!off)border(c);
 const tc=off?"color/text/secondary":p.Tone==="Primary"&&p.State!=="Hover"?"color/text/on-dark":"color/text/primary";
 text(c,"Label","开始复刻",0,"UI / Label",tc);
 const i=iconComponents["arrow-up-right"].createInstance();i.name="icon";i.resize(18,18);c.appendChild(i);
 for(const v of i.findAllWithCriteria({types:["VECTOR"]}))if(v.strokes.length)v.strokes=[paint(tc==="color/text/on-dark"?"color/icon/inverse":"color/icon/primary")];
 if(off)i.opacity=.45;
},{Label:"开始复刻"});
const showIconKey=button.addComponentProperty("Show icon","BOOLEAN",true),iconKey=button.addComponentProperty("Icon","INSTANCE_SWAP",iconComponents["arrow-up-right"].id);
for(const c of button.children){const i=c.children.find(n=>n.name==="icon");i.componentPropertyReferences={visible:showIconKey,mainComponent:iconKey};}
await family("NavItem",{State:["Default","Active"]},76,44,200,610,(c,p)=>{
 fill(c,p.State==="Active"?"color/bg/accent-soft":null);radius(c,8);text(c,"Label","介绍",0,"UI / Label",p.State==="Active"?"color/text/accent":"color/text/secondary");
},{Label:"介绍"});
await family("Badge",{State:["Source","Draft","Example","Online","Stale","Offline","ReadOnly"]},128,28,200,800,(c,p)=>{
 const map={Source:["color/bg/positive-soft","color/text/positive","来源资料"],Draft:["color/bg/page","color/text/secondary","待实机验证"],Example:["color/bg/accent-soft","color/text/accent","示例数据"],Online:["color/bg/positive-soft","color/text/positive","在线"],Stale:["color/bg/accent-soft","color/text/accent","数据陈旧"],Offline:["color/bg/page","color/text/secondary","未连接"],ReadOnly:["color/bg/page","color/text/secondary","只读观察"]},m=map[p.State];fill(c,m[0]);radius(c,999);
 const dot=figma.createEllipse();dot.name="status-marker";dot.resize(5,5);fill(dot,p.State==="Online"?"color/chart/actual":p.State==="Example"||p.State==="Stale"?"color/bg/accent":"color/shape/muted");c.appendChild(dot);
 text(c,"Label",m[2],0,"UI / Small",m[1]);
},{Label:"状态"});
await family("Input",{State:["Default","Focus","Error","Disabled"]},280,48,200,1000,(c,p)=>{
 fill(c,p.State==="Disabled"?"color/bg/disabled":"color/bg/surface");radius(c,8);border(c,p.State==="Focus"?"color/border/focus":p.State==="Error"?"color/border/danger":"color/border/default",p.State==="Focus"?2:1);
 for(const k of ["paddingLeft","paddingRight"])spacing(c,k,16);text(c,"Value","输入开发板 IP",220,"UI / Label","color/text/secondary");
},{Value:"输入开发板 IP"});
await family("ChapterRow",{State:["Default","Active"]},224,48,200,1200,(c,p)=>{
 c.primaryAxisAlignItems="MIN";fill(c,p.State==="Active"?"color/bg/accent-soft":null);radius(c,8);spacing(c,"paddingLeft",16);spacing(c,"paddingRight",16);spacing(c,"itemSpacing",12);text(c,"Number","03",24,"Code / Base",p.State==="Active"?"color/text/accent":"color/text/secondary");text(c,"Title","三种连接",152,"UI / Label",p.State==="Active"?"color/text/accent":"color/text/secondary");
},{Number:"03",Title:"三种连接"});
await family("ServoRow",{State:["Default","Selected","Missing"]},520,48,1100,240,(c,p)=>{
 fill(c,p.State==="Selected"?"color/bg/accent-soft":p.State==="Missing"?"color/bg/page":"color/bg/surface");c.primaryAxisAlignItems="MIN";spacing(c,"paddingLeft",16);spacing(c,"paddingRight",16);
 const vals=[["ID","23",32,"Code / Base"],["Joint","左膝",148,"UI / Label"],["Actual","17.8",64,"Code / Base"],["Goal","18.0",64,"Code / Base"],["Temp","—",52,"Code / Base"],["Enable","只读",76,"UI / Small"]];
 for(const [name,val,w,st] of vals)text(c,name,p.State==="Missing"&&["Actual","Goal","Temp"].includes(name)?"—":val,w,st,p.State==="Missing"?"color/text/secondary":"color/text/primary");
},{ID:"23",Joint:"左膝",Actual:"17.8",Goal:"18.0",Temp:"—",Enable:"只读"});
await family("CodeBlock",{Device:["Desktop","Mobile"]},720,166,1100,490,(c,p)=>{
 const mobile=p.Device==="Mobile";c.resize(mobile?342:720,mobile?190:166);c.layoutMode="VERTICAL";c.primaryAxisSizingMode="AUTO";c.counterAxisSizingMode="FIXED";c.primaryAxisAlignItems="MIN";c.counterAxisAlignItems="MIN";fill(c,"color/bg/dark");radius(c,12);for(const k of ["paddingLeft","paddingRight","paddingTop","paddingBottom"])spacing(c,k,24);spacing(c,"itemSpacing",16);
 const head=auto(c,"header",mobile?294:672,"HORIZONTAL",8);head.primaryAxisAlignItems="SPACE_BETWEEN";text(head,"Location","在 Radxa 执行",0,"UI / Small","color/text/dark-secondary");const i=iconComponents.copy.createInstance();i.resize(16,16);head.appendChild(i);for(const v of i.findAllWithCriteria({types:["VECTOR"]}))if(v.strokes.length)v.strokes=[paint("color/icon/inverse")];
 text(c,"Command","hostname -I\npython3 server.py \\\n  --port /dev/ttyS2",mobile?294:672,"Code / Base","color/text/on-dark",mobile?12:13);
},{Location:"在 Radxa 执行",Command:"hostname -I\npython3 server.py \\\n  --port /dev/ttyS2"});
await family("Callout",{Kind:["Info","Attention","Example"]},720,106,1100,880,(c,p)=>{
 const isAttention=p.Kind==="Attention";c.layoutMode="VERTICAL";c.primaryAxisAlignItems="MIN";c.counterAxisAlignItems="MIN";c.primaryAxisSizingMode="AUTO";fill(c,isAttention?"color/bg/accent-soft":"color/bg/positive-soft");radius(c,8);for(const k of ["paddingTop","paddingBottom","paddingLeft","paddingRight"])spacing(c,k,16);spacing(c,"itemSpacing",8);
 text(c,"Title",isAttention?"先确认总线归属":"本步验证点",688,"UI / Label",isAttention?"color/text/accent":"color/text/positive");
 text(c,"Body","确认服务的真实模式，再读取设备状态。",688,"Body / Base","color/text/primary");
},{Title:"本步验证点",Body:"确认服务的真实模式，再读取设备状态。"});
await family("Photo",{Image:["Product","Assembly"]},480,640,1100,1320,(c,p)=>{
 c.layoutMode="NONE";c.fills=[{type:"IMAGE",imageHash:p.Image==="Product"?product.hash:assembly.hash,scaleMode:"FILL"}];radius(c,12);c.clipsContent=true;
});
await family("Logo",{Size:["Desktop","Mobile"]},300,40,2300,240,(c,p)=>{
 c.primaryAxisAlignItems="MIN";spacing(c,"itemSpacing",12);fill(c,null);if(p.Size==="Mobile")c.resize(260,36);
 const mark=auto(c,"mark",36,"HORIZONTAL",0,"color/bg/accent");mark.resize(36,36);mark.layoutSizingVertical="FIXED";mark.primaryAxisAlignItems="CENTER";mark.counterAxisAlignItems="CENTER";radius(mark,8);text(mark,"Monogram","m.",0,"Meta / Latin","color/text/primary",22);
 text(c,"Wordmark","Microduck Hatchery",0,"Meta / Latin","color/text/primary",p.Size==="Mobile"?16:18);
});
await family("LessonRow",{State:["Default","Active"]},790,88,2300,470,(c,p)=>{
 fill(c,p.State==="Active"?"color/bg/accent-soft":null);c.primaryAxisAlignItems="MIN";spacing(c,"paddingLeft",16);spacing(c,"paddingRight",16);spacing(c,"itemSpacing",24);
 text(c,"Number","01",36,"Number / Large","color/text/secondary",22);
 const b=auto(c,"content",544,"VERTICAL",4);text(b,"Title","准备与机械装配",544,"UI / Label","color/text/primary",18);text(b,"Summary","核对物料、装配版本与关键紧固位置。",544,"UI / Small","color/text/secondary");
 text(c,"Status","草稿",82,"UI / Small","color/text/secondary");
},{Number:"01",Title:"准备与机械装配",Summary:"核对物料、装配版本与关键紧固位置。",Status:"草稿"});
await family("Metric",{Format:["Default"]},156,82,2300,800,(c,p)=>{
 c.layoutMode="VERTICAL";c.primaryAxisAlignItems="MIN";c.counterAxisAlignItems="MIN";spacing(c,"itemSpacing",8);fill(c,null);text(c,"Label","实际角度",156,"UI / Small","color/text/secondary");text(c,"Value","17.8°",156,"Number / Large","color/text/primary");
},{Label:"实际角度",Value:"17.8°"});
// Final review uses instances. Construction assets stay outside the review.
const review=auto(null,"Components / Review",1200,"VERTICAL",32,"color/bg/page",48);review.x=2300;review.y=1160;roots.push(review);
text(review,"title","Microduck Hatchery / Interface",1104,"Meta / Latin","color/text/primary",36);
text(review,"intro","共用色彩与字体，保留不同内容的版式。以下为组件状态与可编辑示例。",1104,"Body / Base","color/text/secondary");
const swatches=auto(review,"palette",1104,"HORIZONTAL",16);
for(const [label,key] of [["暖白","color/bg/page"],["墨黑","color/shape/ink"],["橙黄","color/bg/accent"],["苔绿","color/chart/actual"],["暗色","color/bg/dark"]]){
 const c=auto(swatches,label,208,"VERTICAL",8);const r=figma.createRectangle();r.resize(208,68);fill(r,key);radius(r,8);c.appendChild(r);text(c,"name",label,208,"UI / Small");
}
function instance(parent,setName,props={},label=null){
 const set=components[setName],variant=set.children.find(c=>Object.entries(props).every(([k,v])=>c.variantProperties?.[k]===v))||set.defaultVariant;const i=variant.createInstance();parent.appendChild(i);
 if(label!==null){const k=Object.keys(set.componentPropertyDefinitions).find(k=>k.startsWith("Label#"));if(k)i.setProperties({[k]:label});}return i;
}
for(const tone of ["Primary","Secondary","Ghost"]){
 const row=auto(review,"Button / "+tone,1104,"HORIZONTAL",16);text(row,"tone",tone,120,"UI / Label");for(const state of ["Default","Hover","Focus","Disabled"])instance(row,"Button",{Tone:tone,State:state},state);
}
const states=auto(review,"Statuses",1104,"HORIZONTAL",8);
for(const state of ["Source","Draft","Example","Online","Stale","Offline","ReadOnly"]){const i=instance(states,"Badge",{State:state});const k=Object.keys(components.Badge.componentPropertyDefinitions).find(k=>k.startsWith("Label#"));i.setProperties({[k]:{Source:"来源资料",Draft:"待验证",Example:"示例数据",Online:"在线",Stale:"数据陈旧",Offline:"未连接",ReadOnly:"只读"}[state]});}
const two=auto(review,"Input and servo states",1104,"HORIZONTAL",32);const inputList=auto(two,"Inputs",320,"VERTICAL",16);
for(const state of ["Default","Focus","Error","Disabled"])instance(inputList,"Input",{State:state});
const rows=auto(two,"Servo rows",520,"VERTICAL",8);for(const state of ["Default","Selected","Missing"])instance(rows,"ServoRow",{State:state});
instance(review,"CodeBlock",{Device:"Desktop"});
instance(review,"Callout",{Kind:"Attention"});
const bounds=Object.fromEntries(Object.entries(components).map(([k,v])=>[k,{id:v.id,variants:v.children.map(c=>({id:c.id,name:c.name,x:c.x,y:c.y,width:c.width,height:c.height})),properties:v.componentPropertyDefinitions}]));
return {createdNodeIds:[...new Set(roots.flatMap(n=>[n.id,...n.findAll(()=>true).map(c=>c.id)]))],mutatedNodeIds:[page.id],removedNodeIds,components:bounds,icons:Object.fromEntries(Object.entries(iconComponents).map(([k,v])=>[k,v.id])),images:{product:product.hash,assembly:assembly.hash},review:{id:review.id,width:review.width,height:review.height},fonts:fonts.map(f=>f.family)};

