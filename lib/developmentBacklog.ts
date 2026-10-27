export const backlogStatuses={idea:'Idee',planned:'Gepland',in_progress:'In uitvoering',testing:'Te testen',done:'Afgerond',postponed:'Uitgesteld',archived:'Gearchiveerd'} as const;
export const backlogPriorities={low:'Laag',normal:'Normaal',high:'Hoog',urgent:'Urgent'} as const;
export type BacklogItem={id:string;title:string;description:string;module:string;status:keyof typeof backlogStatuses;priority:keyof typeof backlogPriorities;version:number;created_at:string;updated_at:string};
export function backlogInput(form:FormData){
 const title=String(form.get('title')||'').trim(),description=String(form.get('description')||'').trim(),module=String(form.get('module')||'').trim();
 const status=String(form.get('status')||'idea'),priority=String(form.get('priority')||'normal');
 if(!title||title.length>180||description.length>10000||module.length>80||!Object.hasOwn(backlogStatuses,status)||!Object.hasOwn(backlogPriorities,priority))throw Error('BACKLOG_INPUT');
 return {title,description,module,status,priority};
}
