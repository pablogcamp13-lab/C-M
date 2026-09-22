import type { SharedRepository } from './googleStorage';

// Persist only the people changed by a roster import and their direct relations.
// A full repository replay can take minutes and reprocess unrelated legacy data.
export function rosterImportSnapshot(repository: SharedRepository, advisorIds: string[]): SharedRepository {
  const selectedIds = new Set(advisorIds);
  const advisors = repository.advisors.filter(item => selectedIds.has(item.id));
  const operationAssignments = (repository.operationAssignments || []).filter(item => selectedIds.has(item.advisorId));
  const staffingMovements = (repository.staffingMovements || []).filter(item => selectedIds.has(item.advisorId));
  const teamIds = new Set([...advisors.map(item => item.teamId), ...operationAssignments.map(item => item.teamId)].filter((id): id is string => Boolean(id)));
  const teams = repository.teams.filter(item => teamIds.has(item.id));
  const campaignIds = new Set([...advisors.map(item => item.campaignId), ...teams.map(item => item.campaignId)].filter(Boolean));
  const operationIds = new Set([...advisors.map(item => item.operationId), ...operationAssignments.map(item => item.operationId)].filter((id): id is string => Boolean(id)));
  const operations = (repository.operations || []).filter(item => operationIds.has(item.id) || campaignIds.has(item.campaignId));
  for (const item of operations) campaignIds.add(item.campaignId);
  const supervisorIds = new Set([...advisors.map(item => item.supervisorId), ...teams.map(item => item.supervisorId), ...operationAssignments.map(item => item.supervisorId)].filter((id): id is string => Boolean(id)));
  const operationSupervisors = (repository.operationSupervisors || []).filter(item => operationIds.has(item.operationId) && supervisorIds.has(item.supervisorId));
  const userIds = new Set([...supervisorIds, ...operationAssignments.map(item => item.actorId), ...staffingMovements.map(item => item.actorId)].filter((id): id is string => Boolean(id)));
  return {
    advisors,
    operationAssignments,
    staffingMovements,
    teams,
    operations,
    operationSupervisors,
    campaigns: repository.campaigns.filter(item => campaignIds.has(item.id)),
    companies: (repository.companies || []).filter(item => operations.some(operation => operation.companyId === item.id)),
    users: repository.users.filter(item => userIds.has(item.id) || Boolean(item.advisorId && selectedIds.has(item.advisorId)))
  };
}

export type RepositoryDeltaScope = { advisorIds?: string[]; operationIds?: string[]; campaignIds?: string[]; userIds?: string[] };

// Dependency-complete delta: runtime writes never replay unrelated roster rows.
export function repositoryDeltaSnapshot(repository: SharedRepository, scope: RepositoryDeltaScope): SharedRepository {
  const advisorIds=new Set(scope.advisorIds||[]),operationIds=new Set(scope.operationIds||[]),campaignIds=new Set(scope.campaignIds||[]),userIds=new Set(scope.userIds||[]);
  for(const advisor of repository.advisors)if(operationIds.has(advisor.operationId||'')||campaignIds.has(advisor.campaignId))advisorIds.add(advisor.id);
  let advisors=repository.advisors.filter(item=>advisorIds.has(item.id));
  const operationAssignments=(repository.operationAssignments||[]).filter(item=>advisorIds.has(item.advisorId)||operationIds.has(item.operationId));
  const staffingMovements=(repository.staffingMovements||[]).filter(item=>advisorIds.has(item.advisorId));
  for(const item of advisors){campaignIds.add(item.campaignId);if(item.operationId)operationIds.add(item.operationId);if(item.supervisorId)userIds.add(item.supervisorId);}
  for(const item of operationAssignments){advisorIds.add(item.advisorId);operationIds.add(item.operationId);if(item.supervisorId)userIds.add(item.supervisorId);if(item.actorId)userIds.add(item.actorId);}
  for(const item of staffingMovements)if(item.actorId)userIds.add(item.actorId);
  advisors=repository.advisors.filter(item=>advisorIds.has(item.id));
  const operations=(repository.operations||[]).filter(item=>operationIds.has(item.id)||campaignIds.has(item.campaignId));
  for(const item of operations){operationIds.add(item.id);campaignIds.add(item.campaignId);}
  const teamIds=new Set([...advisors.map(item=>item.teamId),...operationAssignments.map(item=>item.teamId)].filter((id):id is string=>Boolean(id)));
  const teams=repository.teams.filter(item=>teamIds.has(item.id));
  for(const item of teams)userIds.add(item.supervisorId);
  const operationSupervisors=(repository.operationSupervisors||[]).filter(item=>operationIds.has(item.operationId));
  for(const item of operationSupervisors)userIds.add(item.supervisorId);
  return {advisors,operationAssignments,staffingMovements,teams,operations,operationSupervisors,campaigns:repository.campaigns.filter(item=>campaignIds.has(item.id)),companies:(repository.companies||[]).filter(item=>operations.some(operation=>operation.companyId===item.id)),users:repository.users.filter(item=>userIds.has(item.id)||Boolean(item.advisorId&&advisorIds.has(item.advisorId)))};
}
