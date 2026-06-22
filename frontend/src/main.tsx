import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import theme from './styles/theme';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={theme}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ConfigProvider>
  </StrictMode>
);
