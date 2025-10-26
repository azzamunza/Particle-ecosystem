import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // <--- add this line if you created index.css
import EcosystemSimulator from './Ecosim.jsx';

createRoot(document.getElementById('root')).render(<EcosystemSimulator />);
