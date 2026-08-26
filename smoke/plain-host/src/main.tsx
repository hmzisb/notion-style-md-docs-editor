/* docs/08 section 1, the non-Tailwind host: the precompiled, scoped stylesheet and the
   variables, and nothing else. No preflight, no build step of the host's own. */
import '@docs/react/styles.css';
import '@docs/react/theme.css';

import { createRoot } from 'react-dom/client';
import { App } from './app.js';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root');

createRoot(container).render(<App />);
