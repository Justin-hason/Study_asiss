import request from './request';

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
  user: {
    id: number;
    username: string;
    email?: string;
  };
}

export function login(data: LoginParams): Promise<AuthResult> {
  return request.post('/auth/login', data);
}

export function register(data: RegisterParams): Promise<AuthResult> {
  return request.post('/auth/register', data);
}
