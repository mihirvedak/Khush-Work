import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Overview } from './modules/Overview';
import { Timeline } from './modules/Timeline';
import { DataLogger } from './modules/DataLogger';
import { Oee } from './modules/Oee';
import { Process } from './modules/Process';
import { Logbooks } from './modules/Logbooks';
import { Genealogy } from './modules/Genealogy';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/oee" element={<Oee />} />
          <Route path="/data-logger" element={<DataLogger />} />
          <Route path="/process" element={<Process />} />
          <Route path="/logbooks" element={<Logbooks />} />
          <Route path="/genealogy" element={<Genealogy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
