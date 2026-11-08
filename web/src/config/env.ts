/** Modo de datos: 'local' (demostración/pruebas, sin servidor) o 'firebase' (producción). */
export const DATA_MODE: 'local' | 'firebase' = import.meta.env.VITE_DATA_MODE === 'firebase' ? 'firebase' : 'local';
/** En modo local: cargar datos de demostración al iniciar por primera vez. */
export const LOCAL_DEMO = import.meta.env.VITE_LOCAL_DEMO !== 'false';
