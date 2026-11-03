# Copia antes de aplicar skills

`bodega-lo-valledor.antes-skills.html` conserva sin cambios el HTML original.

- Actual: http://localhost:8000/bodega-lo-valledor.html
- Original: http://localhost:8000/versiones/bodega-lo-valledor.antes-skills.html

Ambas versiones usan los mismos datos del navegador al abrirse en el mismo origen. La copia respalda el código, no los datos de localStorage.

Cambios en la versión actual:
- Impeccable: jerarquía, superficies de trabajo, contraste, temas y adaptación móvil.
- make-interfaces-feel-better: controles, foco, numerales, tipografía y estados de interacción.
- transitions-dev: apertura y cierre de modales (250/150 ms), con movimiento reducido.
- GSAP core y performance: entrada del gráfico una vez por carga de la aplicación, con transformaciones; el contenido funciona si la biblioteca no carga. GSAP 3.13.0 se carga desde jsDelivr.
- Diálogos con foco protegido, navegación por teclado, cierre con Escape y retorno de foco.

Verificación: sintaxis JavaScript y generación de HTML para 15 combinaciones de pantalla/rol, tres temas y ausencia de GSAP. No se pudo validar visualmente: el entorno bloqueó Chrome.
