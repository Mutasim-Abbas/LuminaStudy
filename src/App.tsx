import { lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './app/Layout';
import { RequireAuth } from './app/RequireAuth';
import { AuthProvider } from './hooks/useAuth';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const GradeCalculator = lazy(() => import('./pages/GradeCalculator'));
const DegreePlanner = lazy(() => import('./pages/DegreePlanner'));
const StudySets = lazy(() => import('./pages/StudySets'));
const StudySetDetail = lazy(() => import('./pages/StudySetDetail'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Quiz = lazy(() => import('./pages/Quiz'));
const Upload = lazy(() => import('./pages/Upload'));
const CreateSet = lazy(() => import('./pages/CreateSet'));
const SignIn = lazy(() => import('./pages/SignIn'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

/** HashRouter so the built site works from any static host with no server rewrite rules. */
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          {/* The only route reachable signed out — and it renders without the
              app chrome, since there is no app to navigate yet. */}
          <Route path="/account" element={<SignIn />} />

          {/* Reached from an emailed link, necessarily while signed out. */}
          <Route path="/reset" element={<ResetPassword />} />

          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
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
    </AuthProvider>
  );
}
