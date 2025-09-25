import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { Navbar } from './components/layout/Navbar'
import { LoadingSpinner } from './components/ui/LoadingSpinner'

// Pages
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { QuizCreatePage } from './pages/QuizCreatePage'
import { QuizEditPage } from './pages/QuizEditPage'
import { QuizPlayPage } from './pages/QuizPlayPage'
import { SessionHostPage } from './pages/SessionHostPage'
import { SessionJoinPage } from './pages/SessionJoinPage'
import { SessionPlayPage } from './pages/SessionPlayPage'
import { ProfilePage } from './pages/ProfilePage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { ExplorePage } from './pages/ExplorePage'
import { AuthSuccessPage } from './pages/AuthSuccessPage'
import { NotFoundPage } from './pages/NotFoundPage'

// Route protection component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Public route component (redirect if authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  const { initializeAuth, isLoading } = useAuthStore()

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Chargement de SourceKuizz...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="pt-16"> {/* Space for fixed navbar */}
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/join/:code?" element={<SessionJoinPage />} />
          <Route path="/play/session/:code" element={<SessionPlayPage />} />
          
          {/* Auth routes (redirect if authenticated) */}
          <Route path="/login" element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          } />
          <Route path="/register" element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          } />
          <Route path="/auth/success" element={<AuthSuccessPage />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          } />
          <Route path="/quiz/create" element={
            <ProtectedRoute>
              <QuizCreatePage />
            </ProtectedRoute>
          } />
          <Route path="/quiz/:id/edit" element={
            <ProtectedRoute>
              <QuizEditPage />
            </ProtectedRoute>
          } />
          <Route path="/quiz/:id/play" element={<QuizPlayPage />} />
          <Route path="/quiz/:id/host" element={
            <ProtectedRoute>
              <SessionHostPage />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          } />
          <Route path="/user/:id" element={<ProfilePage />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App