export interface User {
  id: number;
  username: string;
  email?: string;
  avatar_url?: string;
  twitch_username?: string;
  created_at: string;
}

export interface Quiz {
  id: number;
  title: string;
  description?: string;
  creator_id: number;
  is_active: boolean;
  is_public: boolean;
  max_participants?: number;
  time_limit?: number;
  created_at: string;
  updated_at: string;
  questionCount?: number;
  sessionCount?: number;
  totalParticipants?: number;
  creator?: {
    username: string;
    avatar_url?: string;
  };
}

export interface Question {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'text';
  correct_answer?: string; // Hidden from participants
  options?: string[];
  points: number;
  time_limit?: number;
  order_index: number;
  created_at: string;
}

export interface QuizSession {
  id: number;
  quiz_id: number;
  session_code: string;
  host_id: number;
  status: 'waiting' | 'active' | 'paused' | 'completed';
  current_question_id?: number;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  quiz?: {
    id: number;
    title: string;
    description?: string;
  };
  participantCount?: number;
  participants?: Participant[];
}

export interface Participant {
  id: number;
  session_id: number;
  user_id?: number;
  nickname: string;
  score: number;
  isConnected: boolean;
  joined_at: string;
  rank?: number;
}

export interface Answer {
  id: number;
  session_id: number;
  question_id: number;
  participant_id: number;
  answer: string;
  is_correct: boolean;
  points_earned: number;
  answered_at: string;
}

export interface ChatMessage {
  id: number;
  nickname: string;
  message: string;
  timestamp: string;
}

// WebSocket Events
export interface QuizStartedEvent {
  session: QuizSession;
  currentQuestion: Question;
  totalQuestions: number;
}

export interface NextQuestionEvent {
  currentQuestion: Question;
  questionNumber: number;
  totalQuestions: number;
}

export interface AnswerSubmittedEvent {
  questionId: number;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface LeaderboardUpdatedEvent {
  participants: Participant[];
}

export interface QuizEndedEvent {
  results: Array<{
    id: number;
    nickname: string;
    score: number;
    rank: number;
  }>;
  totalParticipants: number;
}

export interface SessionJoinedEvent {
  session: QuizSession;
  participant: Participant;
  quiz: {
    id: number;
    title: string;
    description?: string;
    questionCount: number;
  } | null;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
  token?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

// Form Types
export interface LoginForm {
  username: string;
  password: string;
}

export interface RegisterForm {
  username: string;
  password: string;
  email?: string;
}

export interface CreateQuizForm {
  title: string;
  description?: string;
  isPublic?: boolean;
  maxParticipants?: number;
  timeLimit?: number;
}

export interface CreateQuestionForm {
  questionText: string;
  questionType: 'multiple_choice' | 'true_false' | 'text';
  correctAnswer: string;
  options?: string[];
  points?: number;
  timeLimit?: number;
}

export interface JoinSessionForm {
  sessionCode: string;
  nickname?: string;
}

// Store Types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginForm) => Promise<void>;
  register: (credentials: RegisterForm) => Promise<void>;
  loginWithTwitch: () => void;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

export interface QuizState {
  quizzes: Quiz[];
  currentQuiz: Quiz | null;
  currentSession: QuizSession | null;
  currentQuestion: Question | null;
  participants: Participant[];
  chatMessages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchQuizzes: () => Promise<void>;
  fetchMyQuizzes: () => Promise<void>;
  createQuiz: (quiz: CreateQuizForm) => Promise<Quiz>;
  addQuestion: (quizId: number, question: CreateQuestionForm) => Promise<void>;
  createSession: (quizId: number) => Promise<QuizSession>;
  joinSession: (form: JoinSessionForm) => Promise<void>;
  leaveSession: () => void;
  startQuiz: () => void;
  nextQuestion: () => void;
  submitAnswer: (answer: string) => void;
  pauseQuiz: () => void;
  resumeQuiz: () => void;
  endQuiz: () => void;
  sendChatMessage: (message: string) => void;
}

export interface SocketState {
  socket: any | null;
  isConnected: boolean;
  connect: (token?: string) => void;
  disconnect: () => void;
}

// Component Props Types
export interface QuizCardProps {
  quiz: Quiz;
  showActions?: boolean;
  onPlay?: (quiz: Quiz) => void;
  onEdit?: (quiz: Quiz) => void;
  onDelete?: (quiz: Quiz) => void;
}

export interface ParticipantListProps {
  participants: Participant[];
  showScores?: boolean;
  currentUserId?: number;
}

export interface QuestionDisplayProps {
  question: Question;
  onAnswer?: (answer: string) => void;
  timeRemaining?: number;
  disabled?: boolean;
  showCorrectAnswer?: boolean;
}

export interface LeaderboardProps {
  participants: Participant[];
  title?: string;
  showRanks?: boolean;
}

export interface ChatProps {
  messages: ChatMessage[];
  onSendMessage?: (message: string) => void;
  disabled?: boolean;
}