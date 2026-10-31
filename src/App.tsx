import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

/**
 * Route-level code splitting: the phone pays for the shell + the page it
 * opens, not for every chart and parser in the app. The Suspense boundary
 * lives around the Outlet in Layout.
 */
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const ArchivePage = lazy(() => import('./pages/ArchivePage').then((m) => ({ default: m.ArchivePage })))
const ReviewEditorPage = lazy(() => import('./pages/ReviewEditorPage').then((m) => ({ default: m.ReviewEditorPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const PlaylistPage = lazy(() => import('./pages/PlaylistPage').then((m) => ({ default: m.PlaylistPage })))
const DnaPage = lazy(() => import('./pages/DnaPage').then((m) => ({ default: m.DnaPage })))
const RecapPage = lazy(() => import('./pages/RecapPage').then((m) => ({ default: m.RecapPage })))
const TaggingPage = lazy(() => import('./pages/TaggingPage').then((m) => ({ default: m.TaggingPage })))
const MilestonesPage = lazy(() => import('./pages/MilestonesPage').then((m) => ({ default: m.MilestonesPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="archive/new" element={<ReviewEditorPage />} />
          <Route path="archive/:id" element={<ReviewEditorPage />} />
          <Route path="tags" element={<TaggingPage />} />
          <Route path="milestones" element={<MilestonesPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="playlist" element={<PlaylistPage />} />
          <Route path="dna" element={<DnaPage />} />
          <Route path="recaps" element={<RecapPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
