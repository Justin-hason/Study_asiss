import request from './request';

export type UserRole = 'user' | 'auditor' | 'admin';

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export function login(data: LoginParams): Promise<AuthResult> {
  const formData = new URLSearchParams();
  formData.append('username', data.username);
  formData.append('password', data.password);
  return request.post('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

export function register(data: RegisterParams): Promise<AuthResult> {
  return request.post('/auth/register', data);
}

export function getUserInfo(): Promise<AuthUser> {
  return request.get('/auth/me');
}
