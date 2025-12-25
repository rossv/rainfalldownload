import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { PreferencesProvider } from './hooks/usePreferences';

export default function App() {
  return (
    <PreferencesProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
          </Route>
        </Routes>
      </HashRouter>
    </PreferencesProvider>
  );
}
