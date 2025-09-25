import React from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuthStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mb-6">
            Quiz Interactif
            <span className="block text-blue-600">avec Twitch</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Créez des quiz interactifs en temps réel, connectez-vous avec Twitch, 
            et engagez votre audience comme jamais auparavant.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="btn btn-primary text-lg px-8 py-3">
                  Tableau de bord
                </Link>
                <Link to="/quiz/create" className="btn btn-outline text-lg px-8 py-3">
                  Créer un quiz
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary text-lg px-8 py-3">
                  Commencer gratuitement
                </Link>
                <Link to="/join" className="btn btn-outline text-lg px-8 py-3">
                  Rejoindre une session
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Temps Réel</h3>
            <p className="text-gray-600">
              Interactions instantanées via WebSocket pour une expérience fluide et engageante.
            </p>
          </div>

          <div className="text-center p-6">
            <div className="w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h4a1 1 0 110 2h-1v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h4z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Intégration Twitch</h3>
            <p className="text-gray-600">
              Connectez-vous avec votre compte Twitch et engagez votre communauté de streamers.
            </p>
          </div>

          <div className="text-center p-6">
            <div className="w-16 h-16 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Scores Dynamiques</h3>
            <p className="text-gray-600">
              Système de points en temps réel avec classements et statistiques détaillées.
            </p>
          </div>
        </div>

        {/* Statistics */}
        <div className="mt-20 bg-white rounded-2xl shadow-xl p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">1000+</div>
              <div className="text-gray-600">Quiz créés</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">5000+</div>
              <div className="text-gray-600">Sessions jouées</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">25k+</div>
              <div className="text-gray-600">Participants</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-600 mb-2">98%</div>
              <div className="text-gray-600">Satisfaction</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}