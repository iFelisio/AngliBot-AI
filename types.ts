
export type ThemeColor = 'blue' | 'red' | 'grey' | 'black' | 'purple' | 'default' | 'cyan' | 'orange' | 'green' | 'pink' | 'emerald' | 'amber' | 'rose';
export type Proficiency = 'Beginner' | 'Intermediate' | 'Advanced';
export type Goal = 'Conversational' | 'Business' | 'Exam Prep' | 'Travel';
export type AuthProvider = 'email' | 'admin';

export interface User {
  id: string;
  name: string;
  isAdmin: boolean;
  streak: number;
  lastLogin: string;
  points: number;
  badges: string[];
  proficiency?: Proficiency;
  goal?: Goal;
  password?: string;
}

export interface Dialogue {
  id: string;
  title: string;
  content: string;
  audioData?: string; // Base64 audio string
  videoData?: string; // Base64 video string
  addedBy: string;
  level: Proficiency;
}

export interface Suggestion {
  id: string;
  userId: string;
  userName: string;
  text: string;
  date: string;
  adminResponse?: string;
}

export interface LoginEvent {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface AnimationMedia {
  id: string;
  title: string;
  videoData: string;
  addedBy: string;
}
