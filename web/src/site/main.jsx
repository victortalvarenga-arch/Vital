import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// A animação de entrada esconde o conteúdo até o JavaScript revelá-lo. Sem
// esta classe, uma falha no bundle deixaria a página em branco com o texto
// todo lá dentro — ver `.js .revela` no styles.css e `useRevelar` no App.jsx.
document.documentElement.classList.add('js');

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
