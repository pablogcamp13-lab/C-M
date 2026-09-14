import type express from 'express';
import type { Advisor, Operation, User, UserRole } from '../src/types';

export type AccessScope = NonNullable<User['accessScope']>;
type RepositoryShape = { advisors?: Advisor[]; operations?: Operation[] };

const jsonIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try { return JSON.parse(String(value || '[]')).map(String).filter(Boolean); } catch { return []; }
};

export const normalizeAccessUser = (row: any): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  username: row.username || undefined,
  role: row.role,
  status: row.status,
  teamId: row.team_id || row.teamId || undefined,
  advisorId: row.advisor_id || row.advisorId || undefined,
  avatar: row.avatar || undefined,
  createdAt: row.created_at || row.createdAt,
  mustChangePassword: Boolean(row.must_change_password ?? row.mustChangePassword),
  accessScope: (row.access_scope || row.accessScope || defaultScope(row.role)) as AccessScope,
  companyIds: jsonIds(row.company_ids_json ?? row.companyIds),
  operationIds: jsonIds(row.operation_ids_json ?? row.operationIds)
});

export const defaultScope = (role: UserRole): AccessScope => role === 'ASESOR'
  ? 'SELF'
  : role === 'SUPERVISOR'
    ? 'TEAM'
    : 'GLOBAL';

export const hasRole = (user: User, roles: UserRole[]) => roles.includes(user.role);

export const canAccessCompany = (user: User, companyId: string) => {
  const scope = user.accessScope || defaultScope(user.role);
  return scope === 'GLOBAL' || (scope === 'COMPANY' && (user.companyIds || []).includes(companyId));
};

export const canAccessOperation = (user: User, operationId: string, repository: RepositoryShape) => {
  const scope = user.accessScope || defaultScope(user.role);
  if (scope === 'GLOBAL') return true;
  if (scope === 'OPERATION') return (user.operationIds || []).includes(operationId);
  const operation = repository.operations?.find(item => item.id === operationId);
  if (scope === 'COMPANY') return Boolean(operation && (user.companyIds || []).includes(operation.companyId));
  return scope === 'TEAM' && (user.operationIds || []).includes(operationId);
};

export const canAccessPerson = (user: User, advisorId: string, repository: RepositoryShape) => {
  if ((user.accessScope || defaultScope(user.role)) === 'SELF') return user.advisorId === advisorId;
  const advisor = repository.advisors?.find(item => item.id === advisorId);
  if (!advisor) return false;
  if (user.role === 'SUPERVISOR' && (advisor.supervisorId === user.id || (user.teamId && advisor.teamId === user.teamId))) return true;
  return advisor.operationId ? canAccessOperation(user, advisor.operationId, repository) : false;
};

export const requireRole = (roles: UserRole[]): express.RequestHandler => (req, res, next) => {
  const user = (req as any).authUser as User | undefined;
  if (!user) return res.status(401).json({ error: 'Sesión no válida o expirada.' });
  if (!hasRole(user, roles)) return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
  next();
};

export const scopedRepository = <T extends RepositoryShape & Record<string, any>>(user: User, source: T): T => {
  const scope = user.accessScope || defaultScope(user.role);
  if (scope === 'GLOBAL') return source;
  const operations = (source.operations || []).filter((operation: Operation) => canAccessOperation(user, operation.id, source));
  const operationIds = new Set(operations.map((operation: Operation) => operation.id));
  const advisors = (source.advisors || []).filter((advisor: Advisor) => scope === 'SELF' ? advisor.id === user.advisorId : advisor.operationId && operationIds.has(advisor.operationId));
  const campaignIds = new Set(operations.map((operation: Operation) => operation.campaignId));
  const companyIds = new Set(operations.map((operation: Operation) => operation.companyId));
  const advisorIds = new Set(advisors.map((advisor: Advisor) => advisor.id));
  return {
    ...source,
    operations,
    advisors,
    companies: (source.companies || []).filter((company: any) => companyIds.has(company.id)),
    campaigns: (source.campaigns || []).filter((campaign: any) => campaignIds.has(campaign.id)),
    teams: (source.teams || []).filter((team: any) => campaignIds.has(team.campaignId)),
    users: (source.users || []).filter((candidate: User) => candidate.id === user.id || candidate.role === 'SUPERVISOR' || (candidate.advisorId && advisorIds.has(candidate.advisorId)))
  };
};
