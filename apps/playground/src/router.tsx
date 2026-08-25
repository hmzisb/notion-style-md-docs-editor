import { createRouter } from '@tanstack/react-router';
import { indexRoute } from './routes/index.js';
import { pageRoute } from './routes/page.js';
import { rootRoute } from './routes/root.js';

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
