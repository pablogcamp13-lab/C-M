import type { Advisor, Campaign, Company, Operation, Team, User } from '../types';
import type { Calibration, Evaluation, QualityAlert } from '../types';

const TOKEN_KEY = 'CONTACT_CENTER_AUTH_TOKEN';

export interface SharedRepository {
  users: User[];
  campaigns: Campaign[];
  teams: Team[];
  advisors: Advisor[];
  companies?: Company[];
  operations?: Operation[];
}

const json = async <T>(response: Response): Promise<T> => {
  let body: any = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const fallback = response.status === 413
      ? 'El archivo supera el tamaño máximo permitido.'
      : 'No fue posible conectar con el servidor.';
    throw new Error(body.error || fallback);
  }
  return body as T;
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
  async remove(id: string, companyId?: string) {
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    return json<{ repository: SharedRepository }>(await fetch(`/api/admin/campaigns/${id}${query}`, { method: 'DELETE', headers: headers() }));
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
  },
  async update(id: string, changes: Partial<Evaluation>) {
    return json<{ evaluation: Evaluation }>(await fetch(`/api/admin/evaluations/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify(changes) }));
  },
  async remove(id: string) {
    return json<{ deleted: true; id: string }>(await fetch(`/api/evaluations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() }));
  }
};

export const filesApi = {
  async upload(file: File) {
    if (!file.size) throw new Error('El archivo está vacío.');
    if (file.size > 35 * 1024 * 1024) throw new Error('El archivo supera el límite de 35 MB.');
    const mimeType = /\.(mp3|mpeg|mpg)$/i.test(file.name) ? 'audio/mpeg' : file.type || 'application/octet-stream';
    const result = await json<{ file: { id: string; name: string; mimeType: string; size?: string; url?: string } }>(await fetch('/api/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-File-Name': encodeURIComponent(file.name),
        ...headers()
      },
      body: file
    }));
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

export const staffingApi = {
  async history(advisorId:string) { return json<{movements:any[]}>(await fetch(`/api/staffing/${advisorId}/history`, { headers:headers() })); }
};

const queryString=(query:Record<string,unknown>={})=>new URLSearchParams(Object.entries(query).filter(([,value])=>value!==''&&value!==undefined&&value!==null).map(([key,value])=>[key,String(value)])).toString();
const mutate=async<T>(url:string,method:string,body?:unknown)=>json<T>(await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers()},body:body?JSON.stringify(body):undefined}));
export const organizationApi = {
  async dashboard(query:Record<string,unknown>={}) { return json<any>(await fetch(`/api/operations?${queryString(query)}`,{headers:headers()})); },
  async detail(id:string) { return json<any>(await fetch(`/api/operations/${id}`,{headers:headers()})); },
  create(body:any) { return mutate<any>('/api/operations','POST',body); },
  update(id:string,body:any) { return mutate<any>(`/api/operations/${id}`,'PATCH',body); },
  close(id:string,body:any) { return mutate<any>(`/api/operations/${id}/close`,'POST',body); },
  remove(id:string) { return mutate<any>(`/api/operations/${id}`,'DELETE'); },
  async supervisors(id:string) { return json<any>(await fetch(`/api/operations/${id}/supervisors`,{headers:headers()})); },
  addSupervisor(id:string,body:any) { return mutate<any>(`/api/operations/${id}/supervisors`,'POST',body); },
  removeSupervisor(id:string,supervisorId:string,body:any) { return mutate<any>(`/api/operations/${id}/supervisors/${supervisorId}`,'DELETE',body); },
  async staffing(query:Record<string,unknown>={}) { return json<any>(await fetch(`/api/staffing?${queryString(query)}`,{headers:headers()})); },
  importRoster(body:any) { return mutate<any>('/api/staffing/import','POST',body); },
  updateAssignment(id:string,body:any) { return mutate<any>(`/api/staffing/${id}/assignment`,'PATCH',body); },
  bulkMove(body:any) { return mutate<any>('/api/staffing/bulk-move','POST',body); },
  bulkSupervisor(body:any) { return mutate<any>('/api/staffing/bulk-supervisor','POST',body); },
  async movements(query:Record<string,unknown>={}) { return json<any>(await fetch(`/api/staffing/movements?${queryString(query)}`,{headers:headers()})); },
  async inconsistencies() { return json<any>(await fetch('/api/staffing/inconsistencies',{headers:headers()})); },
  resolve(body:any) { return mutate<any>('/api/staffing/resolve','POST',body); },
  reverse(id:string,body:any) { return mutate<any>(`/api/staffing/movements/${id}/reverse`,'POST',body); },
  async exportRows(query:Record<string,unknown>={}) { return json<any>(await fetch(`/api/staffing/export?${queryString(query)}`,{headers:headers()})); }
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
