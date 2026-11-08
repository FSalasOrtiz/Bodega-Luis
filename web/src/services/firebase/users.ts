import { httpsCallable } from 'firebase/functions';
import type { UserInput } from '../../domain/operations';
import type { UserAdminService } from '../users';
import { firebaseFunctions } from './config';
import { friendlyError } from './errors';

/** Alta y edición de usuarios mediante la Cloud Function `saveUser` (Admin SDK en el servidor). */
export class FirebaseUserAdmin implements UserAdminService {
  async save(id: string, input: UserInput): Promise<void> {
    try {
      await httpsCallable<{ id: string; input: UserInput }, { id: string }>(firebaseFunctions(), 'saveUser')({ id, input });
    } catch (e) { throw friendlyError(e); }
  }
}
export async function callResetData(): Promise<void> {
  try { await httpsCallable(firebaseFunctions(), 'resetData', { timeout: 540000 })({ confirm: 'BORRAR' }); }
  catch (e) { throw friendlyError(e); }
}
