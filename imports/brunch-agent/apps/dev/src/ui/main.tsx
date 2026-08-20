/**
 * The dev app's ui entry.
 *
 * The ui shell renders parts and transports replies; it owns no elicitation
 * semantics (spec §4). A dedicated ui-affordance package is named and deferred
 * — milestone one keeps renderers here (spec §12.5).
 *
 * The chat surface itself lands with the walking skeleton. Note what does and
 * does not cover this file: `@flue/vite` builds the server environment only,
 * so `vite build` never transforms it — `tsc` and `vite dev` are its whole
 * safety net until a client build exists.
 */

import { createRoot } from 'react-dom/client';
import { Chat } from './chat.tsx';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing its #root container');

createRoot(container).render(<Chat />);
