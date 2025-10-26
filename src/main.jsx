import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // import Tailwind-built CSS (PostCSS approach)
import EcosystemSimulator from './Ecosim.jsx';

createRoot(document.getElementById('root')).render(<EcosystemSimulator />);
