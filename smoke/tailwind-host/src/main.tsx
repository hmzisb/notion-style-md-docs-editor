import './app.css';

import { createRoot } from 'react-dom/client';
import { App } from './app.js';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root');

createRoot(container).render(<App />);
