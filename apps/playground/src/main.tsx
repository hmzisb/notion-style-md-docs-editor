import '@fontsource-variable/inter';
import './app.css';
import '@docs/react/styles.css';
import '@docs/react/theme.css';

import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { router } from './router.js';
import { applyTheme, readTheme } from './theme.js';

applyTheme(readTheme());

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
