import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import toast from 'react-hot-toast'
import { User, LoginForm, RegisterForm, AuthState } from '../types'
import { apiService } from '../services/api'
import { socketService } from '../services/socket'

interface AuthStore extends AuthState {
  initializeAuth: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      initializeAuth: async () => {
        try {
          const token = localStorage.getItem('sourcekuizz_token')
          const userStr = localStorage.getItem('sourcekuizz_user')

          if (!token || !userStr) {
            set({ isLoading: false })
            return
          }

          // Vérifier la validité du token
          const { valid, user } = await apiService.verifyToken(token)
          
          if (valid && user) {
            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false
            })

            // Connecter le WebSocket avec le token
            socketService.connect(token)
          } else {
            // Token invalide, nettoyer
            localStorage.removeItem('sourcekuizz_token')
            localStorage.removeItem('sourcekuizz_user')
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false
            })
          }
        } catch (error) {
          console.error('Erreur lors de l\'initialisation de l\'auth:', error)
          // En cas d'erreur, nettoyer l'état
          localStorage.removeItem('sourcekuizz_token')
          localStorage.removeItem('sourcekuizz_user')
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false
          })
        }
      },

      login: async (credentials: LoginForm) => {
        try {
          set({ isLoading: true })

          const response = await apiService.login(credentials)

          if (response.success && response.user && response.token) {
            // Sauvegarder dans le localStorage
            localStorage.setItem('sourcekuizz_token', response.token)
            localStorage.setItem('sourcekuizz_user', JSON.stringify(response.user))

            set({
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false
            })

            // Connecter le WebSocket
            socketService.connect(response.token)

            toast.success(`Bienvenue, ${response.user.username} !`)
          } else {
            throw new Error(response.message || 'Erreur de connexion')
          }
        } catch (error) {
          set({ isLoading: false })
          const message = error instanceof Error ? error.message : 'Erreur de connexion'
          toast.error(message)
          throw error
        }
      },

      register: async (credentials: RegisterForm) => {
        try {
          set({ isLoading: true })

          const response = await apiService.register(credentials)

          if (response.success && response.user && response.token) {
            // Sauvegarder dans le localStorage
            localStorage.setItem('sourcekuizz_token', response.token)
            localStorage.setItem('sourcekuizz_user', JSON.stringify(response.user))

            set({
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false
            })

            // Connecter le WebSocket
            socketService.connect(response.token)

            toast.success(`Compte créé avec succès ! Bienvenue, ${response.user.username} !`)
          } else {
            throw new Error(response.message || 'Erreur lors de la création du compte')
          }
        } catch (error) {
          set({ isLoading: false })
          const message = error instanceof Error ? error.message : 'Erreur lors de la création du compte'
          toast.error(message)
          throw error
        }
      },

      loginWithTwitch: () => {
        // Rediriger vers l'endpoint d'authentification Twitch
        window.location.href = '/api/auth/twitch'
      },

      logout: () => {
        // Nettoyer le localStorage
        localStorage.removeItem('sourcekuizz_token')
        localStorage.removeItem('sourcekuizz_user')

        // Déconnecter le WebSocket
        socketService.disconnect()

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false
        })

        toast.success('Déconnexion réussie')
      },

      updateProfile: async (updates: Partial<User>) => {
        try {
          const currentUser = get().user
          if (!currentUser) {
            throw new Error('Utilisateur non connecté')
          }

          const response = await apiService.updateProfile(updates)

          if (response.success && response.data) {
            const updatedUser = { ...currentUser, ...response.data }
            
            // Mettre à jour le localStorage
            localStorage.setItem('sourcekuizz_user', JSON.stringify(updatedUser))

            set({
              user: updatedUser
            })

            toast.success('Profil mis à jour avec succès')
          } else {
            throw new Error('Erreur lors de la mise à jour du profil')
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erreur lors de la mise à jour du profil'
          toast.error(message)
          throw error
        }
      }
    }),
    {
      name: 'sourcekuizz-auth',
      partialize: (state) => ({
        // Ne persister que les données essentielles
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)