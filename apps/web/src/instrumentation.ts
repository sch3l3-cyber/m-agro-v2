import type { Instrumentation } from 'next';

/** Next.js hook: svaka neuhvaćena greška na serveru (stranice, server akcije, API) → Sentry. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { posaljiGreskuServer } = await import('./lib/monitoring/server');
  await posaljiGreskuServer(err, { putanja: request.path, metoda: request.method, ruta: context.routePath, vrsta: context.routeType });
};
