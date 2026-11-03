# Design token audit - bodega-lo-valledor.html
## Summary
- Token sources found: CSS custom properties (38 nombres, 75 valores por ámbito).
- Themes found: default (:root, base heredada), dark, mint. Solo dark/mint son seleccionables.
- Categories with a baseline: color, other, radius, shadow. --r/--r-sm se clasifican como radios por sus usos; --distance-* son distancias de movimiento, no una escala de layout.
- Sin baseline: espaciado de layout, font-size y z-index. No se presume una retícula de 4/8 px.
- Raw colors outside tokens: 125
- Off-scale spacing values: no baseline - no layout spacing tokens found
- Near-duplicate color pairs: 136 (75 token-to-token, 61 dissolved by the raw-color rows)
- Distinct font sizes in use (inventario estático): 23 (target: 10 or fewer)
- Radius variants: 20 (target: 4 or fewer) · Shadow variants: 18 (target: 3 or fewer)
- Hardcoded z-index values: 5

**Alcance:** inventario de declaraciones en CSS e inline styles del HTML activo. Incluye reglas históricas que podrían estar sobrescritas; sin navegador no se demuestra qué valores se aplican en cada estado. Las expresiones dinámicas se excluyen del valor literal. No es una auditoría de contraste ni una aprobación visual. P0/P1/P2 siguen la taxonomía de la skill; P0 de tokens señala riesgo de theming, no prueba que una tarea esté bloqueada.

## P0 - breaks theming
Literales en componentes con variantes de tema o estados interactivos; validar la cascada antes de sustituir.

| File:line | Value | Nearest token | Suggested fix |
|---|---|---|---|
| bodega-lo-valledor.html:35 | `#fff` · color · .side .promo | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:35 | `#1f8b47` · background · .side .promo | var(--g500) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:35 | `#0d2a19` · background · .side .promo | var(--ink) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:35 | `#07170e` · background · .side .promo | var(--ink) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:45 | `#fff` · color · .avatar | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:51 | `#fff` · color · .btn.pri | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:70 | `#fff` · color · .kpi.hero | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:70 | `#1d7c45` · background · .kpi.hero | var(--g700) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:70 | `#0b4a27` · background · .kpi.hero | var(--g900) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:71 | `#c9f0d3` · color · .kpi.hero .sub | var(--line) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:73 | `#cfe8d5` · border-color · .pill.ok | var(--line) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:74 | `#f5e0ad` · border-color · .pill.warn | var(--mark) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:75 | `#f5c9c2` · border-color · .pill.bad | var(--line) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:90 | `#fff` · background · .bar i | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:90 | `#9aa59f` · background · .bar i | var(--g300) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:90 | `#9aa59f` · border · .bar i | var(--g300) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:95 | `#fff` · background · .bar em | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:106 | `#fde7e3` · background · .ico.t | var(--bad-bg) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:106 | `#c8392b` · color · .ico.t | var(--bad) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:106 | `#fff1d6` · background · .ico.o | var(--warn-bg) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:106 | `#c97a00` · color · .ico.o | var(--warn) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:107 | `#fff` · color · .dark | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:107 | `#1f8b47` · background · .dark | var(--g500) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:107 | `#0d2a19` · background · .dark | var(--ink) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:107 | `#07170e` · background · .dark | var(--ink) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:108 | `#a9c3b2` · color · .dark .muted | var(--g300) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:114 | `#fff` · color · .chip.on | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:134 | `rgba(0,0,0,.08)` · box-shadow · .seg button.on | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:151 | `#1d7c45` · background · .bigbtn.on | var(--g700) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:151 | `#0b4a27` · background · .bigbtn.on | var(--g900) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:151 | `#fff` · color · .bigbtn.on | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:152 | `#c9f0d3` · color · .bigbtn.on span | var(--line) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:155 | `rgba(8,25,15,.45)` · background · .ov | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:161 | `#fff` · color · .toast | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:161 | `rgba(0,0,0,.2)` · box-shadow · .toast | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:162 | `rgba(10,40,20,.16)` · box-shadow · .sug | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:177 | `#fff` · background · .users button | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:183 | `#f1f4f2` · background · .pad button | var(--soft2) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:191 | `rgba(46,155,85,.28)` · background · body | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:191 | `rgba(140,207,0,.22)` · background · body | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:191 | `rgba(11,107,52,.22)` · background · body | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:197 | `rgba(11,90,48,.28)` · box-shadow · .kpi.hero,.bigbtn.on | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:197 | `rgba(255,255,255,.18)` · box-shadow · .kpi.hero,.bigbtn.on | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:198 | `rgba(0,0,0,.25)` · box-shadow · .modal | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:202 | `rgba(10,40,20,.1)` · box-shadow · .prod:hover | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:204 | `#fff` · background · body | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:204 | `#fff` · background · .modal | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:214 | `rgba(46,155,85,.25)` · background · :root[data-theme="dark"] body | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:214 | `rgba(140,207,0,.12)` · background · :root[data-theme="dark"] body | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:214 | `rgba(11,107,52,.3)` · background · :root[data-theme="dark"] body | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:218 | `#1d7c45` · background · :root[data-theme="dark"] .btn.pri | var(--g900) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:218 | `#2e9b55` · border-color · :root[data-theme="dark"] .btn.pri | var(--g300) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:219 | `#2e9b55` · background · :root[data-theme="dark"] .btn.pri:hover | var(--g300) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:220 | `rgba(79,191,114,.25)` · border-color · :root[data-theme="dark"] .pill.ok | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:221 | `rgba(240,181,74,.25)` · border-color · :root[data-theme="dark"] .pill.warn | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:222 | `rgba(255,122,107,.25)` · border-color · :root[data-theme="dark"] .pill.bad | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:223 | `rgba(255,122,107,.15)` · background · :root[data-theme="dark"] .ico.t | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:223 | `#ff8f82` · color · :root[data-theme="dark"] .ico.t | var(--bad) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:224 | `rgba(240,181,74,.15)` · background · :root[data-theme="dark"] .ico.o | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:224 | `#f0b54a` · color · :root[data-theme="dark"] .ico.o | var(--warn) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:225 | `rgba(255,255,255,.1)` · background · :root[data-theme="dark"] .seg button.on | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:232 | `rgba(40,200,90,.35)` · background · :root[data-theme="dark"] body | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:232 | `rgba(40,200,90,.28)` · background · :root[data-theme="dark"] body | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:232 | `#030a05` · background · :root[data-theme="dark"] body | var(--bg) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:235 | `rgba(80,230,120,.35)` · border · :root[data-theme="dark"] .side,:root[data-theme="dark"] .main | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:235 | `rgba(80,230,120,.08)` · box-shadow · :root[data-theme="dark"] .side,:root[data-theme="dark"] .main | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:235 | `rgba(50,220,100,.22)` · box-shadow · :root[data-theme="dark"] .side,:root[data-theme="dark"] .main | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:235 | `rgba(50,220,100,.05)` · box-shadow · :root[data-theme="dark"] .side,:root[data-theme="dark"] .main | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:236 | `rgba(120,255,160,.08)` · box-shadow · :root[data-theme="dark"] .card:not(.hero) | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:236 | `rgba(0,0,0,.35)` · box-shadow · :root[data-theme="dark"] .card:not(.hero) | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:237 | `#1fa748` · background · :root[data-theme="dark"] .kpi.hero,:root[data-theme="dark"] .bigbtn.on | var(--g300) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:237 | `#0a4a1f` · background · :root[data-theme="dark"] .kpi.hero,:root[data-theme="dark"] .bigbtn.on | var(--g100) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:237 | `rgba(60,230,110,.35)` · box-shadow · :root[data-theme="dark"] .kpi.hero,:root[data-theme="dark"] .bigbtn.on | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:237 | `rgba(255,255,255,.2)` · box-shadow · :root[data-theme="dark"] .kpi.hero,:root[data-theme="dark"] .bigbtn.on | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:239 | `#2bc457` · background · :root[data-theme="dark"] .btn.pri | var(--g300) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:239 | `#159a3c` · background · :root[data-theme="dark"] .btn.pri | var(--g900) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:239 | `#3fdc6a` · border-color · :root[data-theme="dark"] .btn.pri | var(--g500) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:239 | `rgba(60,230,110,.35)` · box-shadow · :root[data-theme="dark"] .btn.pri | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:240 | `rgba(60,230,110,.3)` · box-shadow · :root[data-theme="dark"] .btn.sm.pri | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:241 | `rgba(60,230,110,.25)` · text-shadow · :root[data-theme="dark"] .num b,:root[data-theme="dark"] .prod .pr | sin equivalente de valor; definir token por rol · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:247 | `rgba(255,255,255,.7)` · background · :root[data-theme="mint"] body | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:247 | `rgba(46,155,85,.22)` · background · :root[data-theme="mint"] body | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:247 | `#dcefe1` · background · :root[data-theme="mint"] body | var(--bg) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:247 | `#bcdcc5` · background · :root[data-theme="mint"] body | var(--line) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:250 | `#0d3d22` · background · :root[data-theme="mint"] .side | var(--g900) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:250 | `#082a17` · background · :root[data-theme="mint"] .side | var(--ink) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:250 | `rgba(255,255,255,.08)` · border-color · :root[data-theme="mint"] .side | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:250 | `rgba(8,42,23,.3)` · box-shadow · :root[data-theme="mint"] .side | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:251 | `#9fc3ad` · color · :root[data-theme="mint"] .side .nav a | var(--g300) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:252 | `#fff` · color · :root[data-theme="mint"] .side .nav a:hover,:root[data-theme="mint"] .side .nav a.on | var(--card), var(--field) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:253 | `rgba(140,207,0,.12)` · background · :root[data-theme="mint"] .side .nav a.on | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:256 | `#6f9a80` · color · :root[data-theme="mint"] .side .navlbl | var(--g300) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:257 | `rgba(255,255,255,.07)` · background · :root[data-theme="mint"] .side .promo | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:257 | `rgba(255,255,255,.1)` · border · :root[data-theme="mint"] .side .promo | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:258 | `#1f8b47` · background · :root[data-theme="mint"] .kpi.hero,:root[data-theme="mint"] .bigbtn.on | var(--g500) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:258 | `#0f3d22` · background · :root[data-theme="mint"] .kpi.hero,:root[data-theme="mint"] .bigbtn.on | var(--g900) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:258 | `#082a17` · background · :root[data-theme="mint"] .kpi.hero,:root[data-theme="mint"] .bigbtn.on | var(--ink) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:258 | `rgba(8,42,23,.35)` · box-shadow · :root[data-theme="mint"] .kpi.hero,:root[data-theme="mint"] .bigbtn.on | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:259 | `rgba(20,80,40,.08)` · box-shadow · :root[data-theme="mint"] .card:not(.hero) | sin equivalente de valor; definir token por rol · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:260 | `#0d3d22` · background · :root[data-theme="mint"] .bnav | var(--g900) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:260 | `#082a17` · background · :root[data-theme="mint"] .bnav | var(--ink) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:260 | `#9fc3ad` · color · :root[data-theme="mint"] .bnav a | var(--g300) (aproximado; validar rol) · mint | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:267 | `#fff` · color · .themes button.on | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:314 | `#10291b` · color · ::selection | var(--ink) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:343 | `#125b36` · background · .kpi.hero,:root[data-theme] .kpi.hero | var(--g800) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:343 | `#fff` · color · .kpi.hero,:root[data-theme] .kpi.hero | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:344 | `#d6f0df` · color · .kpi.hero .lbl,.kpi.hero .sub | var(--line) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:345 | `#123623` · background · .dark | var(--g900) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:346 | `#246b43` · background · .avatar | var(--g700) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:349 | `#125b36` · background · .btn.pri,:root[data-theme] .btn.pri | var(--g800) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:349 | `#fff` · color · .btn.pri,:root[data-theme] .btn.pri | var(--card), var(--field) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:349 | `#125b36` · border-color · .btn.pri,:root[data-theme] .btn.pri | var(--g800) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:350 | `#0c4729` · background · .btn.pri:hover,:root[data-theme] .btn.pri:hover | var(--g900) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:350 | `#0c4729` · border-color · .btn.pri:hover,:root[data-theme] .btn.pri:hover | var(--g900) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:376 | `#125b36` · background · .bigbtn.on,:root[data-theme] .bigbtn.on | var(--g800) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:376 | `white` · color · .bigbtn.on,:root[data-theme] .bigbtn.on | var(--card) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:380 | `rgba(8,20,12,.56)` · background · .ov | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:381 | `rgba(0,0,0,.25)` · box-shadow · .modal | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:408 | `white` · background · body,:root[data-theme] body | var(--card) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:409 | `white` · background · .modal | var(--card) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:409 | `black` · color · .modal | var(--ink) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:466 | `rgba(10,40,20,.16)` · box-shadow · .sug | sin equivalente de valor; definir token por rol · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:467 | `#123623` · background · :root[data-theme="dark"] .dark | var(--card) (aproximado; validar rol) · dark | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:473 | `#125b36` · background · .btn.pri:hover,:root[data-theme] .btn.pri:hover | var(--g800) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |
| bodega-lo-valledor.html:473 | `#125b36` · border-color · .btn.pri:hover,:root[data-theme] .btn.pri:hover | var(--g800) (aproximado; validar rol) · default | Resolver token semántico y comprobar cascada/tema; no sustituir solo por cercanía. |

## P1 - scale drift

| File:line | Value | Nearest token | Suggested fix |
|---|---|---|---|
| font-size - no single location | 23 variantes (objetivo 10) | not applicable - el hallazgo es el recuento | Retirar valores de menor uso tras identificar qué reglas se aplican. |
| border-radius - no single location | 20 variantes (objetivo 4) | not applicable - el hallazgo es el recuento | Retirar valores de menor uso tras identificar qué reglas se aplican. |
| box-shadow - no single location | 18 variantes (objetivo 3) | not applicable - el hallazgo es el recuento | Retirar valores de menor uso tras identificar qué reglas se aplican. |

### Evidencia de inventarios

#### font-size
- `12px`: 23 usos estáticos
- `13px`: 14 usos estáticos
- `16px`: 10 usos estáticos
- `22px`: 8 usos estáticos
- `30px`: 7 usos estáticos
- `24px`: 7 usos estáticos
- `11px`: 4 usos estáticos
- `14px`: 3 usos estáticos
- `20px`: 3 usos estáticos
- `28px`: 3 usos estáticos
- `15px`: 3 usos estáticos
- `40px`: 2 usos estáticos
- `10.5px`: 2 usos estáticos
- `12.5px`: 2 usos estáticos
- `18px`: 2 usos estáticos
- `17px`: 1 usos estáticos
- `11.5px`: 1 usos estáticos
- `13.5px`: 1 usos estáticos
- `14.5px`: 1 usos estáticos
- `32px`: 1 usos estáticos
- `clamp(22px,6.5vw,30px)`: 1 usos estáticos
- `clamp(20px,6vw,28px)`: 1 usos estáticos
- `34px`: 1 usos estáticos

#### border-radius
- `999px`: 8 usos estáticos
- `50%`: 8 usos estáticos
- `18px`: 5 usos estáticos
- `12px`: 5 usos estáticos
- `10px`: 5 usos estáticos
- `var(--r)`: 4 usos estáticos
- `14px`: 4 usos estáticos
- `16px`: 4 usos estáticos
- `99px`: 4 usos estáticos
- `0`: 2 usos estáticos
- `20px`: 2 usos estáticos
- `0 4px 4px 0`: 1 usos estáticos
- `6px`: 1 usos estáticos
- `24px`: 1 usos estáticos
- `3px`: 1 usos estáticos
- `28px`: 1 usos estáticos
- `24px 24px 0 0`: 1 usos estáticos
- `8px`: 1 usos estáticos
- `6px 6px 0 0`: 1 usos estáticos
- `20px 20px 0 0`: 1 usos estáticos

#### box-shadow
- `none`: 10 usos estáticos
- `0 12px 32px rgba(10,40,20,.16)`: 2 usos estáticos
- `var(--sh)`: 1 usos estáticos
- `0 1px 3px rgba(0,0,0,.08)`: 1 usos estáticos
- `0 8px 24px rgba(0,0,0,.2)`: 1 usos estáticos
- `0 10px 30px rgba(11,90,48,.28),inset 0 1px 0 rgba(255,255,255,.18)`: 1 usos estáticos
- `0 20px 60px rgba(0,0,0,.25)`: 1 usos estáticos
- `0 8px 24px rgba(10,40,20,.1)`: 1 usos estáticos
- `0 0 0 1px rgba(80,230,120,.08),0 0 40px rgba(50,220,100,.22),inset 0 0 60px rgba(50,220,100,.05)`: 1 usos estáticos
- `inset 0 1px 0 rgba(120,255,160,.08),0 6px 24px rgba(0,0,0,.35)`: 1 usos estáticos
- `0 0 30px rgba(60,230,110,.35),inset 0 1px 0 rgba(255,255,255,.2)`: 1 usos estáticos
- `0 0 12px var(--g700)`: 1 usos estáticos
- `0 0 18px rgba(60,230,110,.35)`: 1 usos estáticos
- `0 0 12px rgba(60,230,110,.3)`: 1 usos estáticos
- `0 12px 40px rgba(8,42,23,.3)`: 1 usos estáticos
- `0 12px 30px rgba(8,42,23,.35)`: 1 usos estáticos
- `0 6px 24px rgba(20,80,40,.08)`: 1 usos estáticos
- `0 24px 72px rgba(0,0,0,.25)`: 1 usos estáticos

## P2 - consolidation candidates

| File:line | Value | Nearest token | Suggested fix |
|---|---|---|---|
| bodega-lo-valledor.html:155 | z-index: 50 | none defined | Definir niveles de capas por rol antes de reemplazar. |
| bodega-lo-valledor.html:161 | z-index: 60 | none defined | Definir niveles de capas por rol antes de reemplazar. |
| bodega-lo-valledor.html:162 | z-index: 20 | none defined | Definir niveles de capas por rol antes de reemplazar. |
| bodega-lo-valledor.html:294 | z-index: 40 | none defined | Definir niveles de capas por rol antes de reemplazar. |
| bodega-lo-valledor.html:457 | z-index: 100 | none defined | Definir niveles de capas por rol antes de reemplazar. |
| bodega-lo-valledor.html:306 / 13 | default: `--bg=#eef2ef` / `--g100=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 14 | default: `--bg=#eef2ef` / `--ok-bg=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 15 | default: `--bg=#eef2ef` / `--soft=#eef1ee` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 15 | default: `--bg=#eef2ef` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 12 | default: `--panel=#f5f7f5` / `--card=#fff` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 13 | default: `--panel=#f5f7f5` / `--g100=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 14 | default: `--panel=#f5f7f5` / `--ok-bg=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 15 | default: `--panel=#f5f7f5` / `--soft=#eef1ee` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 15 | default: `--panel=#f5f7f5` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 15 | default: `--panel=#f5f7f5` / `--hover=#fafcfa` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 15 | default: `--panel=#f5f7f5` / `--field=#fff` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:12 / 15 | default: `--card=#fff` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:12 / 15 | default: `--card=#fff` / `--hover=#fafcfa` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:12 / 15 | default: `--card=#fff` / `--field=#fff` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:12 / 13 | default: `--ink=#14201a` / `--g900=#0a3d22` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 13 | default: `--muted=#58685f` / `--lime=#8ccf00` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 14 | default: `--muted=#58685f` / `--warn=#d98b00` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 13 | default: `--line=#dce4de` / `--g100=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:306 / 14 | default: `--line=#dce4de` / `--ok-bg=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 13 | default: `--g800=#0b5a30` / `--g700=#0b6b34` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 14 | default: `--g100=#e5f4e8` / `--ok-bg=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 15 | default: `--g100=#e5f4e8` / `--soft=#eef1ee` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 15 | default: `--g100=#e5f4e8` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 15 | default: `--warn-bg=#fff4dc` / `--soft=#eef1ee` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 15 | default: `--warn-bg=#fff4dc` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 15 | default: `--bad-bg=#fde8e5` / `--soft=#eef1ee` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 15 | default: `--bad-bg=#fde8e5` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 15 | default: `--ok-bg=#e5f4e8` / `--soft=#eef1ee` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 15 | default: `--ok-bg=#e5f4e8` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:15 / 15 | default: `--soft=#eef1ee` / `--soft2=#f2f4f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:15 / 15 | default: `--soft=#eef1ee` / `--hover=#fafcfa` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:15 / 15 | default: `--soft2=#f2f4f3` / `--hover=#fafcfa` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:15 / 15 | default: `--soft2=#f2f4f3` / `--field=#fff` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:15 / 15 | default: `--hover=#fafcfa` / `--field=#fff` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--bg=#101713` / `--panel=#17211b` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--bg=#101713` / `--field=#162019` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--panel=#17211b` / `--card=#1d2a22` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--panel=#17211b` / `--field=#162019` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--card=#1d2a22` / `--soft=#223027` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--card=#1d2a22` / `--hover=#26372c` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--card=#1d2a22` / `--field=#162019` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--muted=#afc0b4` / `--g700=#85dba7` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--line=#35473b` / `--g100=#263e2e` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--line=#35473b` / `--soft2=#2a3a2f` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--g100=#263e2e` / `--soft=#223027` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--g100=#263e2e` / `--soft2=#2a3a2f` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--g100=#263e2e` / `--hover=#26372c` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--soft=#223027` / `--soft2=#2a3a2f` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--soft=#223027` / `--hover=#26372c` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:310 / 310 | dark: `--soft2=#2a3a2f` / `--hover=#26372c` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 311 | mint: `--bg=#deebe2` / `--panel=#edf4ef` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 13 | mint: `--bg=#deebe2` / `--g100=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 14 | mint: `--bg=#deebe2` / `--ok-bg=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 244 | mint: `--bg=#deebe2` / `--soft=#e4f1e7` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 244 | mint: `--bg=#deebe2` / `--soft2=#e9f4ec` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 13 | mint: `--panel=#edf4ef` / `--g100=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 14 | mint: `--panel=#edf4ef` / `--ok-bg=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 244 | mint: `--panel=#edf4ef` / `--soft=#e4f1e7` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 244 | mint: `--panel=#edf4ef` / `--soft2=#e9f4ec` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 244 | mint: `--panel=#edf4ef` / `--hover=#f1f9f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 244 | mint: `--card=#fff` / `--hover=#f1f9f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:311 / 15 | mint: `--card=#fff` / `--field=#fff` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:12 / 13 | mint: `--ink=#14201a` / `--g900=#0a3d22` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 13 | mint: `--g800=#0b5a30` / `--g700=#0b6b34` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 14 | mint: `--g100=#e5f4e8` / `--ok-bg=#e5f4e8` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 244 | mint: `--g100=#e5f4e8` / `--soft=#e4f1e7` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 244 | mint: `--g100=#e5f4e8` / `--soft2=#e9f4ec` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:13 / 244 | mint: `--g100=#e5f4e8` / `--hover=#f1f9f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 244 | mint: `--ok-bg=#e5f4e8` / `--soft=#e4f1e7` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 244 | mint: `--ok-bg=#e5f4e8` / `--soft2=#e9f4ec` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:14 / 244 | mint: `--ok-bg=#e5f4e8` / `--hover=#f1f9f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:244 / 244 | mint: `--soft=#e4f1e7` / `--soft2=#e9f4ec` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:244 / 244 | mint: `--soft=#e4f1e7` / `--hover=#f1f9f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:244 / 244 | mint: `--soft2=#e9f4ec` / `--hover=#f1f9f3` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |
| bodega-lo-valledor.html:244 / 15 | mint: `--hover=#f1f9f3` / `--field=#fff` | tokens existentes | Revisar intención semántica: valores próximos pueden requerir tokens distintos; no fusionar sin revisar usos. |

## Proposed renames (do not apply silently)
Ninguno aplicado. Los nombres heredados se conservan.

## Consolidation plan
1. Retirar las capas históricas de vidrio/neón en un cambio independiente, tras capturar ambos temas y sus estados. No cambiar valores por similitud sin verificar qué selector gana.
2. Tokenizar el fondo/foreground de `.btn.pri` y sus estados con roles explícitos, conservando inicialmente sus colores.
3. Separar tokens de superficie, texto, estado y marca; verificar ambos temas antes de cada sustitución.
4. Revisar y retirar solo la variante `font-size: 11.5px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
5. Revisar y retirar solo la variante `font-size: 13.5px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
6. Revisar y retirar solo la variante `font-size: 14.5px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
7. Revisar y retirar solo la variante `font-size: 17px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
8. Revisar y retirar solo la variante `font-size: 32px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
9. Revisar y retirar solo la variante `font-size: 34px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
10. Revisar y retirar solo la variante `font-size: clamp(20px,6vw,28px)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
11. Revisar y retirar solo la variante `font-size: clamp(22px,6.5vw,30px)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
12. Revisar y retirar solo la variante `font-size: 10.5px` (2 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
13. Revisar y retirar solo la variante `font-size: 12.5px` (2 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
14. Revisar y retirar solo la variante `font-size: 18px` (2 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
15. Revisar y retirar solo la variante `font-size: 40px` (2 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
16. Revisar y retirar solo la variante `font-size: 14px` (3 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
   Inventario retenido provisional de font-size: `15px`, `20px`, `28px`, `11px`, `24px`, `30px`, `22px`, `16px`, `13px`, `12px`.
17. Revisar y retirar solo la variante `border-radius: 0 4px 4px 0` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
18. Revisar y retirar solo la variante `border-radius: 20px 20px 0 0` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
19. Revisar y retirar solo la variante `border-radius: 24px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
20. Revisar y retirar solo la variante `border-radius: 24px 24px 0 0` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
21. Revisar y retirar solo la variante `border-radius: 28px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
22. Revisar y retirar solo la variante `border-radius: 3px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
23. Revisar y retirar solo la variante `border-radius: 6px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
24. Revisar y retirar solo la variante `border-radius: 6px 6px 0 0` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
25. Revisar y retirar solo la variante `border-radius: 8px` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
26. Revisar y retirar solo la variante `border-radius: 0` (2 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
27. Revisar y retirar solo la variante `border-radius: 20px` (2 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
28. Revisar y retirar solo la variante `border-radius: 14px` (4 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
29. Revisar y retirar solo la variante `border-radius: 16px` (4 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
30. Revisar y retirar solo la variante `border-radius: 99px` (4 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
31. Revisar y retirar solo la variante `border-radius: var(--r)` (4 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
32. Revisar y retirar solo la variante `border-radius: 10px` (5 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
   Inventario retenido provisional de border-radius: `12px`, `18px`, `50%`, `999px`.
33. Revisar y retirar solo la variante `box-shadow: 0 0 0 1px rgba(80,230,120,.08),0 0 40px rgba(50,220,100,.22),inset 0 0 60px rgba(50,220,100,.05)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
34. Revisar y retirar solo la variante `box-shadow: 0 0 12px rgba(60,230,110,.3)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
35. Revisar y retirar solo la variante `box-shadow: 0 0 12px var(--g700)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
36. Revisar y retirar solo la variante `box-shadow: 0 0 18px rgba(60,230,110,.35)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
37. Revisar y retirar solo la variante `box-shadow: 0 0 30px rgba(60,230,110,.35),inset 0 1px 0 rgba(255,255,255,.2)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
38. Revisar y retirar solo la variante `box-shadow: 0 10px 30px rgba(11,90,48,.28),inset 0 1px 0 rgba(255,255,255,.18)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
39. Revisar y retirar solo la variante `box-shadow: 0 12px 30px rgba(8,42,23,.35)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
40. Revisar y retirar solo la variante `box-shadow: 0 12px 40px rgba(8,42,23,.3)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
41. Revisar y retirar solo la variante `box-shadow: 0 1px 3px rgba(0,0,0,.08)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
42. Revisar y retirar solo la variante `box-shadow: 0 20px 60px rgba(0,0,0,.25)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
43. Revisar y retirar solo la variante `box-shadow: 0 24px 72px rgba(0,0,0,.25)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
44. Revisar y retirar solo la variante `box-shadow: 0 6px 24px rgba(20,80,40,.08)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
45. Revisar y retirar solo la variante `box-shadow: 0 8px 24px rgba(0,0,0,.2)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
46. Revisar y retirar solo la variante `box-shadow: 0 8px 24px rgba(10,40,20,.1)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
47. Revisar y retirar solo la variante `box-shadow: inset 0 1px 0 rgba(120,255,160,.08),0 6px 24px rgba(0,0,0,.35)` (1 usos), conservando un rol equivalente de la escala existente. Confirmar que está activa antes de tocarla.
   Inventario retenido provisional de box-shadow: `var(--sh)`, `0 12px 32px rgba(10,40,20,.16)`, `none`.
48. Definir niveles de z-index y luego mover una capa por cambio.

### Excluded from the count
- `versiones/` y `bodega-lo-valledor.solido.html`: copias protegidas por instrucción del usuario.
- `skills/`: fuentes de terceros, no estilos del producto.
- Colores del logo SVG: identidad de marca; no son colores del tema.
- Contenido JavaScript que no es una declaración de estilo (por ejemplo `meta theme-color`).
- Valores computados dentro de `${...}`: no son literales CSS.
- `transparent`: reinicio transparente independiente del tema; no se propone convertirlo en un color opaco.

### Límites y conciliación
- Filas de color: 125 P0 + 0 P1 = 125; cada ocurrencia se cuenta una vez.
- Filas z-index: 5. Pares de tokens: 75 filas. Los 61 pares literal-token se disuelven en filas de color y no duplican filas.
- El inventario de variantes cuenta expresiones de código; `var(...)` y los valores históricos pueden quedar sobrescritos. No equivale a estilos computados.
- No se fusionan valores iguales de roles diferentes ni entre temas. No se aplicó el plan de consolidación.
