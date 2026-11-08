import type { AuthService } from '../services/auth';

/** Servicios activos (local o Firebase), elegidos al arrancar según la configuración. */
export const services: { auth: AuthService } = { auth: undefined as unknown as AuthService };
import type { UserAdminService } from '../services/users';
import type { State } from '../types/model';

/** Servicios que dependen del modo (local o Firebase). */
export const adminServices: {
  users: UserAdminService;
  /** Reinicia los datos. `blank`: deja solo usuarios, catálogo y ajustes. */
  reset: (blank: boolean) => Promise<void>;
  /** Si se pueden cargar datos de demostración (nunca en producción). */
  allowDemoData: boolean;
} = { users: undefined as unknown as UserAdminService, reset: async () => {}, allowDemoData: false };
export type { State };
