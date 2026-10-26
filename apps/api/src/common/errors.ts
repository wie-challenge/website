import { HttpException } from '@nestjs/common';
export function fail(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}
// Error convention for resource-scoped authorization (E01-11):
// - 404 for any existing resource outside the caller's perimeter (organization, ownership,
//   delegation). The body is identical to the "does not exist" case, so a denial never
//   reveals that a resource exists.
// - 403 only when the caller is inside the perimeter but lacks the permission for the action.
export function outOfPerimeter(): never {
  return fail(404, 'NOT_FOUND', 'Resource not found.');
}
export function actionForbidden(): never {
  return fail(403, 'FORBIDDEN', 'You do not have permission for this resource action.');
}