import type { Advisor, Campaign, Team, User } from '../types';
import type { Calibration, Evaluation, QualityAlert } from '../types';

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
  },
  async changePassword(password: string): Promise<User> {
    const result = await json<{ user: User }>(await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ password }) }));
    return result.user;
  }
};

export const adminUsersApi = {
  async create(data: Partial<User>) { return json<{ user: User }>(await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(data) })); },
  async update(id: string, data: Partial<User>) { return json<{ user: User }>(await fetch(`/api/admin/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(data) })); },
  async resetPassword(id: string) { return json<{ ok: true }>(await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST', headers: headers() })); },
  async remove(id: string) { await json(await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: headers() })); }
};

export const adminCampaignsApi = {
  async remove(id: string) {
    const response = await fetch(`/api/admin/campaigns/${id}`, { method: 'DELETE', headers: headers() });
    if (!response.ok) throw new Error((await response.json()).error || 'No se pudo eliminar la campaña.');
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
    return json<{ evaluation: Evaluation; deduplicated?: boolean }>(await fetch('/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(evaluation) }));
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

export const qualityAlertsApi = {
  async list() { return json<{ alerts: QualityAlert[] }>(await fetch('/api/quality-alerts', { headers: headers() })); },
  async create(data: Partial<QualityAlert>) { return json<{ alert: QualityAlert }>(await fetch('/api/quality-alerts', { method:'POST', headers:{'Content-Type':'application/json',...headers()}, body:JSON.stringify(data) })); },
  async update(id: string, data: Partial<QualityAlert>) { return json<{ alert: QualityAlert }>(await fetch(`/api/quality-alerts/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json',...headers()}, body:JSON.stringify(data) })); },
  async remove(id: string) { return json<{ ok:boolean }>(await fetch(`/api/quality-alerts/${id}`, { method:'DELETE', headers:headers() })); }
};

export const calibrationsApi = {
  async list() { return json<{ calibrations: Calibration[] }>(await fetch('/api/calibrations', { headers:headers() })); },
  async create(data: Record<string,unknown>) { return json<{ calibration:Calibration }>(await fetch('/api/calibrations', { method:'POST', headers:{'Content-Type':'application/json',...headers()}, body:JSON.stringify(data) })); },
  async update(id:string,data:Record<string,unknown>) { return json<{calibration:Calibration}>(await fetch(`/api/calibrations/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify(data)})); },
  async transition(id:string,status:string) { return json<{calibration:Calibration}>(await fetch(`/api/calibrations/${id}/state`,{method:'PATCH',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify({status})})); },
  async invite(id:string) { return json<{calibration:Calibration;results:any[]}>(await fetch(`/api/calibrations/${id}/invitations`,{method:'POST',headers:headers()})); },
  async respond(id:string,data:Record<string,unknown>) { return json<{calibration:Calibration}>(await fetch(`/api/calibrations/${id}/respond`,{method:'PATCH',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify(data)})); },
  async remove(id:string) { return json<{ok:boolean}>(await fetch(`/api/calibrations/${id}`,{method:'DELETE',headers:headers()})); }
};

export const platformStateApi = {
  async load(): Promise<any | null> { const result = await json<{ state: any | null }>(await fetch('/api/platform-state', { headers: headers() })); return result.state; },
  async save(state: any) { return json(await fetch('/api/platform-state', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(state) })); }
};

export const developmentApi = {
  async capsules() { return json<{ capsules: any[] }>(await fetch('/api/development/capsules', { headers: headers() })); },
  async createCapsule(data: any) { return json<{ capsule: any }>(await fetch('/api/development/capsules', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(data) })); },
  async updateCapsule(id: string, data: any) { return json<{ capsule: any }>(await fetch(`/api/development/capsules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(data) })); },
  async duplicateCapsule(id: string) { return json<{ capsule: any }>(await fetch(`/api/development/capsules/${id}/duplicate`, { method: 'POST', headers: headers() })); },
  async removeCapsule(id: string) { await fetch(`/api/development/capsules/${id}`, { method: 'DELETE', headers: headers() }); },
  async assignments() { return json<{ assignments: any[] }>(await fetch('/api/development/assignments', { headers: headers() })); },
  async assign(data: any) { return json<{ assignments: any[] }>(await fetch('/api/development/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(data) })); },
  async forum(capsuleId: string) { return json<{ posts: any[] }>(await fetch(`/api/development/capsules/${capsuleId}/forum`, { headers: headers() })); },
  async updateAssignment(id: string, data: any) { return json<{ assignment: any }>(await fetch(`/api/development/assignments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(data) })); }
};
