/**
 * createSemanticTokens
 *
 * Creates a batch of Figma variables in the given collection, one per entry in
 * `tokenMap`. Supports raw values, variable alias references, code syntax, and
 * scopes. Returns a map of token name → Variable for use in subsequent steps.
 *
 * @param {VariableCollection} collection - The target variable collection.
 * @param {Record<string, string>} modeIds - Map of {modeName: modeId} from createVariableCollection.
 * @param {Array<{
 *   name: string,
 *   type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'TIMING' | 'EASING',
 *   values: Record<string, string | number | boolean | MotionEasing | {type: 'VARIABLE_ALIAS', id: string}>,
 *   scopes?: VariableScope[],
 *   codeSyntax?: {WEB?: string, ANDROID?: string, iOS?: string}
 * }>} tokenMap - Ordered list of token definitions.
 *   - `name`: Variable name using slash hierarchy (e.g. "color/bg/primary").
 *   - `type`: Figma variable type.
 *   - `values`: Map of {modeName: value}. Values can be raw (hex string for COLOR,
 *     number for FLOAT) or alias objects {type: 'VARIABLE_ALIAS', id: variableId}.
 *     For COLOR, raw values are accepted as hex strings ("#rrggbb" or "#rrggbbaa")
 *     and converted to {r, g, b, a} automatically.
 *   - `scopes`: Array of VariableScope strings. Omit to use [] (hidden/primitive).
 *   - `codeSyntax`: Platform code syntax strings. Omit to skip.
 * @returns {Promise<{variables: Record<string, Variable>}>}
 *   `variables` maps each token name to its created Variable object.
 */
async function createSemanticTokens(collection, modeIds, tokenMap) {
  const variables = {}

  for (const token of tokenMap) {
    // Create the variable
    const variable = figma.variables.createVariable(token.name, collection, token.type)

    // Set values for each mode
    for (const [modeName, rawValue] of Object.entries(token.values)) {
      const modeId = modeIds[modeName]
      if (!modeId) {
        throw new Error(
          `createSemanticTokens: mode "${modeName}" not found in modeIds for token "${token.name}". ` +
            `Available modes: ${Object.keys(modeIds).join(', ')}`,
        )
      }

      let value = rawValue

      // Convert hex strings to Figma RGBA for COLOR type
      if (token.type === 'COLOR' && typeof rawValue === 'string' && rawValue.startsWith('#')) {
        value = hexToFigmaColor(rawValue)
      }

      variable.setValueForMode(modeId, value)
    }

    // Set scopes (default: empty array = hidden from property pickers / primitives)
    variable.scopes = token.scopes || []

    // Set code syntax per platform
    if (token.codeSyntax) {
      if (token.codeSyntax.WEB) {
        variable.setVariableCodeSyntax('WEB', token.codeSyntax.WEB)
      }
      if (token.codeSyntax.ANDROID) {
        variable.setVariableCodeSyntax('ANDROID', token.codeSyntax.ANDROID)
      }
      if (token.codeSyntax.iOS) {
        variable.setVariableCodeSyntax('iOS', token.codeSyntax.iOS)
      }
    }

    variables[token.name] = variable
  }

  return { variables }
}

/**
 * Converts a hex color string to a Figma RGBA object.
 * Supports "#rgb", "#rrggbb", and "#rrggbbaa".
 *
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function hexToFigmaColor(hex) {
  let h = hex.replace('#', '')

  // Expand shorthand #rgb → #rrggbb
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }

  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  const a = h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1

  return { r, g, b, a }
}

const createdNodeIds=[]; const mutatedNodeIds=[]; const collectionsCreated=[];
const fonts=[{"family":"Manrope","style":"ExtraBold"},{"family":"Noto Sans SC","style":"Bold"},{"family":"Noto Sans SC","style":"Medium"},{"family":"Noto Sans SC","style":"Regular"},{"family":"Manrope","style":"Bold"},{"family":"IBM Plex Mono","style":"Regular"},{"family":"IBM Plex Mono","style":"Medium"}];
await Promise.all(fonts.map(f=>figma.loadFontAsync(f)));
const page=figma.currentPage; page.name="01 · Pages & Responsive"; mutatedNodeIds.push(page.id);
let cp=figma.root.children.find(p=>p.name==="02 · Components & Foundations");
if(!cp){cp=figma.createPage();cp.name="02 · Components & Foundations";createdNodeIds.push(cp.id);}
const existingCollections=await figma.variables.getLocalVariableCollectionsAsync();
function collection(name){let c=existingCollections.find(c=>c.name===name);if(!c){c=figma.variables.createVariableCollection(name);c.renameMode(c.modes[0].modeId,"Base");collectionsCreated.push(c.id);}return c;}
const prim=collection("ML · Primitives"),sem=collection("ML · Tokens");
const existingVars=await figma.variables.getLocalVariablesAsync();
const palette={"paper":"#F5F3EE","surface":"#FFFEFA","ink":"#21251F","muted":"#656D62","line":"#DADDD3","accent":"#F2B544","accentSoft":"#F8EBC9","accentText":"#6B470D","moss":"#466448","mossSoft":"#E7EDE1","danger":"#A54632","dangerSoft":"#F5E0D9","dark":"#202620","darkMuted":"#A9B1A4","onDark":"#F4F4EB","disabled":"#E5E6DD"},semantics={"color/bg/page":["paper",["FRAME_FILL","SHAPE_FILL"]],"color/bg/surface":["surface",["FRAME_FILL","SHAPE_FILL"]],"color/bg/dark":["dark",["FRAME_FILL","SHAPE_FILL"]],"color/bg/accent":["accent",["FRAME_FILL","SHAPE_FILL"]],"color/bg/accent-soft":["accentSoft",["FRAME_FILL","SHAPE_FILL"]],"color/bg/positive-soft":["mossSoft",["FRAME_FILL","SHAPE_FILL"]],"color/bg/danger-soft":["dangerSoft",["FRAME_FILL","SHAPE_FILL"]],"color/bg/disabled":["disabled",["FRAME_FILL","SHAPE_FILL"]],"color/text/primary":["ink",["TEXT_FILL"]],"color/text/secondary":["muted",["TEXT_FILL"]],"color/text/on-dark":["onDark",["TEXT_FILL"]],"color/text/dark-secondary":["darkMuted",["TEXT_FILL"]],"color/text/accent":["accentText",["TEXT_FILL"]],"color/text/positive":["moss",["TEXT_FILL"]],"color/text/danger":["danger",["TEXT_FILL"]],"color/border/default":["line",["STROKE_COLOR"]],"color/border/focus":["accent",["STROKE_COLOR"]],"color/border/positive":["moss",["STROKE_COLOR"]],"color/shape/ink":["ink",["FRAME_FILL","SHAPE_FILL"]],"color/shape/muted":["muted",["FRAME_FILL","SHAPE_FILL"]],"color/shape/line":["line",["FRAME_FILL","SHAPE_FILL"]],"color/chart/target":["accent",["STROKE_COLOR","SHAPE_FILL"]],"color/chart/actual":["moss",["STROKE_COLOR","SHAPE_FILL"]]};
const primMap={};
for(const [name,hex] of Object.entries(palette)){
 const existing=existingVars.find(v=>v.name===name&&v.variableCollectionId===prim.id);
 if(existing){primMap[name]=existing;continue;}
 const r=await createSemanticTokens(prim,{Base:prim.modes[0].modeId},[{name,type:"COLOR",values:{Base:hex},scopes:[],codeSyntax:{WEB:"var(--ml-primitive-"+name+")"}}]);
 primMap[name]=r.variables[name];
}
const semanticDefs=Object.entries(semantics).filter(([name])=>!existingVars.some(v=>v.name===name&&v.variableCollectionId===sem.id)).map(([name,[raw,scopes]])=>({name,type:"COLOR",values:{Base:{type:"VARIABLE_ALIAS",id:primMap[raw].id}},scopes,codeSyntax:{WEB:"var(--ml-"+name.replaceAll("/","-")+")"}}));
for(const value of [0,4,8,12,16,24,32,48,64,80,96]){
 const name="spacing/"+value;if(!existingVars.some(v=>v.name===name&&v.variableCollectionId===sem.id))semanticDefs.push({name,type:"FLOAT",values:{Base:value},scopes:["GAP"],codeSyntax:{WEB:"var(--ml-space-"+value+")"}});
}
for(const value of [0,4,8,12,16,999]){
 const name="radius/"+value;if(!existingVars.some(v=>v.name===name&&v.variableCollectionId===sem.id))semanticDefs.push({name,type:"FLOAT",values:{Base:value},scopes:["CORNER_RADIUS"],codeSyntax:{WEB:"var(--ml-radius-"+value+")"}});
}
await createSemanticTokens(sem,{Base:sem.modes[0].modeId},semanticDefs);
const styleDefs={"Display / Latin":{"family":"Manrope","style":"ExtraBold","size":86,"line":94},"Display / Chinese":{"family":"Noto Sans SC","style":"Bold","size":64,"line":84},"Heading / 1":{"family":"Noto Sans SC","style":"Bold","size":48,"line":64},"Heading / 2":{"family":"Noto Sans SC","style":"Medium","size":32,"line":46},"Heading / 3":{"family":"Noto Sans SC","style":"Medium","size":24,"line":36},"Body / Reading":{"family":"Noto Sans SC","style":"Regular","size":18,"line":32},"Body / Base":{"family":"Noto Sans SC","style":"Regular","size":16,"line":28},"UI / Label":{"family":"Noto Sans SC","style":"Medium","size":14,"line":22},"UI / Small":{"family":"Noto Sans SC","style":"Regular","size":12,"line":20},"Meta / Latin":{"family":"Manrope","style":"Bold","size":12,"line":20,"spacing":1.4},"Code / Base":{"family":"IBM Plex Mono","style":"Regular","size":13,"line":24},"Number / Large":{"family":"IBM Plex Mono","style":"Medium","size":28,"line":36},"Mobile / Display":{"family":"Noto Sans SC","style":"Bold","size":36,"line":50}};
const existingStyles=await figma.getLocalTextStylesAsync();const styles={};
for(const [name,d] of Object.entries(styleDefs)){
 let s=existingStyles.find(s=>s.name==="ML / "+name);if(!s){s=figma.createTextStyle();s.name="ML / "+name;s.fontName={family:d.family,style:d.style};s.fontSize=d.size;s.lineHeight={unit:"PIXELS",value:d.line};s.letterSpacing={unit:"PIXELS",value:d.spacing||0};}styles[name]=s.id;
}
const variables=await figma.variables.getLocalVariablesAsync();
return {createdNodeIds,mutatedNodeIds,pages:{screens:page.id,components:cp.id},collections:collectionsCreated,variables:variables.map(v=>({id:v.id,name:v.name,scopes:v.scopes,codeSyntax:v.codeSyntax,values:v.valuesByMode})),styles,fonts};

