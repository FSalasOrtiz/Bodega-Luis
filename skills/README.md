# Skills locales para Bodega Lo Valledor

Se conservaron las instrucciones publicadas por sus autores y las referencias necesarias para esta revisión. `AGENTS.md` indica cómo cargarlas en este proyecto; estarán disponibles por esa ruta en el siguiente turno. No es una instalación global ni habilita el plugin completo Product Design.

| Skill | Archivo | Fuente primaria |
| --- | --- | --- |
| Design QA | `product-design/skills/design-qa/SKILL.md` | [OpenAI Plugins](https://github.com/openai/plugins/tree/main/plugins/product-design/skills/design-qa) |
| Frontend UI Engineering | `addyosmani/skills/frontend-ui-engineering/SKILL.md` | [Addy Osmani](https://github.com/addyosmani/agent-skills/tree/main/skills/frontend-ui-engineering) |
| Audit Design Tokens | `audit-design-tokens/SKILL.md` | [Humbleteam](https://github.com/humbleteam/audit-design-tokens) |

Hay varias skills llamadas Design QA. Se eligió la fuente de OpenAI, cuyo alcance es comparar una referencia visual con el resultado renderizado; no es un sustituto de una revisión estática.

El directorio `.agents` es de solo lectura en este entorno. El helper oficial `install-skill-from-github.py` se intentó con destino local, pero falló por DNS. Los documentos se recuperaron con la herramienta web desde sus fuentes primarias, se reconstruyeron desde todas sus líneas numeradas, sin huecos, y se conservaron sus referencias relativas. `manifest.json` registra URLs y hashes locales. No se ejecutaron scripts remotos de las skills.

Estas copias no se actualizan automáticamente. La licencia MIT de Addy Osmani está en `addyosmani/LICENSE`. El repositorio de Humbleteam declara MIT; no fue posible recuperar su archivo LICENSE. Para Product Design no se pudo recuperar una licencia raíz; se conserva la atribución y la fuente para consultar sus términos. Esta carpeta reúne documentación para uso local, no representa la instalación de los repositorios completos ni de todas sus skills hermanas.
