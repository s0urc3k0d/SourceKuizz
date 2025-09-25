import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

export interface User {
  id: number;
  username: string;
  email?: string;
  password_hash?: string;
  twitch_id?: string;
  twitch_username?: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
}

export interface Question {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'text';
  correct_answer: string;
  options?: string; // JSON array for multiple choice
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
}

export interface Participant {
  id: number;
  session_id: number;
  user_id?: number;
  nickname: string;
  score: number;
  is_connected: boolean;
  joined_at: string;
  last_activity: string;
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

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'sourcekuizz.db');
  }

  public async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });

      // Connect to database
      this.db = new sqlite3.Database(this.dbPath);
      
      // Enable foreign keys
      await this.run('PRAGMA foreign_keys = ON');
      
      // Create tables
      await this.createTables();
      
      logger.info(`Base de données SQLite initialisée: ${this.dbPath}`);
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation de la base de données:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password_hash TEXT,
        twitch_id VARCHAR(255) UNIQUE,
        twitch_username VARCHAR(50),
        avatar_url TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Quizzes table
      `CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        creator_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        is_public BOOLEAN DEFAULT 1,
        max_participants INTEGER,
        time_limit INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // Questions table
      `CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_type VARCHAR(20) NOT NULL CHECK(question_type IN ('multiple_choice', 'true_false', 'text')),
        correct_answer TEXT NOT NULL,
        options TEXT,
        points INTEGER DEFAULT 10,
        time_limit INTEGER,
        order_index INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
      )`,

      // Quiz sessions table
      `CREATE TABLE IF NOT EXISTS quiz_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        session_code VARCHAR(10) UNIQUE NOT NULL,
        host_id INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'paused', 'completed')),
        current_question_id INTEGER,
        started_at DATETIME,
        ended_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
        FOREIGN KEY (host_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (current_question_id) REFERENCES questions (id)
      )`,

      // Participants table
      `CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        user_id INTEGER,
        nickname VARCHAR(50) NOT NULL,
        score INTEGER DEFAULT 0,
        is_connected BOOLEAN DEFAULT 1,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES quiz_sessions (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )`,

      // Answers table
      `CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        answer TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL,
        points_earned INTEGER DEFAULT 0,
        answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES quiz_sessions (id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants (id) ON DELETE CASCADE
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)',
      'CREATE INDEX IF NOT EXISTS idx_users_twitch_id ON users (twitch_id)',
      'CREATE INDEX IF NOT EXISTS idx_quizzes_creator ON quizzes (creator_id)',
      'CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions (quiz_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_code ON quiz_sessions (session_code)',
      'CREATE INDEX IF NOT EXISTS idx_participants_session ON participants (session_id)',
      'CREATE INDEX IF NOT EXISTS idx_answers_session ON answers (session_id, question_id)'
    ];

    for (const index of indexes) {
      await this.run(index);
    }
  }

  public async run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de données non initialisée'));
        return;
      }

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Erreur SQL:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de données non initialisée'));
        return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('Erreur SQL:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  public async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Base de données non initialisée'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Erreur SQL:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }
}