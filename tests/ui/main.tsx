import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminPlaceEditor from '../../src/components/AdminPlaceEditor';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<AdminPlaceEditor uid="active-admin" onHome={() => location.reload()} />);
