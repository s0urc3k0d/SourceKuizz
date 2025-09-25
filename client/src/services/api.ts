import axios, { AxiosInstance, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';
import { 
  User, 
  Quiz, 
  Question, 
  QuizSession, 
  AuthResponse, 
  ApiResponse,
  LoginForm,
  RegisterForm,
  CreateQuizForm,
  CreateQuestionForm,
  JoinSessionForm
} from '../types';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor pour ajouter le token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('sourcekuizz_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor pour gérer les erreurs
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expiré ou invalide
          localStorage.removeItem('sourcekuizz_token');
          localStorage.removeItem('sourcekuizz_user');
          window.location.href = '/login';
        }

        const message = error.response?.data?.message || 'Une erreur est survenue';
        toast.error(message);
        
        return Promise.reject(error);
      }
    );
  }

  // Authentication
  async login(credentials: LoginForm): Promise<AuthResponse> {
    const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/login', credentials);
    return response.data;
  }

  async register(credentials: RegisterForm): Promise<AuthResponse> {
    const response: AxiosResponse<AuthResponse> = await this.api.post('/auth/register', credentials);
    return response.data;
  }

  async getMe(): Promise<{ success: boolean; user: User & { stats: any } }> {
    const response = await this.api.get('/auth/me');
    return response.data;
  }

  async updateProfile(updates: Partial<User>): Promise<ApiResponse<User>> {
    const response = await this.api.put('/auth/profile', updates);
    return response.data;
  }

  async verifyToken(token: string): Promise<{ success: boolean; valid: boolean; user?: User }> {
    const response = await this.api.post('/auth/verify-token', { token });
    return response.data;
  }

  async refreshToken(): Promise<AuthResponse> {
    const response = await this.api.post('/auth/refresh');
    return response.data;
  }

  // Quizzes
  async getQuizzes(page = 1, limit = 20): Promise<{
    success: boolean;
    quizzes: Quiz[];
    pagination: { page: number; limit: number; hasMore: boolean };
  }> {
    const response = await this.api.get(`/quiz?page=${page}&limit=${limit}`);
    return response.data;
  }

  async getMyQuizzes(): Promise<{ success: boolean; quizzes: Quiz[] }> {
    const response = await this.api.get('/quiz/my');
    return response.data;
  }

  async getQuiz(id: number): Promise<{
    success: boolean;
    quiz: Quiz & { questions: Question[] };
  }> {
    const response = await this.api.get(`/quiz/${id}`);
    return response.data;
  }

  async createQuiz(quiz: CreateQuizForm): Promise<{ success: boolean; quiz: Quiz }> {
    const response = await this.api.post('/quiz', quiz);
    return response.data;
  }

  async addQuestion(quizId: number, question: CreateQuestionForm): Promise<{
    success: boolean;
    question: Question;
  }> {
    const response = await this.api.post(`/quiz/${quizId}/questions`, question);
    return response.data;
  }

  async deleteQuiz(id: number): Promise<ApiResponse> {
    const response = await this.api.delete(`/quiz/${id}`);
    return response.data;
  }

  // Sessions
  async createSession(quizId: number): Promise<{
    success: boolean;
    session: QuizSession;
  }> {
    const response = await this.api.post(`/quiz/${quizId}/session`);
    return response.data;
  }

  async getSession(code: string): Promise<{
    success: boolean;
    session: QuizSession;
  }> {
    const response = await this.api.get(`/quiz/session/${code}`);
    return response.data;
  }

  // Users
  async getUser(id: number): Promise<{
    success: boolean;
    user: User & { stats: any; recentQuizzes: Quiz[] };
  }> {
    const response = await this.api.get(`/user/${id}`);
    return response.data;
  }

  async getUserQuizzes(id: number, page = 1, limit = 20): Promise<{
    success: boolean;
    user: { id: number; username: string };
    quizzes: Quiz[];
    pagination: { page: number; limit: number; hasMore: boolean };
  }> {
    const response = await this.api.get(`/user/${id}/quizzes?page=${page}&limit=${limit}`);
    return response.data;
  }

  async searchUsers(query: string, limit = 10): Promise<{
    success: boolean;
    users: (User & { quiz_count: number })[];
    searchTerm: string;
  }> {
    const response = await this.api.get(`/user/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.data;
  }

  async getLeaderboard(period: 'all' | 'month' | 'week' = 'all', limit = 20): Promise<{
    success: boolean;
    leaderboard: (User & {
      quiz_count: number;
      total_participants: number;
      total_sessions: number;
    })[];
    period: string;
  }> {
    const response = await this.api.get(`/user/leaderboard?period=${period}&limit=${limit}`);
    return response.data;
  }

  async getActivity(limit = 20): Promise<{
    success: boolean;
    activity: {
      recentQuizzes: Array<{
        id: number;
        title: string;
        creator_username: string;
        creator_avatar?: string;
        created_at: string;
        question_count: number;
      }>;
      recentSessions: Array<{
        session_code: string;
        quiz_title: string;
        host_username: string;
        ended_at: string;
        participant_count: number;
      }>;
    };
  }> {
    const response = await this.api.get(`/user/activity?limit=${limit}`);
    return response.data;
  }

  // Statistics
  async getQuizStats(): Promise<{
    success: boolean;
    stats: {
      totalQuizzes: number;
      activeQuizzes: number;
      totalSessions: number;
      activeSessions: number;
      totalParticipants: number;
      averageScore: number;
    };
  }> {
    const response = await this.api.get('/quiz/stats');
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;