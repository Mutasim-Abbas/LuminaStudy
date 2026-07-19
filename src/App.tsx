import { lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './app/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const GradeCalculator = lazy(() => import('./pages/GradeCalculator'));
const DegreePlanner = lazy(() => import('./pages/DegreePlanner'));
const StudySets = lazy(() => import('./pages/StudySets'));
const StudySetDetail = lazy(() => import('./pages/StudySetDetail'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Quiz = lazy(() => import('./pages/Quiz'));
const Upload = lazy(() => import('./pages/Upload'));
const CreateSet = lazy(() => import('./pages/CreateSet'));

/** HashRouter so the built site works from any static host with no server rewrite rules. */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calculator" element={<GradeCalculator />} />
          <Route path="/planner" element={<DegreePlanner />} />
          <Route path="/study" element={<StudySets />} />
          <Route path="/study/:setId" element={<StudySetDetail />} />
          <Route path="/study/:setId/flashcards" element={<Flashcards />} />
          <Route path="/study/:setId/quiz" element={<Quiz />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/create" element={<CreateSet />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
