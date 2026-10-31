import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { OverviewPage } from './pages/OverviewPage'
import { ArchivePage } from './pages/ArchivePage'
import { ReviewEditorPage } from './pages/ReviewEditorPage'
import { ImportPage } from './pages/ImportPage'
import { HistoryPage } from './pages/HistoryPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="archive/new" element={<ReviewEditorPage />} />
          <Route path="archive/:id" element={<ReviewEditorPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="playlist" element={<PlaylistPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
