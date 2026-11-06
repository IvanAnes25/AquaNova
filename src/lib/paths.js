const appRoutes = [
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/shop',
  '/dashboard',
];

function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function appBasePath() {
  const path = currentPath();
  const route = appRoutes.find((candidate) => path === candidate || path.endsWith(candidate));
  if (route) return path.slice(0, -route.length);
  return path === '/' ? '' : path;
}

export function currentAppRoute() {
  const path = currentPath();
  return appRoutes.find((candidate) => path === candidate || path.endsWith(candidate)) ?? '/';
}

export function routePath(route) {
  return `${appBasePath()}${route}` || '/';
}

export function apiPath(path) {
  return `${appBasePath()}${path}`;
}
