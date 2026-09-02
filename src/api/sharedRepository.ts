import type { Advisor, Campaign, Team, User } from '../types';
import type { Evaluation } from '../types';

const TOKEN_KEY = 'CONTACT_CENTER_AUTH_TOKEN';

export interface SharedRepository {
  users: User[];
  campaigns: Campaign[];
  teams: Team[];
  advisors: Advisor[];
}

const json = async <T>(response: Response): Promise<T> => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No fue posible conectar con el servidor.');
  return body;
};

const headers = () => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const authApi = {
  token: () => sessionStorage.getItem(TOKEN_KEY),
  async login(identity: string, password: string): Promise<User> {
    const result = await json<{ token: string; user: User }>(await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity, password })
    }));
    sessionStorage.setItem(TOKEN_KEY, result.token);
    return result.user;
  },
  async currentUser(): Promise<User> {
    const result = await json<{ user: User }>(await fetch('/api/auth/me', { headers: headers() }));
    return result.user;
  },
  async logout() {
    await fetch('/api/auth/logout', { method: 'POST', headers: headers() });
    sessionStorage.removeItem(TOKEN_KEY);
  }
};

export const sharedRepositoryApi = {
  async migrate(repository: SharedRepository) {
    return json<{ repository: SharedRepository }>(await fetch('/api/shared-repository/migrate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(repository)
    }));
  },
  async load(): Promise<SharedRepository> {
    const result = await json<{ repository: SharedRepository }>(await fetch('/api/shared-repository', { headers: headers() }));
    return result.repository;
  },
  async sync(repository: SharedRepository) {
    return json<{ repository: SharedRepository }>(await fetch('/api/shared-repository/sync', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(repository)
    }));
  }
};

export const evaluationsApi = {
  async create(evaluation: Evaluation) {
    return json(await fetch('/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(evaluation) }));
  }
};

export const filesApi = {
  async upload(file: File) {
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('No fue posible leer el archivo.')); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
    const mimeType = /\.(mp3|mpeg|mpg)$/i.test(file.name) ? 'audio/mpeg' : file.type || 'application/octet-stream';
    const result = await json<{ file: { id: string; name: string; mimeType: string; size?: string; url?: string } }>(await fetch('/api/files/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ name: file.name, mimeType, base64 }) }));
    return result.file;
  }
};

export const platformStateApi = {
  async load(): Promise<any | null> { const result = await json<{ state: any | null }>(await fetch('/api/platform-state', { headers: headers() })); return result.state; },
  async save(state: any) { return json(await fetch('/api/platform-state', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(state) })); }
};
