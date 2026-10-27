export const backlogStatuses={idea:'Idee',planned:'Gepland',in_progress:'In uitvoering',testing:'Te testen',done:'Afgerond',postponed:'Uitgesteld',archived:'Gearchiveerd'} as const;
export const backlogPriorities={low:'Laag',normal:'Normaal',high:'Hoog',urgent:'Urgent'} as const;
export type BacklogItem={id:string;title:string;description:string;module:string;status:keyof typeof backlogStatuses;priority:keyof typeof backlogPriorities;version:number;created_at:string;updated_at:string};
export function backlogInput(form:FormData){
 const title=String(form.get('title')||'').trim(),description=String(form.get('description')||'').trim(),module=String(form.get('module')||'').trim();
 const status=String(form.get('status')||'idea'),priority=String(form.get('priority')||'normal');
 if(!title||title.length>180||description.length>10000||module.length>80||!Object.hasOwn(backlogStatuses,status)||!Object.hasOwn(backlogPriorities,priority))throw Error('BACKLOG_INPUT');
 return {title,description,module,status,priority};
}

const priorityRank:Record<BacklogItem['priority'],number>={urgent:0,high:1,normal:2,low:3};
export function sortBacklogItems(items:BacklogItem[]):BacklogItem[]{
 return [...items].sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||Date.parse(b.updated_at)-Date.parse(a.updated_at)||a.title.localeCompare(b.title,'nl-BE')||a.id.localeCompare(b.id));
}
