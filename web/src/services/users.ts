import type { UserInput } from '../domain/operations';

/** Administración de usuarios. Local: se guarda en los datos. Firebase: Cloud Function con Admin SDK (crea la cuenta en Auth y asigna el rol). */
export interface UserAdminService {
  save(id: string, input: UserInput): Promise<void>;
}
