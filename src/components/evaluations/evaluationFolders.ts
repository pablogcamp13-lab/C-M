import type { Advisor, Campaign, Company, Evaluation, Operation } from '../../types';

export interface EvaluationCampaignFolder { key:string; id:string; name:string; evaluations:Evaluation[] }
export interface EvaluationCompanyFolder { key:string; id:string; name:string; evaluations:Evaluation[]; campaigns:EvaluationCampaignFolder[] }

const normalized=(value:string)=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE');
const folderOrder=(a:{id:string;name:string},b:{id:string;name:string})=>Number(!a.id)-Number(!b.id)||a.name.localeCompare(b.name,'es-PE');

export function buildEvaluationFolders(evaluations:Evaluation[],companies:Company[],campaigns:Campaign[],operations:Operation[],advisors:Advisor[]):EvaluationCompanyFolder[]{
  const companyById=new Map(companies.map(item=>[item.id,item]));
  const companyByName=new Map(companies.map(item=>[normalized(item.name),item]));
  const campaignById=new Map(campaigns.map(item=>[item.id,item]));
  const campaignByName=new Map(campaigns.map(item=>[normalized(item.name),item]));
  const operationById=new Map(operations.map(item=>[item.id,item]));
  const operationsByCampaign=new Map<string,Operation[]>();
  for(const operation of operations) operationsByCampaign.set(operation.campaignId,[...(operationsByCampaign.get(operation.campaignId)||[]),operation]);
  const advisorById=new Map(advisors.map(item=>[item.id,item]));
  const folders=new Map<string,EvaluationCompanyFolder>();

  for(const evaluation of evaluations){
    const advisor=advisorById.get(evaluation.advisorId);
    const explicitOperation=operationById.get(evaluation.operationId||'');
    const currentOperation=operationById.get(advisor?.operationId||'');
    const matchingOperations=operationsByCampaign.get(evaluation.campaignId)||[];
    const inferredOperation=!evaluation.companyId&&!evaluation.sourceCompanyName?(currentOperation?.campaignId===evaluation.campaignId?currentOperation:matchingOperations.length===1?matchingOperations[0]:undefined):undefined;
    const operation=explicitOperation||inferredOperation;
    const sourceCompany=companyByName.get(normalized(evaluation.sourceCompanyName||''));
    const sourceCampaign=campaignByName.get(normalized(evaluation.sourceCampaignName||''));
    const companyId=operation?.companyId||evaluation.companyId||sourceCompany?.id||'';
    const campaignId=operation?.campaignId||evaluation.campaignId||sourceCampaign?.id||'';
    const companyName=companyById.get(companyId)?.name||'Empresa por relacionar';
    const campaignName=campaignById.get(campaignId)?.name||'Campaña por relacionar';
    const companyKey=companyId||`unassigned:${normalized(companyName)}`;
    const campaignKey=campaignId||`unassigned:${normalized(campaignName)}`;
    let company=folders.get(companyKey);
    if(!company){company={key:companyKey,id:companyId,name:companyName,evaluations:[],campaigns:[]};folders.set(companyKey,company);}
    company.evaluations.push(evaluation);
    let campaign=company.campaigns.find(item=>item.key===campaignKey);
    if(!campaign){campaign={key:campaignKey,id:campaignId,name:campaignName,evaluations:[]};company.campaigns.push(campaign);}
    campaign.evaluations.push(evaluation);
  }
  return [...folders.values()].sort(folderOrder).map(company=>({...company,campaigns:company.campaigns.sort(folderOrder)}));
}
