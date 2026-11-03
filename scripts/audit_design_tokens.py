"""Static inventory for the active HTML only. Never rewrites CSS or protected backups."""
from pathlib import Path
from collections import Counter, defaultdict
from itertools import combinations
import colorsys,json,math,re
ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'bodega-lo-valledor.html'
s=TARGET.read_text()
line=lambda pos:s.count('\n',0,pos)+1
color_re=re.compile(r'#[\da-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\([^)]*\)|\b(?:white|black|transparent)\b')
def without_comments(text):
 return re.sub(r'/\*[\s\S]*?\*/',lambda m:re.sub(r'[^\n]',' ',m[0]),text)
def mask_templates(text):
 # Dynamic template expressions are not CSS literals. Preserve offsets and newlines.
 chars=list(text);i=0
 while i<len(text)-1:
  if text[i:i+2]!='${':i+=1;continue
  start=i;depth=1;i+=2
  while i<len(text) and depth:
   if text[i]=='{':depth+=1
   elif text[i]=='}':depth-=1
   i+=1
  for j in range(start,i):
   if chars[j]!='\n':chars[j]=' '
 return ''.join(chars)
def declarations(text,start,selector,inline=False):
 for m in re.finditer(r'(?:^|;)\s*(--[\w-]+|[\w-]+)\s*:\s*([^;]+)',text):
  prop=m[1];value=m[2].strip();pos=start+m.start(2)
  yield dict(property=prop,value=value,line=line(pos),selector=selector,inline=inline)
cssmatch=re.search(r'<style>([\s\S]*?)</style>',s)
css=without_comments(cssmatch[1]);decls=[]
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css):
 selector=m[1].strip()
 decls.extend(declarations(m[2],cssmatch.start(1)+m.start(2),selector))
for m in re.finditer(r'\bstyle="([^"]*)"',s):
 decls.extend(declarations(mask_templates(m[1]),m.start(1),'inline HTML / template',True))
def theme_of(selector):
 m=re.search(r'data-theme=[\'"]?(dark|mint)',selector)
 return m[1] if m else 'default'
def role(prop):
 if prop.startswith('background'):return 'background'
 if prop in ('color','text-shadow'):return 'text'
 if 'shadow' in prop:return 'shadow'
 if prop.startswith(('border','outline')):return 'border'
 return None
def category(name,value):
 if color_re.fullmatch(value):return 'color'
 if re.fullmatch(r'[+-]?\d+',value):return 'z-index'
 if re.fullmatch(r'[\d.]+(?:px|rem|em)',value):
  if name in ('--r','--r-sm') or re.search(r'radius|corner',name):return 'radius'
  if re.search(r'font|text|size',name):return 'font-size'
  return 'spacing'
 if color_re.search(value) and re.search(r'\d(?:px|rem|em)',value):return 'shadow'
 return 'other'
tokens={};token_locations={};redefinitions=[]
for d in decls:
 if not d['property'].startswith('--'):continue
 # Only source declarations at a root/theme root form a token baseline.
 if not re.fullmatch(r':root(?:\[data-theme=[\'"]?(?:dark|mint)[\'"]?\])?',d['selector']):continue
 key=(theme_of(d['selector']),d['property'])
 if key in tokens:redefinitions.append(dict(theme=key[0],name=key[1],earlier=token_locations[key],later=d['line']))
 tokens[key]=d['value'];token_locations[key]=d['line']
base={name:value for (theme,name),value in tokens.items() if theme=='default'}
palettes={theme:{**base,**{name:v for (t,name),v in tokens.items() if t==theme}} for theme in ['default','dark','mint']}
def rgb(value):
 if value=='white':return (1,1,1)
 if value=='black':return (0,0,0)
 if not re.fullmatch(r'#[a-fA-F0-9]{3}(?:[a-fA-F0-9]{3})?',value):return None
 h=value[1:];h=''.join(c*2 for c in h) if len(h)==3 else h
 return tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
def nearest(value,theme):
 values=palettes[theme]
 exact=[k for k,v in values.items() if v.lower()==value.lower()]
 if exact:return ', '.join(f'var({x})' for x in exact)
 a=rgb(value)
 if a:
  candidates=[(sum((x-y)**2 for x,y in zip(a,rgb(v))),k) for k,v in values.items() if rgb(v)]
  if candidates:return f'var({min(candidates)[1]}) (aproximado; validar rol)'
 return 'sin equivalente de valor; definir token por rol'
raw=[];z=[];inventories={k:Counter() for k in ['font-size','border-radius','box-shadow']}
call_roles=defaultdict(set)
for d in decls:
 prop=d['property'];val=d['value']
 if prop.startswith('--'):continue
 for name in re.findall(r'var\((--[\w-]+)',val):
  if role(prop):call_roles[name].add(role(prop))
 for key in inventories:
  if prop==key:inventories[key][val]+=1
 if prop=='z-index' and re.fullmatch(r'-?\d+',val):z.append(d)
 for m in color_re.finditer(val):
  # A color inside a gradient or shadow remains a literal, even beside other var() references.
  if m[0]=='transparent':continue # A transparent reset is intentionally theme-independent.
  raw.append({**d,'literal':m[0],'theme':theme_of(d['selector'])})
# Near-duplicate token pairs are compared only within one effective theme and semantic role.
pairs=[]
for theme,values in palettes.items():
 names=[n for n,v in values.items() if rgb(v)]
 for a,b in combinations(names,2):
  ar,br=call_roles[a],call_roles[b]
  if ar and br and not ar.intersection(br):continue
  ca,cb=rgb(values[a]),rgb(values[b]);ha,la,sa=colorsys.rgb_to_hls(*ca);hb,lb,sb=colorsys.rgb_to_hls(*cb)
  hue=min(abs(ha-hb),1-abs(ha-hb))
  if abs(la-lb)>=.05 or (hue>15/360 and min(sa,sb)>.1):continue
  pairs.append(dict(theme=theme,a=a,b=b,va=values[a],vb=values[b],unknown=not ar or not br))
# literal-token duplicates dissolve in their raw-color rows; count them once per occurrence/theme.
dissolved=0
for d in raw:
 a=rgb(d['literal'])
 if not a:continue
 h,l,sat=colorsys.rgb_to_hls(*a)
 for name,value in palettes[d['theme']].items():
  b=rgb(value)
  if not b:continue
  h2,l2,sat2=colorsys.rgb_to_hls(*b);hue=min(abs(h-h2),1-abs(h-h2))
  if abs(l-l2)<.05 and (hue<15/360 or min(sat,sat2)<=.1) and (not call_roles[name] or role(d['property']) in call_roles[name]):
   dissolved+=1;break
baseline=sorted({category(d['property'],d['value']) for d in decls if d['property'].startswith('--')})
summary=dict(token_names=len({n for _,n in tokens}),scoped_tokens=len(tokens),themes=list(palettes),baseline=baseline,raw_colors=len(raw),spacing='sin baseline de espaciado de layout',near_pairs=len(pairs)+dissolved,token_pairs=len(pairs),dissolved_pairs=dissolved,font_sizes=len(inventories['font-size']),radius_variants=len(inventories['border-radius']),shadow_variants=len(inventories['box-shadow']),hardcoded_z=len(z),redefinitions=len(redefinitions))
report=['# Design token audit - bodega-lo-valledor.html','## Summary',f'- Token sources found: CSS custom properties ({summary["token_names"]} nombres, {len(tokens)} valores por ámbito).','- Themes found: default (:root, base heredada), dark, mint. Solo dark/mint son seleccionables.',f'- Categories with a baseline: {", ".join(baseline)}. --r/--r-sm se clasifican como radios por sus usos; --distance-* son distancias de movimiento, no una escala de layout.','- Sin baseline: espaciado de layout, font-size y z-index. No se presume una retícula de 4/8 px.',f'- Raw colors outside tokens: {len(raw)}', '- Off-scale spacing values: no baseline - no layout spacing tokens found',f'- Near-duplicate color pairs: {len(pairs)+dissolved} ({len(pairs)} token-to-token, {dissolved} dissolved by the raw-color rows)',f'- Distinct font sizes in use (inventario estático): {summary["font_sizes"]} (target: 10 or fewer)',f'- Radius variants: {summary["radius_variants"]} (target: 4 or fewer) · Shadow variants: {summary["shadow_variants"]} (target: 3 or fewer)',f'- Hardcoded z-index values: {len(z)}','', '**Alcance:** inventario de declaraciones en CSS e inline styles del HTML activo. Incluye reglas históricas que podrían estar sobrescritas; sin navegador no se demuestra qué valores se aplican en cada estado. Las expresiones dinámicas se excluyen del valor literal. No es una auditoría de contraste ni una aprobación visual. P0/P1/P2 siguen la taxonomía de la skill; P0 de tokens señala riesgo de theming, no prueba que una tarea esté bloqueada.','', '## P0 - breaks theming','Literales en componentes con variantes de tema o estados interactivos; validar la cascada antes de sustituir.','', '| File:line | Value | Nearest token | Suggested fix |','|---|---|---|---|']
# Every source literal is accounted once. Print and theme-independent selectors remain P1.
p0=[];p1=[]
for d in raw:
 (p1 if '.print' in d['selector'] or '.doc ' in d['selector'] else p0).append(d)
def row(d):
 selector=d['selector'].replace('|','\\|').replace('\n',' ')[:120]
 return f'| bodega-lo-valledor.html:{d["line"]} | `{d["literal"]}` · {d["property"]} · {selector} | {nearest(d["literal"],d["theme"])} · {d["theme"]} | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |'
report.extend(row(d) for d in p0)
report+=['','## P1 - scale drift','','| File:line | Value | Nearest token | Suggested fix |','|---|---|---|---|']
report.extend(row(d) for d in p1)
for key,bound in [('font-size',10),('border-radius',4),('box-shadow',3)]:
 if len(inventories[key])>bound:report.append(f'| {key} - no single location | {len(inventories[key])} variantes (objetivo {bound}) | not applicable - el hallazgo es el recuento | Retirar valores de menor uso tras identificar qué reglas se aplican. |')
report+=['','### Evidencia de inventarios']
for key,values in inventories.items():
 report+=['',f'#### {key}']+[f'- `{v}`: {n} usos estáticos' for v,n in values.most_common()]
report+=['','## P2 - consolidation candidates','','| File:line | Value | Nearest token | Suggested fix |','|---|---|---|---|']
for d in z:report.append(f'| bodega-lo-valledor.html:{d["line"]} | z-index: {d["value"]} | none defined | Definir niveles de capas por rol antes de reemplazar. |')
for pair in pairs:
 a,b,theme=pair['a'],pair['b'],pair['theme'];loc=lambda name:token_locations.get((theme,name),token_locations.get(('default',name)))
 report.append(f'| bodega-lo-valledor.html:{loc(a)} / {loc(b)} | {theme}: `{a}={pair["va"]}` / `{b}={pair["vb"]}` | tokens existentes | '+('¿Comparten función? Rol no derivable para al menos uno; no fusionar automáticamente.' if pair['unknown'] else 'Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos.')+' |')
report+=['','## Proposed renames (do not apply silently)','Ninguno aplicado. Los nombres heredados se conservan.','', '## Consolidation plan','1. Retirar las capas históricas de vidrio/neón en un cambio independiente, tras capturar ambos temas y sus estados. No cambiar valores por similitud sin verificar qué selector gana.','2. Tokenizar el fondo/foreground de `.btn.pri` y sus estados con roles explícitos, conservando inicialmente sus colores.','3. Separar tokens de superficie, texto, estado y marca; verificar ambos temas antes de cada sustitución.']
steps=4
for key,bound in [('font-size',10),('border-radius',4),('box-shadow',3)]:
 vals=inventories[key]
 candidates=sorted(vals.items(),key=lambda x:(x[1],x[0]))
 for value,count in candidates[:max(0,len(vals)-bound)]:
  report.append(f'{steps}. Revisar y retirar solo la variante `{key}: {value}` ({count} usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.');steps+=1
 kept=[value for value,_ in candidates[max(0,len(vals)-bound):]]
 report.append(f'   Inventario retenido provisional de {key}: '+', '.join(f'`{v}`' for v in kept)+'.')
report += [f'{steps}. Definir niveles de z-index y luego mover una capa por cambio.', '', '### Excluded from the count','- `versiones/` y `bodega-lo-valledor.solido.html`: copias protegidas por instrucción del usuario.','- `skills/`: fuentes de terceros, no estilos del producto.','- Colores del logo SVG: identidad de marca; no son colores del tema.','- Contenido JavaScript que no es una declaración de estilo (por ejemplo `meta theme-color`).','- Valores computados dentro de `${...}`: no son literales CSS.','- `transparent`: reinicio transparente independiente del tema; no se propone convertirlo en un color opaco.','', '### Límites y conciliación',f'- Filas de color: {len(p0)} P0 + {len(p1)} P1 = {len(raw)}; cada ocurrencia se cuenta una vez.',f'- Filas z-index: {len(z)}. Pares de tokens: {len(pairs)} filas. Los {dissolved} pares literal-token se disuelven en filas de color y no duplican filas.','- El inventario de variantes cuenta expresiones de código; `var(...)` y los valores históricos pueden quedar sobrescritos. No equivale a estilos computados.','- No se fusionan valores iguales de roles diferentes ni entre temas. No se aplicó el plan de consolidación.']
(ROOT/'reports/design-token-audit.md').write_text('\n'.join(report)+'\n')
(ROOT/'reports/design-token-inventory.json').write_text(json.dumps(dict(summary=summary,tokens=[dict(theme=t,name=n,value=v,line=token_locations[(t,n)],category=category(n,v)) for (t,n),v in tokens.items()],raw_colors=raw,hardcoded_z=z,inventories={k:dict(v) for k,v in inventories.items()},redefinitions=redefinitions),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False))
