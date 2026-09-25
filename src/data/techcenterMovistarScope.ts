export const TECHCENTER_MOVISTAR_FORM_ID = 'TECHCENTER_MOVISTAR_OUT_V1';
export const TECHCENTER_MOVISTAR_CAMPAIGN = 'Movistar Portabilidad Out';

const normalize = (value:string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('es-PE');
export const isTechcenterMovistarCampaign = (companyName:string,campaignName:string,companyId='') => (companyId==='company_techcenter'||/^tech\s*center(?:\b|\s|$)/.test(normalize(companyName))) && [normalize(TECHCENTER_MOVISTAR_CAMPAIGN),'movistar portabilida out'].includes(normalize(campaignName));
